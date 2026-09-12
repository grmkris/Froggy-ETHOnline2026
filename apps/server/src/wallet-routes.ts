/**
 * Prepare and commit a one-shot Privy rule for one approved dapp request.
 *
 * Same split as `policy-routes.ts`: the browser signs the exact PATCH body
 * this file builds, because the app secret must never reach a browser and a
 * body the browser invented would not be the one Privy hashes. Whose request
 * is edited is the authenticated person plus the id in the path — never a
 * user id in the body. An agent token cannot call these routes.
 */

import { WalletConnectionId, WalletRequestId } from "@froggy/domain";
import type { Allowance, UserId } from "@froggy/domain";
import { policyRulesWithDapps } from "@froggy/wallet";
import type { PolicyPins } from "@froggy/wallet";
import { Result, Schema } from "effect";

import type { PersonPolicies } from "./person-policies";
import { WalletRequestError, dappRuleInput } from "./wallet-requests";
import type { WalletRequests } from "./wallet-requests";

const PRIVY_API = "https://api.privy.io";
const SIGNING_WINDOW_MS = 120_000;

const decodeCommit = Schema.decodeUnknownResult(
  Schema.Struct({
    expiry: Schema.Int,
    signature: Schema.NullOr(Schema.String),
  })
);
const decodeOwner = Schema.decodeUnknownResult(
  Schema.Struct({ owner_id: Schema.NullOr(Schema.String) })
);
const decodeRequestId = Schema.decodeUnknownResult(WalletRequestId);
const decodeConnectionId = Schema.decodeUnknownResult(WalletConnectionId);

export interface WalletRouteDeps {
  readonly appId: string;
  readonly appSecret: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly pins: PolicyPins | null;
  readonly policies: Pick<PersonPolicies, "current"> | null;
  readonly stubbed: boolean;
  readonly walletRequests: WalletRequests;
}

const patchRequest = (input: {
  readonly appId: string;
  readonly expiry: number;
  readonly pins: PolicyPins;
  readonly policyId: string;
  readonly requests: readonly ReturnType<typeof dappRuleInput>[];
  readonly allowance: Allowance;
}) => ({
  body: {
    rules: policyRulesWithDapps(input.allowance, input.pins, input.requests),
  },
  headers: {
    "privy-app-id": input.appId,
    "privy-request-expiry": String(input.expiry),
  },
  method: "PATCH" as const,
  url: `${PRIVY_API}/v1/policies/${input.policyId}`,
  version: 1 as const,
});

type WalletRouteReply =
  | { readonly error: string; readonly status?: number }
  | { readonly ok: boolean }
  | {
      readonly connections: readonly {
        readonly address: string;
        readonly chainId: number;
        readonly grantedAt: number;
        readonly id: string;
        readonly origin: string;
      }[];
    }
  | { readonly requests: Awaited<ReturnType<WalletRequests["list"]>> }
  | {
      readonly expiry: number;
      readonly needsSignature: boolean;
      readonly payload: ReturnType<typeof patchRequest>;
    }
  | {
      readonly ok: true;
      readonly request: Awaited<ReturnType<WalletRequests["fulfillApproved"]>>;
    };

const json = (body: WalletRouteReply, status: number): Response =>
  Response.json(body, { status });

const needsPersonSignature = async (
  deps: WalletRouteDeps,
  policyId: string
): Promise<boolean> => {
  if (deps.stubbed) {
    return false;
  }
  const outbound = deps.fetch ?? globalThis.fetch;
  const response = await outbound(`${PRIVY_API}/v1/policies/${policyId}`, {
    headers: {
      authorization: `Basic ${Buffer.from(`${deps.appId}:${deps.appSecret}`).toString("base64")}`,
      "privy-app-id": deps.appId,
    },
  });
  if (!response.ok) {
    return true;
  }
  const owner = decodeOwner(JSON.parse(await response.text()));
  return Result.isSuccess(owner) && owner.success.owner_id !== null;
};

const readyPolicy = async (
  deps: WalletRouteDeps,
  userId: UserId
): Promise<
  | {
      readonly pins: PolicyPins;
      readonly policyId: string;
      readonly allowance: Allowance;
    }
  | Response
> => {
  if (deps.policies === null || deps.pins === null) {
    return json(
      { error: "This deployment does not mint policies of your own." },
      409
    );
  }
  const record = await deps.policies.current(userId);
  if (record === null) {
    return json(
      { error: "You have no policy of your own yet. Grant the agent first." },
      409
    );
  }
  return {
    allowance: record.allowance,
    pins: deps.pins,
    policyId: record.policyId,
  };
};

const unsignedPrepare = (appId: string): Response =>
  json(
    {
      expiry: Date.now() + SIGNING_WINDOW_MS,
      needsSignature: false,
      payload: {
        body: { rules: [] },
        headers: {
          "privy-app-id": appId,
          "privy-request-expiry": "0",
        },
        method: "PATCH",
        url: `${PRIVY_API}/v1/policies/stub`,
        version: 1,
      },
    },
    200
  );

