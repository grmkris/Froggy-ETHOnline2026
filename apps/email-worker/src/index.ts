import {
  boundedEmailBody,
  emailSignature,
  sha256,
  verifyEmailSignature,
} from "@froggy/email/auth";
import { EmailInbound, EmailWorkerSend } from "@froggy/protocol";
import { Effect, Schema } from "effect";

interface SendingBinding {
  send: (message: {
    from: string;
    to: readonly string[];
    cc: readonly string[];
    bcc: readonly string[];
    subject: string;
    text: string;
    replyTo: string;
    headers: Record<string, string>;
    attachments: {
      filename: string;
      type: string;
      content: ArrayBuffer;
      disposition: "attachment";
    }[];
  }) => Promise<{ messageId: string }>;
}
interface Env {
  GATEWAY_URL: string;
  EMAIL_DOMAIN: string;
  EMAIL_WEBHOOK_SECRET: string;
  FILES: R2Bucket;
  INCOMING: Queue;
  EMAIL: SendingBinding;
  SENDS: DurableObjectNamespace;
}
const json = (body: Schema.Json, status = 200) =>
  Response.json(body, { status });
export const gateway = async (
  env: Pick<Env, "EMAIL_WEBHOOK_SECRET" | "GATEWAY_URL">,
  path: string,
  body: Schema.Json
): Promise<Response> => {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const headers = await emailSignature(
    env.EMAIL_WEBHOOK_SECRET,
    "POST",
    path,
    bytes
  );
  headers.set("content-type", "application/json");
  const response = await fetch(new URL(path, env.GATEWAY_URL), {
    method: "POST",
    headers,
    body: bytes,
    // Workers supports manual redirects; the status check rejects every redirect.
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Gateway HTTP ${response.status}`);
  }
  return response;
};
const Recipient = Schema.Struct({
  v: Schema.Literal(1),
  accepted: Schema.Boolean,
});
const DeliveryEvent = Schema.Struct({
  type: Schema.Literals([
    "cf.email.sending.message.delivered",
    "cf.email.sending.message.bounced",
    "cf.email.sending.message.deferred",
  ]),
  payload: Schema.Struct({
    messageId: Schema.String,
    recipient: Schema.String,
  }),
});
export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    const domain = message.to.split("@")[1]?.toLowerCase();
    if (domain !== env.EMAIL_DOMAIN || message.rawSize > 25 * 1024 * 1024) {
      message.setReject("Recipient unavailable or message too large.");
      return;
    }
    // If Froggy is temporarily down, retain the bounded raw message for the queue.
    let recipient: typeof Recipient.Type | null = null;
    try {
      const resolvedEmail0 = await gateway(env, "/webhooks/email/recipient", {
        v: 1,
        to: message.to,
      });
      recipient = Schema.decodeUnknownSync(Recipient)(
        await resolvedEmail0.json()
      );
    } catch {
      recipient = null;
    }
    if (recipient?.accepted === false) {
      message.setReject("Recipient unavailable or mailbox full.");
      return;
    }
    const bytes = await boundedEmailBody(
      new Response(message.raw),
      25 * 1024 * 1024
    );
    const to = message.to.toLowerCase();
    const key = await sha256(
      new TextEncoder().encode(`${to}\0${await sha256(bytes)}`)
    );
    await env.FILES.put(`raw-${key}`, bytes);
    await env.INCOMING.send({
      v: 1,
      key,
      to,
      from: message.from,
      size: bytes.length,
    });
  },
  async queue(batch: MessageBatch, env: Env) {
    await Effect.runPromise(
      Effect.forEach(
        batch.messages,
        (message) =>
          Effect.promise(async () => {
            let stage = "decode";
            try {
              const inbound = Schema.decodeUnknownResult(EmailInbound)(
                message.body
              );
              if (inbound._tag === "Success") {
                stage = "inbound";
                await gateway(env, "/webhooks/email/inbound", inbound.success);
              } else {
                const event = Schema.decodeUnknownSync(DeliveryEvent)(
                  message.body
                );
                if (event.type !== "cf.email.sending.message.deferred") {
                  stage = "delivery";
                  await gateway(env, "/webhooks/email/delivery", {
                    v: 1,
                    providerId: event.payload.messageId,
                    recipient: event.payload.recipient,
                    status: event.type.endsWith(".delivered")
                      ? "delivered"
                      : "bounced",
                  });
                }
              }
              message.ack();
            } catch (error) {
              console.warn("Email queue retry", {
                stage,
                status:
                  error instanceof Error &&
                  /^Gateway HTTP \d{3}$/u.test(error.message)
                    ? error.message
                    : "processing failed",
                errorName: error instanceof Error ? error.name : "unknown",
              });
              message.retry({ delaySeconds: 60 });
            }
          }),
        { concurrency: 1 }
      )
    );
  },
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    try {
      const bytes = await boundedEmailBody(request, 25 * 1024 * 1024);
      if (
        !(await verifyEmailSignature(env.EMAIL_WEBHOOK_SECRET, request, bytes))
      ) {
        return json({ v: 1, error: "Unauthorized" }, 401);
      }
      if (/^\/sends\/emd_[a-z0-9]+$/u.test(path) && request.method === "GET") {
        return await env.SENDS.get(
          env.SENDS.idFromName(path.slice("/sends/".length))
        ).fetch(new Request("https://send.internal/", { method: "GET" }));
      }
      if (path === "/send" && request.method === "POST") {
        const input = Schema.decodeUnknownSync(EmailWorkerSend)(
          JSON.parse(new TextDecoder().decode(bytes))
        );
        if (input.from.split("@")[1] !== env.EMAIL_DOMAIN) {
          return json({ v: 1, error: "Sender domain rejected" }, 400);
        }
        return await env.SENDS.get(env.SENDS.idFromName(input.id)).fetch(
          new Request("https://send.internal/", {
            method: "POST",
            body: JSON.stringify(input),
          })
        );
      }
      const key = decodeURIComponent(path.slice("/objects/".length));
      if (
        !path.startsWith("/objects/") ||
        !/^(?:emf_[a-z0-9]+|raw-[a-f0-9]{64})$/u.test(key)
      ) {
        return json({ v: 1, error: "Unknown object" }, 404);
      }
      if (request.method === "PUT") {
        await env.FILES.put(key, bytes);
        return json({ v: 1, saved: true });
      }
      if (request.method === "DELETE") {
        await env.FILES.delete(key);
        return json({ v: 1, deleted: true });
      }
      if (request.method === "GET") {
        const object = await env.FILES.get(key);
        return object
          ? new Response(object.body)
          : json({ v: 1, error: "Object unavailable" }, 404);
      }
      return json({ v: 1, error: "Unsupported method" }, 405);
    } catch {
      return json({ v: 1, error: "Email transport failed" }, 503);
    }
  },
};

/** Persist before the external call. Replay can inspect an attempt, never repeat it. */
export class EmailSend {
  readonly state: DurableObjectState;
  readonly env: Env;
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET") {
      const attempt = await this.state.storage.get<{
        messageId: string | null;
      }>("attempt");
      return json({ v: 1, messageId: attempt?.messageId ?? null });
    }
    const input = Schema.decodeUnknownSync(EmailWorkerSend)(
      await request.json()
    );
    const digest = await sha256(
      new TextEncoder().encode(JSON.stringify(input))
    );
    const claim = await this.state.storage.transaction(async (tx) => {
      const prior = await tx.get<{ digest: string; messageId: string | null }>(
        "attempt"
      );
      if (prior) {
        return { prior, claimed: false };
      }
      await tx.put("attempt", { digest, messageId: null });
      return { prior: { digest, messageId: null }, claimed: true };
    });
    if (claim.prior.digest !== digest) {
      return json({ v: 1, error: "Draft revision mismatch" }, 409);
    }
    if (!claim.claimed) {
      return claim.prior.messageId === null
        ? json(
            { v: 1, error: "Delivery uncertain; inspect provider logs" },
            409
          )
        : json({ v: 1, messageId: claim.prior.messageId });
    }
    const attachments: Parameters<SendingBinding["send"]>[0]["attachments"] =
      [];
    await Effect.runPromise(
      Effect.forEach(
        input.files,
        (file) =>
          Effect.promise(async () => {
            const object = await this.env.FILES.get(file.id);
            if (!object) {
              throw new Error("Attachment unavailable");
            }
            const bytes = await object.arrayBuffer();
            if ((await sha256(new Uint8Array(bytes))) !== file.hash) {
              throw new Error("Attachment changed");
            }
            attachments.push({
              filename: file.name,
              type: file.mime,
              content: bytes,
              disposition: "attachment" as const,
            });
          }),
        { concurrency: 1 }
      )
    );
    const headers: Record<string, string> = {};
    const last = input.references.at(-1);
    if (last !== undefined) {
      headers["In-Reply-To"] = last;
      headers["References"] = input.references.join(" ");
    }
    const result = await this.env.EMAIL.send({
      from: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      text: input.text,
      replyTo: input.replyAddress,
      headers,
      attachments,
    });
    await this.state.storage.put("attempt", {
      digest,
      messageId: result.messageId,
    });
    return json({ v: 1, messageId: result.messageId });
  }
}
