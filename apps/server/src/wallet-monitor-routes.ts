import { WalletActivityId, WatchlistItemId } from "@froggy/domain";
import type { UserId, WatchlistItem } from "@froggy/domain";
import {
  OnchainMonitorConfigure,
  WalletMonitorStart,
  WalletMonitorUpdate,
} from "@froggy/protocol";
import type { WalletMonitorView } from "@froggy/protocol";
import { Schema } from "effect";

import {
  configureOnchainMonitor,
  ownedMonitorItem,
  trackWallet,
  updateWalletMonitor,
  walletMonitorStatus,
} from "./wallet-monitor";
import type { WalletMonitorDeps } from "./wallet-monitor";

const reply = (
  body:
    | typeof WalletMonitorView.Type
    | { readonly v: 1; readonly error: string },
  status = 200
): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });
const writeMonitor = async (
  deps: WalletMonitorDeps,
  request: Request,
  owner: UserId,
  item: WatchlistItem,
  alerts: boolean
): Promise<Response | null> => {
  if (request.method === "GET") {
    return null;
  }
  const raw: unknown = await request.json().catch(() => null);
  if (request.method === "POST") {
    if (alerts) {
      const config = Schema.decodeUnknownResult(OnchainMonitorConfigure)(raw);
      if (config._tag === "Failure") {
        return reply(
          { v: 1, error: "Choose valid onchain alert conditions." },
          400
        );
      }
      await configureOnchainMonitor(deps, owner, item, config.success);
    } else {
      const input = Schema.decodeUnknownResult(WalletMonitorStart)(raw);
      if (input._tag === "Failure") {
        return reply(
          { v: 1, error: "Choose swaps, transfers and Telegram preferences." },
          400
        );
      }
      await trackWallet(deps, owner, item, input.success);
    }
    return null;
  }
  if (request.method === "PATCH") {
    const input = Schema.decodeUnknownResult(WalletMonitorUpdate)(raw);
    if (input._tag === "Failure" || input.success.itemId !== item.id) {
      return reply({ v: 1, error: "Malformed onchain monitor update." }, 400);
    }
    await updateWalletMonitor(deps, owner, item.id, input.success.action);
    return null;
  }
  return reply({ v: 1, error: "Method not allowed." }, 405);
};
export const handleWalletMonitor = async (
  deps: WalletMonitorDeps,
  request: Request,
  owner: UserId,
  pathname: string
): Promise<Response | null> => {
  const match =
    /^\/api\/watchlist\/(?<id>[^/]+)\/(?<kind>monitor|alerts)$/u.exec(pathname);
  if (!match) {
    return null;
  }
  const id = match.groups?.["id"];
  if (id === undefined || !WatchlistItemId.is(id)) {
    return reply({ v: 1, error: "Saved onchain item not found." }, 404);
  }
  const item = await deps.store.walletActivity.transact(
    async (tx) => await ownedMonitorItem(tx, owner, id)
  );
  if (
    !item ||
    (item.source._tag !== "wallet" && item.source._tag !== "token")
  ) {
    return reply({ v: 1, error: "Saved onchain item not found." }, 404);
  }
  try {
    const failure = await writeMonitor(
      deps,
      request,
      owner,
      item,
      match.groups?.["kind"] === "alerts"
    );
    if (failure) {
      return failure;
    }
    const cursor = new URL(request.url).searchParams.get("before");
    if (cursor !== null && !WalletActivityId.is(cursor)) {
      return reply({ v: 1, error: "Invalid activity cursor." }, 400);
    }
    const before =
      cursor !== null && WalletActivityId.is(cursor) ? cursor : undefined;
    const activities = await deps.store.walletActivity.list(owner, id, before);
    return reply({
      v: 1,
      status: await walletMonitorStatus(deps, owner, id),
      activities,
      nextCursor:
        activities.length === 50 ? (activities.at(-1)?.id ?? null) : null,
    });
  } catch (error) {
    return reply(
      {
        v: 1,
        error:
          error instanceof Error
            ? error.message.slice(0, 300)
            : "Onchain monitoring failed.",
      },
      409
    );
  }
};
