import {
  ConversationId,
  EmailDraftId,
  EmailFileId,
  EmailId,
} from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import { boundedEmailBody, verifyEmailSignature } from "@froggy/email";
import {
  EmailClaim,
  EmailDelivery,
  EmailDraftRequest,
  EmailInbound,
  EmailMove,
  EmailRevision,
} from "@froggy/protocol";
import { Redacted, Schema } from "effect";

import type { Notices } from "./notices";
import type { Services } from "./services";
import type { TaskCaller } from "./tasks";

const json = (data: Schema.Json, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });
export const ensureEmailConversation = async (
  services: Services,
  userId: UserId,
  id: ConversationId
) => {
  await services.store.history.transaction(userId, async (tx) => {
    if (await tx.get(id)) {
      return;
    }
    const now = Date.now();
    await tx.save(
      {
        v: 1,
        kind: "conversation",
        id,
        title: "Email",
        preview: "Your Froggy email messages and drafts.",
        externalKey: "email",
        source: "web",
        archived: false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
      0
    );
  });
};
export const requireEmailConversation = async (
  services: Services,
  userId: UserId,
  id: ConversationId
) => {
  const conversation = await services.store.history.get(userId, id);
  if (conversation?.kind !== "conversation") {
    throw new Error("Conversation unavailable.");
  }
};
interface EmailRouteContext {
  services: Services;
  email: NonNullable<Services["email"]>;
  userId: UserId;
  request: Request;
  url: URL;
  resource: string | undefined;
  id: string | undefined;
  action: string | undefined;
}
const messageRoutes = async (
  context: EmailRouteContext
): Promise<Response | null> => {
  const { services, email, userId, request, url, resource, id } = context;
  if (resource === "messages" && id === undefined && request.method === "GET") {
    const conversation = url.searchParams.get("conversation");
    const conversationId =
      conversation === null
        ? undefined
        : Schema.decodeUnknownSync(ConversationId)(conversation);
    return json(
      await email.page(
        userId,
        conversationId,
        (url.searchParams.get("q") ?? "").slice(0, 200),
        url.searchParams.get("before") ?? undefined
      )
    );
  }
  if (resource === "messages" && id !== undefined) {
    const emailId = Schema.decodeUnknownSync(EmailId)(id);
    if (request.method === "GET") {
      return json({ v: 1, message: await email.read(userId, emailId) });
    }
    if (request.method === "DELETE") {
      await email.remove(userId, emailId);
      return json({ v: 1, deleted: true });
    }
    if (request.method === "PATCH") {
      const body = Schema.decodeUnknownSync(EmailMove)(await request.json());
      await requireEmailConversation(services, userId, body.conversationId);
      await email.move(userId, emailId, body.conversationId);
      return json({ v: 1, moved: true });
    }
  }

  return null;
};
const fileRoutes = async (
  context: EmailRouteContext
): Promise<Response | null> => {
  const { email, userId, request, resource, id } = context;
  if (resource === "files") {
    if (id === undefined && request.method === "POST") {
      const bytes = await boundedEmailBody(request, 25 * 1024 * 1024);
      const file = await email.upload(
        userId,
        decodeURIComponent(request.headers.get("x-file-name") ?? "attachment"),
        request.headers.get("content-type") ?? "application/octet-stream",
        bytes
      );
      return json({ v: 1, file });
    }
    const fileId = Schema.decodeUnknownSync(EmailFileId)(id);
    if (request.method === "DELETE") {
      await email.removeFile(userId, fileId);
      return json({ v: 1, deleted: true });
    }
    if (request.method === "GET") {
      const { metadata, bytes } = await email.file(userId, fileId);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
  }

  return null;
};
const draftRoutes = async (
  context: EmailRouteContext
): Promise<Response | null> => {
  const { services, email, userId, request, resource, id, action } = context;
  if (resource === "drafts") {
    if (id === undefined && request.method === "POST") {
      const body = Schema.decodeUnknownSync(EmailDraftRequest)(
        await request.json()
      );
      await requireEmailConversation(services, userId, body.conversationId);
      return json({ v: 1, draft: await email.draft(userId, body) });
    }
    const draftId = Schema.decodeUnknownSync(EmailDraftId)(id);
    if (request.method === "GET") {
      return json({ v: 1, draft: await email.draftStatus(userId, draftId) });
    }
    if (request.method === "PATCH") {
      const body = Schema.decodeUnknownSync(
        Schema.Struct({ ...EmailDraftRequest.fields, revision: Schema.Int })
      )(await request.json());
      await requireEmailConversation(services, userId, body.conversationId);
      return json({
        v: 1,
        draft: await email.draft(userId, body, draftId, body.revision),
      });
    }
    if (request.method === "POST") {
      const body = Schema.decodeUnknownSync(EmailRevision)(
        await request.json()
      );
      if (action === "approve") {
        return json({
          v: 1,
          draft: await email.approve(userId, draftId, body.revision),
        });
      }
      if (action === "discard") {
        await email.discard(userId, draftId, body.revision);
        return json({ v: 1, discarded: true });
      }
    }
  }

  return null;
};

export const handleEmail = async (
  services: Services,
  caller: TaskCaller,
  request: Request
): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/email")) {
    return null;
  }
  if (caller.grantId || caller.agentTokenId) {
    return json(
      {
        v: 1,
        error:
          "Use the explicitly scoped email MCP tools. Only a person can approve sending.",
      },
      403
    );
  }
  const { email } = services;
  if (!email) {
    return json({ v: 1, error: "Email is not configured." }, 503);
  }
  const { userId } = caller;
  const parts = url.pathname.split("/").slice(3);
  const [resource, id, action] = parts;
  try {
    if (resource === "status" && request.method === "GET") {
      return json(await email.status(userId));
    }
    if (resource === "claim" && request.method === "POST") {
      if (!services.environment.allowStubs && email.transport.stubbed) {
        return json({ v: 1, error: "A real email provider is required." }, 503);
      }
      const body = Schema.decodeUnknownSync(EmailClaim)(await request.json());
      const mailbox = await email.claim(userId, body.handle);
      await ensureEmailConversation(services, userId, mailbox.conversationId);
      return json(await email.status(userId));
    }
    if (resource === "disable" && request.method === "POST") {
      await email.disable(userId);
      return json({ v: 1, disabled: true });
    }
    const context = {
      services,
      email,
      userId,
      request,
      url,
      resource,
      id,
      action,
    };
    const response =
      (await messageRoutes(context)) ??
      (await fileRoutes(context)) ??
      (await draftRoutes(context));
    if (response) {
      return response;
    }
    return json({ v: 1, error: "Unknown email route." }, 404);
  } catch (error) {
    return json(
      {
        v: 1,
        error:
          error instanceof Error
            ? error.message.slice(0, 300)
            : "Email request failed.",
      },
      400
    );
  }
};
export const handleEmailWebhook = async (
  services: Services,
  notices: Notices,
  request: Request
): Promise<Response | null> => {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/webhooks/email/")) {
    return null;
  }
  const config = services.environment.email;
  const { email } = services;
  if (!config || !email || request.method !== "POST") {
    return json({ v: 1, error: "Email webhook unavailable." }, 503);
  }
  try {
    const bytes = await boundedEmailBody(request, 16_384);
    if (
      !(await verifyEmailSignature(
        Redacted.value(config.secret),
        request,
        bytes
      ))
    ) {
      return json({ v: 1, error: "Unauthorized." }, 401);
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (path === "/webhooks/email/recipient") {
      const input = Schema.decodeUnknownSync(
        Schema.Struct({ v: Schema.Literal(1), to: Schema.String })
      )(body);
      return json({
        v: 1,
        accepted: (await email.recipient(input.to)) !== null,
      });
    }
    if (path === "/webhooks/email/delivery") {
      const input = Schema.decodeUnknownSync(EmailDelivery)(body);
      await email.delivery(input.providerId, input.recipient, input.status);
      return json({ v: 1, accepted: true });
    }
    if (path === "/webhooks/email/inbound") {
      const input = Schema.decodeUnknownSync(EmailInbound)(body);
      const outcome = await email.ingest(input);
      if (outcome.message) {
        await ensureEmailConversation(
          services,
          outcome.userId,
          outcome.message.conversationId
        );
        if (!outcome.message.automatic) {
          await notices.post(outcome.userId, {
            source: "email",
            text: `New email in Froggy. ${services.environment.appOrigin}/chat/${outcome.message.conversationId}`,
          });
        }
      }
      return json({ v: 1, accepted: true });
    }
    return json({ v: 1, error: "Unknown webhook." }, 404);
  } catch {
    return json(
      { v: 1, error: "Email processing failed; retry this delivery." },
      503
    );
  }
};
