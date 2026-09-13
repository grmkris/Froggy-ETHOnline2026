import type { UserId } from "@froggy/domain";
import { CardCheckoutId, PaymentMethod, PaymentMethodId } from "@froggy/domain";
import {
  CardCheckoutApprove,
  CardCheckoutList,
  CardCheckoutPrepare,
  CardCheckoutReconcile,
  CardCheckoutControl,
  CardCheckoutView,
  PaymentMethodSave,
  PaymentMethods,
  TradeAuthorization,
} from "@froggy/protocol";
import { Schema } from "effect";

import { bearerFromRequest } from "./auth";
import {
  controlCurrentHostedBrowse,
  purchaseHostedBrowse,
  reconcileHostedPurchase,
} from "./hosted-browse";
import { boundedBytes } from "./outbound";
import type { Services } from "./services";
import type { TaskCaller } from "./tasks";
import type { Workspace } from "./workspaces";

const json = (value: Schema.Json, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });
const body = async (request: Request): Promise<Schema.Json> =>
  Schema.decodeUnknownSync(Schema.Json)(
    JSON.parse(
      new TextDecoder().decode(
        await boundedBytes(new Response(request.body), 8192)
      )
    )
  );
const handleMethods = async (
  services: Services,
  owner: UserId,
  request: Request,
  path: string
): Promise<Response | null> => {
  const { cards } = services;
  if (path === "/api/payment-methods" && request.method === "GET") {
    return json(
      Schema.decodeUnknownSync(PaymentMethods)(await cards.methods(owner))
    );
  }
  if (path === "/api/payment-methods" && request.method === "POST") {
    const method = await cards.saveMethod(
      owner,
      Schema.decodeUnknownSync(PaymentMethodSave)(await body(request))
    );
    return json(Schema.decodeUnknownSync(PaymentMethod)(method));
  }
  if (path.startsWith("/api/payment-methods/")) {
    const id = Schema.decodeUnknownSync(PaymentMethodId)(
      path.slice("/api/payment-methods/".length)
    );
    if (request.method === "DELETE" || request.method === "PUT") {
      await (request.method === "DELETE"
        ? cards.revoke(owner, id)
        : cards.saveMethod(
            owner,
            Schema.decodeUnknownSync(PaymentMethodSave)(await body(request)),
            id
          ));
      // Authority is revoked first; cancellation cannot delay the saved revocation.
      const checkouts = await cards.list(owner);
      await Promise.all(
        checkouts
          .filter(
            (checkout) =>
              checkout.paymentMethodId === id && checkout.stoppedAt !== null
          )
          .map(
            async (checkout) =>
              await controlCurrentHostedBrowse(
                owner,
                "stop",
                checkout.taskId
              ).catch(() => false)
          )
      );
      return json({ v: 1, updated: true });
    }
  }

  return null;
};
const reviewAgain = async (
  services: Services,
  owner: UserId,
  request: Request,
  id: CardCheckoutId,
  view: (id: CardCheckoutId) => Promise<Response>
): Promise<Response> => {
  const { cards } = services;
  const input = Schema.decodeUnknownSync(CardCheckoutPrepare)(
    await body(request)
  );
  const old = await cards.refresh(owner, id);
  if (
    old.taskId !== input.taskId ||
    old.paymentMethodId !== input.paymentMethodId ||
    (old.paymentDispatchedAt !== null && old.reconciledAt === null) ||
    (old.approvedAt !== null &&
      old.bridge !== null &&
      !old.bridge.destinationConfirmed)
  ) {
    throw new Error(
      "card.review: reconcile the existing payment and funding before another review."
    );
  }
  await cards.stop(owner, id);
  const next = await cards.prepare(
    owner,
    input.paymentMethodId,
    input.taskId,
    input.idempotencyKey
  );
  await purchaseHostedBrowse(owner, input.taskId, next.id);
  return await view(next.id);
};
const handleCheckoutControl = async (
  services: Services,
  workspace: Workspace,
  request: Request,
  path: string,
  view: (id: CardCheckoutId) => Promise<Response>
): Promise<Response> => {
  const { cards } = services;
  const owner = workspace.userId;
  const context = { session: workspace.session, connectionId: null };
  const match =
    /^\/api\/card-checkouts\/(?<id>[^/]+)(?:\/(?<action>approve|authorization|stop|review|reconcile))?$/u.exec(
      path
    )?.groups;
  if (match === undefined) {
    return json({ v: 1, error: "Not found." }, 404);
  }
  const id = Schema.decodeUnknownSync(CardCheckoutId)(match["id"]);
  if (request.method === "GET" && match["action"] === undefined) {
    return await view(id);
  }
  if (request.method === "POST" && match["action"] === "stop") {
    Schema.decodeUnknownSync(CardCheckoutControl)({
      ...Schema.decodeUnknownSync(Schema.Struct({ v: Schema.Literal(1) }))(
        await body(request)
      ),
      id,
    });
    const stopped = await cards.stop(owner, id);
    await controlCurrentHostedBrowse(owner, "stop", stopped.taskId).catch(
      () => false
    );
    return await view(id);
  }
  if (request.method === "POST" && match["action"] === "reconcile") {
    Schema.decodeUnknownSync(CardCheckoutReconcile)(await body(request));
    const stopped = await cards.stop(owner, id);
    await reconcileHostedPurchase(services, owner, stopped.taskId, id);
    return await view(id);
  }
  if (request.method === "POST" && match["action"] === "review") {
    return await reviewAgain(services, owner, request, id, view);
  }
  if (
    request.method === "POST" &&
    ["approve", "authorization"].includes(match["action"] ?? "")
  ) {
    const input = Schema.decodeUnknownSync(CardCheckoutApprove)(
      await body(request)
    );
    if (match["action"] === "authorization") {
      return json(
        Schema.decodeUnknownSync(TradeAuthorization)(
          await cards.authorization(context, id, input)
        )
      );
    }
    const token = bearerFromRequest(request);
    if (token === null) {
      return json({ v: 1, error: "Sign in to approve this purchase." }, 401);
    }
    await cards.approve(context, id, input, token);
    return await view(id);
  }
  return json({ v: 1, error: "Method not allowed." }, 405);
};
export const handleCardCheckouts = async (
  services: Services,
  workspace: Workspace,
  caller: TaskCaller,
  request: Request
): Promise<Response | null> => {
  const path = new URL(request.url).pathname;
  if (
    !path.startsWith("/api/payment-methods") &&
    !path.startsWith("/api/card-checkouts")
  ) {
    return null;
  }
  if (services.environment.cards?.enabled !== true) {
    return json(
      { v: 1, error: "card.disabled: Saved-card checkout is disabled." },
      403
    );
  }
  if (caller.agentTokenId !== null || caller.grantId !== null) {
    return json(
      {
        v: 1,
        error:
          "Only the workspace owner may manage cards and approve purchases.",
      },
      403
    );
  }
  const owner = workspace.userId;
  const { cards } = services;
  const view = async (id: CardCheckoutId) => {
    const checkout = await cards.refresh(owner, id);
    const trade =
      checkout.tradeId === null
        ? null
        : await services.trades.get(owner, checkout.tradeId, null);
    return json(
      Schema.decodeUnknownSync(CardCheckoutView)({ v: 1, checkout, trade })
    );
  };
  try {
    const methods = await handleMethods(services, owner, request, path);
    if (methods !== null) {
      return methods;
    }
    if (path === "/api/card-checkouts" && request.method === "GET") {
      return json(
        Schema.decodeUnknownSync(CardCheckoutList)({
          v: 1,
          checkouts: await cards.list(owner),
        })
      );
    }
    if (path === "/api/card-checkouts/prepare" && request.method === "POST") {
      const input = Schema.decodeUnknownSync(CardCheckoutPrepare)(
        await body(request)
      );
      const task = await services.store.tasks.byId(owner, input.taskId);
      if (task === null || task.kind !== "browse") {
        return json({ v: 1, error: "Browser task not found." }, 404);
      }
      const checkout = await cards.prepare(
        owner,
        input.paymentMethodId,
        task.id,
        input.idempotencyKey
      );
      try {
        await purchaseHostedBrowse(owner, task.id, checkout.id);
      } catch {
        await cards.stop(owner, checkout.id);
        throw new Error(
          "card.browser: resume a hosted browser task before preparing this purchase."
        );
      }
      return await view(checkout.id);
    }
    return await handleCheckoutControl(
      services,
      workspace,
      request,
      path,
      view
    );
  } catch (error) {
    // Schema errors may include the submitted card. Never reflect validation details.
    const message =
      error instanceof Error && /^card\.[a-z_]+:/u.test(error.message)
        ? error.message.slice(0, 300)
        : "Card request is invalid or the provider is unavailable.";
    return json(
      { v: 1, error: message },
      message.startsWith("card.missing:") ? 404 : 400
    );
  }
};
