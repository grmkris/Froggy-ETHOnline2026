/** Human answers and agent requests share records, but never credentials. */
import { PurchaseId } from "@froggy/domain";
import { PurchaseAnswer, PurchaseRequest } from "@froggy/protocol";
import type { PurchaseTicket, PurchaseWallets } from "@froggy/protocol";
import { Schema } from "effect";

import { bearerFromRequest } from "./auth";
import { controlCurrentHostedBrowse, hostedBrowseFor } from "./hosted-browse";
import { boundedBytes } from "./outbound";
import { PurchaseError } from "./purchases";
import type { PurchaseContext } from "./purchases";
import type { ChatRunRegistry } from "./runs";
import type { Services } from "./services";
import type { TaskCaller } from "./tasks";
import type { Workspace } from "./workspaces";

type PurchaseResponse =
  | PurchaseTicket
  | PurchaseWallets
  | { v: 1; purchases: readonly PurchaseTicket[] }
  | { error: string };
const json = (value: PurchaseResponse, status = 200): Response =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });
const body = async (request: Request): Promise<string> =>
  new TextDecoder().decode(
    await boundedBytes(new Response(request.body), 24_000)
  );

const handleWallets = async (
  services: Services,
  context: PurchaseContext,
  request: Request,
  path: string
): Promise<Response | null> => {
  if (
    path !== "/api/purchases/wallets" &&
    path !== "/api/purchases/wallets/solana"
  ) {
    return null;
  }
  if (context.connectionId !== undefined) {
    return json(
      { error: "Only the workspace owner can manage payment wallets." },
      403
    );
  }
  const { userId } = context.session;
  if (path === "/api/purchases/wallets" && request.method === "GET") {
    return json(await services.purchases.wallets(userId));
  }
  if (path === "/api/purchases/wallets/solana" && request.method === "POST") {
    const accessToken = bearerFromRequest(request);
    if (accessToken === null) {
      return json({ error: "Sign in to create your wallet." }, 401);
    }
    await services.privy.createSolanaWallet({ accessToken, did: userId });
    return json(await services.purchases.wallets(userId));
  }
  return json({ error: "Method not allowed." }, 405);
};

const handleIndividual = async (
  services: Services,
  runs: ChatRunRegistry,
  context: PurchaseContext,
  request: Request,
  path: string
): Promise<Response> => {
  const match =
    /^\/api\/purchases\/(?<id>[^/]+)(?:\/(?<action>answer|cancel))?$/u.exec(
      path
    )?.groups;
  if (match === undefined) {
    return json({ error: "Not found." }, 404);
  }
  const id = Schema.decodeUnknownSync(PurchaseId)(match["id"]);
  const { action } = match;
  const { session, browser, connectionId } = context;
  const { userId } = session;
  if (action === undefined && request.method === "GET") {
    return json(await services.purchases.get(userId, id, connectionId));
  }
  if (connectionId !== undefined) {
    return json(
      { error: "An agent cannot answer or cancel a human approval." },
      403
    );
  }
  if (action === "answer" && request.method === "POST") {
    const input = Schema.decodeUnknownSync(PurchaseAnswer)(
      JSON.parse(await body(request))
    );
    const accessToken = bearerFromRequest(request);
    if (accessToken === null) {
      return json({ error: "Sign in to answer this approval." }, 401);
    }
    const answered = await services.purchases.answer(
      context,
      id,
      input,
      accessToken
    );
    if (input.decision === "deny_stop") {
      const purchase = await services.store.purchases.byId(userId, id);
      if (purchase?.runId === hostedBrowseFor(userId)?.id) {
        await controlCurrentHostedBrowse(userId, "stop");
      } else {
        const activeRun = runs.get(session.id);
        if (purchase !== null && activeRun?.id === purchase.runId) {
          activeRun.abort();
        }
        if (purchase !== null) {
          const pending = await services.store.purchases.forRun(
            userId,
            purchase.runId
          );
          await Promise.all(
            pending.map(async (entry) => {
              await services.purchases.cancel(userId, entry.id, browser);
            })
          );
        }
      }
    }
    return json(answered);
  }
  if (action === "cancel" && request.method === "POST") {
    await services.purchases.cancel(userId, id, browser);
    return json(await services.purchases.get(userId, id));
  }
  return json({ error: "Method not allowed." }, 405);
};

export const handlePurchases = async (
  services: Services,
  runs: ChatRunRegistry,
  workspace: Workspace,
  caller: TaskCaller,
  request: Request
): Promise<Response | null> => {
  const path = new URL(request.url).pathname;
  if (path !== "/api/purchases" && !path.startsWith("/api/purchases/")) {
    return null;
  }
  const connectionId = caller.grantId ?? caller.agentTokenId ?? undefined;
  const { userId, session, browser } = workspace;
  const context: PurchaseContext =
    connectionId === undefined
      ? { session, browser, source: "web" }
      : { session, browser, source: "agent", connectionId };
  try {
    if (path === "/api/purchases" && request.method === "GET") {
      return json({
        v: 1,
        purchases: await services.purchases.list(userId, connectionId),
      });
    }
    if (path === "/api/purchases" && request.method === "POST") {
      const input = Schema.decodeUnknownSync(PurchaseRequest)(
        JSON.parse(await body(request))
      );
      return json(await services.purchases.request(context, input), 202);
    }
    const wallets = await handleWallets(services, context, request, path);
    if (wallets !== null) {
      return wallets;
    }
    return await handleIndividual(services, runs, context, request, path);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message.slice(0, 1500)
            : "Invalid purchase request.",
      },
      error instanceof PurchaseError ? error.status : 400
    );
  }
};