const prepare = async (
  deps: WalletRouteDeps,
  userId: UserId,
  rawId: string
): Promise<Response> => {
  const id = decodeRequestId(rawId);
  if (Result.isFailure(id)) {
    return json({ error: "That is not a wallet request." }, 400);
  }
  const row = await deps.walletRequests.byId(userId, id.success);
  if (row === null) {
    return json({ error: "That request is not yours." }, 404);
  }
  if (row.status !== "awaiting_approval" && row.status !== "approved") {
    if (row.status === "confirmed") {
      // A stuck connect ticket: Uniswap already has the address, the card
      // never left. Take it down so Allow can finish without a red error.
      deps.walletRequests.releaseAllow(userId, row);
      if (row.kind === "connect" || deps.stubbed) {
        return unsignedPrepare(deps.appId);
      }
    }
    return json(
      { error: "That request is no longer waiting for an answer." },
      409
    );
  }
  if (row.kind === "connect" || deps.stubbed) {
    return unsignedPrepare(deps.appId);
  }
  const state = await readyPolicy(deps, userId);
  if (state instanceof Response) {
    return state;
  }
  const live = await deps.walletRequests.liveDapps(userId, row);
  const expiry = Date.now() + SIGNING_WINDOW_MS;
  return json(
    {
      expiry,
      needsSignature: await needsPersonSignature(deps, state.policyId),
      payload: patchRequest({
        allowance: state.allowance,
        appId: deps.appId,
        expiry,
        pins: state.pins,
        policyId: state.policyId,
        requests: live.map(dappRuleInput),
      }),
    },
    200
  );
};

const commit = async (
  deps: WalletRouteDeps,
  request: Request,
  userId: UserId,
  rawId: string
): Promise<Response> => {
  const id = decodeRequestId(rawId);
  if (Result.isFailure(id)) {
    return json({ error: "That is not a wallet request." }, 400);
  }
  const row = await deps.walletRequests.byId(userId, id.success);
  if (row === null) {
    return json({ error: "That request is not yours." }, 404);
  }
  if (row.kind === "connect" || deps.stubbed) {
    try {
      const view = await deps.walletRequests.fulfillApproved(
        userId,
        id.success
      );
      return json({ ok: true, request: view }, 200);
    } catch (error) {
      const status = error instanceof WalletRequestError ? error.status : 500;
      return json(
        { error: error instanceof Error ? error.message : "Commit failed." },
        status
      );
    }
  }
  const decoded = decodeCommit(await request.json());
  if (Result.isFailure(decoded)) {
    return json({ error: "That is not a signed rule change." }, 400);
  }
  const state = await readyPolicy(deps, userId);
  if (state instanceof Response) {
    return state;
  }
  const live = await deps.walletRequests.liveDapps(userId, row);
  const outgoing = patchRequest({
    allowance: state.allowance,
    appId: deps.appId,
    expiry: decoded.success.expiry,
    pins: state.pins,
    policyId: state.policyId,
    requests: live.map(dappRuleInput),
  });
  const headers = new Headers({
    authorization: `Basic ${Buffer.from(`${deps.appId}:${deps.appSecret}`).toString("base64")}`,
    "content-type": "application/json",
    "privy-app-id": deps.appId,
    "privy-request-expiry": String(decoded.success.expiry),
  });
  if (decoded.success.signature !== null) {
    headers.set("privy-authorization-signature", decoded.success.signature);
  }
  const outbound = deps.fetch ?? globalThis.fetch;
  const response = await outbound(outgoing.url, {
    body: JSON.stringify(outgoing.body),
    headers,
    method: "PATCH",
  });
  const text = await response.text();
  if (!response.ok) {
    return json(
      {
        error: `Privy would not accept the change: ${text.slice(0, 300)}`,
        status: response.status,
      },
      502
    );
  }
  try {
    const view = await deps.walletRequests.fulfillApproved(userId, id.success);
    return json({ ok: true, request: view }, 200);
  } catch (error) {
    const status = error instanceof WalletRequestError ? error.status : 500;
    return json(
      { error: error instanceof Error ? error.message : "Signing failed." },
      status
    );
  }
};

export const handleWalletRoutes = async (
  deps: WalletRouteDeps,
  request: Request,
  userId: UserId,
  pathname: string
): Promise<Response | null> => {
  if (pathname === "/api/wallet-connections" && request.method === "GET") {
    const connections = await deps.walletRequests.connections(userId);
    return json(
      {
        connections: connections.map((row) => ({
          address: row.address,
          chainId: row.chainId,
          grantedAt: row.grantedAt,
          id: row.id,
          origin: row.origin,
        })),
      },
      200
    );
  }
  const revoke = /^\/api\/wallet-connections\/(?<id>[^/]+)$/u.exec(pathname);
  if (revoke !== null && request.method === "DELETE") {
    const id = decodeConnectionId(revoke.groups?.["id"]);
    if (Result.isFailure(id)) {
      return json({ error: "That is not a connection." }, 400);
    }
    const ok = await deps.walletRequests.revokeConnection(userId, id.success);
    return json({ ok }, ok ? 200 : 404);
  }
  if (pathname === "/api/wallet-requests" && request.method === "GET") {
    return json({ requests: await deps.walletRequests.list(userId, 50) }, 200);
  }
  const prepared = /^\/api\/wallet-requests\/(?<id>[^/]+)\/prepare$/u.exec(
    pathname
  );
  if (prepared !== null && request.method === "POST") {
    return await prepare(deps, userId, prepared.groups?.["id"] ?? "");
  }
  const committed = /^\/api\/wallet-requests\/(?<id>[^/]+)\/commit$/u.exec(
    pathname
  );
  if (committed !== null && request.method === "POST") {
    return await commit(deps, request, userId, committed.groups?.["id"] ?? "");
  }
  return null;
};
