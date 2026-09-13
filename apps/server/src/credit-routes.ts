import { CreditPurchase, CreditPurchaseId } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import {
  CreditActivity,
  CreditLimitsUpdate,
  CreditState,
} from "@froggy/protocol";
import { CreditStoreError } from "@froggy/wallet";
import { Schema } from "effect";

import { bearerFromRequest } from "./auth";
import { CreditPurchaseRequest } from "./credit-funding";
import { creditLimitsFromMandate } from "./credit-task";
import { boundedBytes } from "./outbound";
import type { Services } from "./services";
import type { TaskCaller } from "./tasks";
import type { Workspace } from "./workspaces";

const json = (value: Schema.Json, status = 200): Response =>
  Response.json(value, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
const readBody = async (request: Request): Promise<string> =>
  new TextDecoder().decode(
    await boundedBytes(new Response(request.body), 8000)
  );

const paymentRoute = async (
  services: Services,
  owner: UserId,
  id: CreditPurchaseId,
  request: Request
): Promise<Response> => {
  if (request.method === "GET") {
    const challenge = await services.creditFunding.challenge(owner, id);
    return Response.json(challenge, {
      status: 402,
      headers: {
        "cache-control": "private, no-store",
        "payment-required": Buffer.from(JSON.stringify(challenge)).toString(
          "base64"
        ),
      },
    });
  }
  if (request.method !== "POST") {
    return json({ v: 1, error: "Method not allowed." }, 405);
  }
  if (request.headers.has("x-payment")) {
    return json(
      {
        v: 1,
        code: "upgrade_required",
        error: "Use the x402 v2 payment-signature header.",
      },
      426
    );
  }
  const proof = request.headers.get("payment-signature");
  if (proof !== null) {
    return json(await services.creditFunding.accept(owner, id, proof), 202);
  }
  Schema.decodeUnknownSync(
    Schema.fromJsonString(Schema.Struct({ v: Schema.Literal(1) }))
  )(await readBody(request));
  const accessToken = bearerFromRequest(request);
  if (accessToken === null) {
    return json({ v: 1, error: "Sign in to buy credits." }, 401);
  }
  return json(await services.creditFunding.pay(owner, id, accessToken), 202);
};

const errorStatus = (code: string): number => {
  if (code === "not_found") {
    return 404;
  }
  if (code === "credit_conflict") {
    return 409;
  }
  if (code === "funding_unavailable" || code === "rate_unavailable") {
    return 503;
  }
  return 400;
};

const purchaseRoute = async (
  services: Services,
  owner: UserId,
  path: string,
  request: Request
): Promise<Response> => {
  const match = /^\/api\/credits\/purchases\/(?<id>[^/]+)(?<pay>\/pay)?$/u.exec(
    path
  )?.groups;
  if (match === undefined) {
    return json(
      { v: 1, code: "not_found", error: "Credit route not found." },
      404
    );
  }
  const id = Schema.decodeUnknownSync(CreditPurchaseId)(match["id"]);
  if (request.method === "GET" && match["pay"] === undefined) {
    return json(await services.creditFunding.get(owner, id));
  }
  if (match["pay"] !== undefined) {
    return await paymentRoute(services, owner, id, request);
  }
  return json({ v: 1, error: "Method not allowed." }, 405);
};

/** Funding and limits require the owner; agent tokens reach only credit reads. */
export const handleCredits = async (
  services: Services,
  workspace: { readonly session: Pick<Workspace["session"], "currentMandate"> },
  caller: TaskCaller,
  request: Request
): Promise<Response | null> => {
  const path = new URL(request.url).pathname;
  if (path !== "/api/credits" && !path.startsWith("/api/credits/")) {
    return null;
  }
  const owner = caller.userId;
  const { credits } = services.store;
  const connection = caller.grantId ?? caller.agentTokenId;
  if (
    connection !== null &&
    !(path === "/api/credits" && request.method === "GET")
  ) {
    return json(
      {
        v: 1,
        code: "owner_required",
        error:
          "Only the owner can buy credits, change limits, or read funding history.",
      },
      403
    );
  }
  try {
    const initialLimits = creditLimitsFromMandate(
      workspace.session.currentMandate
    );
    if (path === "/api/credits" && request.method === "GET") {
      return json(
        Schema.decodeUnknownSync(CreditState)({
          ...(await credits.summary(owner, initialLimits)),
          funding: services.creditFunding.methods(),
        })
      );
    }
    if (path === "/api/credits/activity" && request.method === "GET") {
      const [entries, purchases] = await Promise.all([
        credits.entries(owner),
        credits.listFunding(owner),
      ]);
      return json(
        Schema.decodeUnknownSync(CreditActivity)({
          v: 1,
          entries,
          purchases: purchases.map((purchase) =>
            Schema.decodeUnknownSync(CreditPurchase)(purchase)
          ),
        })
      );
    }
    if (path === "/api/credits/limits" && request.method === "PUT") {
      const input = Schema.decodeUnknownSync(
        Schema.fromJsonString(CreditLimitsUpdate)
      )(await readBody(request));
      const summary = await credits.summary(owner, initialLimits);
      return json(
        await credits.setLimits(owner, {
          ...summary.limits,
          perTaskUnits: input.perTaskUnits,
          dailyUnits: input.dailyUnits,
        })
      );
    }
    if (path === "/api/credits/purchases" && request.method === "POST") {
      const input = Schema.decodeUnknownSync(
        Schema.fromJsonString(CreditPurchaseRequest)
      )(await readBody(request));
      return json(
        await services.creditFunding.create(owner, input, initialLimits),
        201
      );
    }
    return await purchaseRoute(services, owner, path, request);
  } catch (error) {
    const code =
      error instanceof CreditStoreError ? error.code : "invalid_request";
    return json(
      {
        v: 1,
        code,
        error:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Credit request failed.",
      },
      errorStatus(code)
    );
  }
};
