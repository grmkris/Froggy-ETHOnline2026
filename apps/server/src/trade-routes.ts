import { TradeId, TradeRuleId } from "@froggy/domain";
import {
  TradeAnswer,
  TradeExecute,
  TradePrepare,
  TradePositionsInput,
  TradeRuleRequest,
  TradeStopRequest,
} from "@froggy/protocol";
import { Schema } from "effect";

import { bearerFromRequest } from "./auth";
import { boundedBytes } from "./outbound";
import type { Services } from "./services";
import type { TaskCaller } from "./tasks";
import type { TradeContext } from "./trading/coordinator";
import { executionCapabilities } from "./trading/execution-providers";
import { getTradingPositions } from "./trading/positions";
import type { Workspace } from "./workspaces";

const json = (value: Schema.Json, status = 200): Response =>
  Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
const body = async (request: Request): Promise<Schema.Json> =>
  Schema.decodeUnknownSync(Schema.Json)(
    JSON.parse(
      new TextDecoder().decode(
        await boundedBytes(new Response(request.body), 24_000)
      )
    )
  );

const handleControls = async (
  services: Services,
  context: TradeContext,
  request: Request,
  path: string
): Promise<Response | null> => {
  if (
    path !== "/api/trades/stop" &&
    path !== "/api/trades/rules" &&
    !path.startsWith("/api/trades/rules/")
  ) {
    return null;
  }
  if (context.connectionId !== null) {
    return json(
      { error: "Only the workspace owner may manage trading authority." },
      403
    );
  }
  const owner = context.session.userId;
  if (path === "/api/trades/stop") {
    if (request.method === "GET") {
      return json({
        v: 1,
        stopped: await services.store.trading.transact(
          owner,
          (book) => book.stopped
        ),
      });
    }
    if (request.method === "POST") {
      const input = Schema.decodeUnknownSync(TradeStopRequest)(
        await body(request)
      );
      await services.trades.stop(owner, input.stopped);
      return json({ v: 1, stopped: input.stopped });
    }
  }
  if (path === "/api/trades/rules") {
    if (request.method === "GET") {
      return json({
        v: 1,
        rules: await services.store.trading.transact(owner, (book) =>
          [...book.rules.values()].slice(-100)
        ),
      });
    }
    if (request.method === "POST") {
      return json(
        await services.trades.createRule(
          owner,
          Schema.decodeUnknownSync(TradeRuleRequest)(await body(request))
        )
      );
    }
  }
  if (path.startsWith("/api/trades/rules/") && request.method === "DELETE") {
    const id = Schema.decodeUnknownSync(TradeRuleId)(
      path.slice("/api/trades/rules/".length)
    );
    await services.trades.revokeRule(owner, id);
    return json({ v: 1, revoked: true });
  }
  return json({ error: "Method not allowed." }, 405);
};

const handleTrade = async (
  services: Services,
  context: TradeContext,
  request: Request,
  path: string
): Promise<Response> => {
  const match =
    /^\/api\/trades\/(?<id>[^/]+)(?:\/(?<action>simulate|answer|authorization|cancel|execute))?$/u.exec(
      path
    )?.groups;
  if (match === undefined) {
    return json({ error: "Not found." }, 404);
  }
  const id = Schema.decodeUnknownSync(TradeId)(match["id"]);
  const { action } = match;
  const owner = context.session.userId;
  const saved = await services.trades.get(owner, id, context.connectionId);
  if (
    saved.input.action === "bridge" &&
    ["answer", "authorization", "execute"].includes(action ?? "")
  ) {
    return json(
      { error: "Approve card funding from its checkout review." },
      403
    );
  }
  if (action === undefined && request.method === "GET") {
    return json(await services.trades.get(owner, id, context.connectionId));
  }
  if (action === "simulate" && request.method === "POST") {
    return json(
      await services.trades.simulate(owner, id, context.connectionId)
    );
  }
  if (action === "execute" && request.method === "POST") {
    const input = Schema.decodeUnknownSync(TradeExecute)(await body(request));
    return json(await services.trades.executeRule(context, id, input.ruleId));
  }
  if (context.connectionId !== null) {
    return json(
      { error: "An agent cannot answer or cancel a human approval." },
      403
    );
  }
  if (action === "authorization" && request.method === "POST") {
    const answer = Schema.decodeUnknownSync(TradeAnswer)(await body(request));
    return json(await services.trades.authorization(context, id, answer));
  }
  if (action === "answer" && request.method === "POST") {
    const accessToken = bearerFromRequest(request);
    if (accessToken === null) {
      return json({ error: "Sign in to answer this trade approval." }, 401);
    }
    const answer = Schema.decodeUnknownSync(TradeAnswer)(await body(request));
    return json(await services.trades.answer(context, id, answer, accessToken));
  }
  if (action === "cancel" && request.method === "POST") {
    return json(await services.trades.cancel(owner, id));
  }
  return json({ error: "Method not allowed." }, 405);
};

export const handleTrades = async (
  services: Services,
  workspace: Workspace,
  caller: TaskCaller,
  request: Request
): Promise<Response | null> => {
  const path = new URL(request.url).pathname;
  if (path !== "/api/trades" && !path.startsWith("/api/trades/")) {
    return null;
  }
  const context: TradeContext = {
    session: workspace.session,
    connectionId: caller.grantId ?? caller.agentTokenId ?? null,
  };
  try {
    if (path === "/api/trades/positions" && request.method === "GET") {
      const input = Schema.decodeUnknownSync(TradePositionsInput)({
        network: new URL(request.url).searchParams.get("network"),
      });
      return json(
        await getTradingPositions(services, workspace.userId, input.network)
      );
    }
    if (path === "/api/trades/capabilities" && request.method === "GET") {
      const { trading } = services.environment;
      const wallets = await services.privy.paymentWallets(workspace.userId);
      return json(
        executionCapabilities(
          trading,
          wallets,
          services.environment.modes.privy === "live"
        )
      );
    }
    const controls = await handleControls(services, context, request, path);
    if (controls !== null) {
      return controls;
    }
    if (path === "/api/trades" && request.method === "GET") {
      return json({
        v: 1,
        trades: await services.trades.list(
          workspace.userId,
          context.connectionId
        ),
      });
    }
    if (path === "/api/trades" && request.method === "POST") {
      const input = Schema.decodeUnknownSync(TradePrepare)(await body(request));
      if (input.input.action === "bridge" || input.input.bridge !== undefined) {
        return json(
          {
            error:
              "Card funding must be prepared from the saved payment method checkout.",
          },
          403
        );
      }
      return json(await services.trades.prepare(context, input));
    }
    return await handleTrade(services, context, request, path);
  } catch (error) {
    const message =
      error instanceof Error && /^trade\.[a-z_]+:/u.test(error.message)
        ? error.message.slice(0, 500)
        : "Invalid trade request or unavailable trading provider.";
    return json(
      { error: message },
      message.startsWith("trade.missing:") ? 404 : 400
    );
  }
};
