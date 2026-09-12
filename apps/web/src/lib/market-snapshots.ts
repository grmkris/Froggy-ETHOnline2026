import type { WatchlistItem } from "@froggy/domain";
import type { ServiceTicket, TokenInspectResult } from "@froggy/protocol";

export interface MarketSnapshot {
  readonly token: TokenInspectResult["token"];
  readonly observedAt: number;
  readonly stubbed: boolean;
}

/** Reuse paid results. Rendering a saved token never purchases another read. */
export const snapshotForItem = (
  item: WatchlistItem,
  tasks: readonly ServiceTicket[]
): MarketSnapshot | null => {
  const { source } = item;
  if (source._tag !== "token") {
    return null;
  }
  const snapshots: MarketSnapshot[] = [];
  for (const task of tasks) {
    const result = task.data;
    if (
      (result?.operation !== "market_search" &&
        result?.operation !== "token_inspect") ||
      result.network !== source.network
    ) {
      continue;
    }
    const tokens =
      result.operation === "market_search" ? result.tokens : [result.token];
    const token = tokens.find(
      (entry) => entry.address.toLowerCase() === source.address.toLowerCase()
    );
    if (token !== undefined) {
      snapshots.push({
        token,
        observedAt: result.observedAt,
        stubbed: result.stubbed || task.stubbed,
      });
    }
  }
  return snapshots.toSorted((a, b) => b.observedAt - a.observedAt)[0] ?? null;
};
