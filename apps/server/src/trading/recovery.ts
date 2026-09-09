import type { TradeId, UserId } from "@froggy/domain";
import type { TradingStore } from "@froggy/wallet";

interface PendingTrade {
  readonly owner: UserId;
  readonly id: TradeId;
  readonly key: string;
}

/** A bounded round-robin sweep; recovery never has access to a signer. */
export const createTradeRecovery = (options: {
  readonly store: TradingStore;
  readonly recover: (owner: UserId, id: TradeId) => Promise<void>;
}) => {
  let active: Promise<void> | null = null;
  let closed = false;
  let cursor = "";
  const sweep = async (): Promise<void> => {
    const owners = await options.store.pendingOwners();
    const groups = await Promise.all(
      owners.map(async (owner): Promise<PendingTrade[]> => {
        if (closed) {
          return [];
        }
        const ids = await options.store.transact(owner, (book) =>
          [...book.trades.values()]
            .filter((trade) =>
              ["executing", "uncertain"].includes(trade.status)
            )
            .map((trade) => trade.id)
        );
        return ids.map((id) => ({ owner, id, key: `${owner}/${id}` }));
      })
    );
    const pending = groups.flat();
    pending.sort((left, right) =>
      left.key < right.key ? -1 : Number(left.key > right.key)
    );
    const after = pending.filter((trade) => trade.key > cursor);
    const before = pending.filter((trade) => trade.key <= cursor);
    const batch = [...after, ...before].slice(0, 8);
    cursor = batch.at(-1)?.key ?? "";
    // One unavailable provider must not prevent another wallet from settling.
    await Promise.allSettled(
      batch.map(async (trade) => {
        if (!closed) {
          await options.recover(trade.owner, trade.id);
        }
      })
    );
  };
  const run = async (): Promise<void> => {
    try {
      await sweep();
    } finally {
      active = null;
    }
  };
  return {
    tick: async (): Promise<void> => {
      if (closed) {
        return;
      }
      active ??= run();
      await active;
    },
    close: async (): Promise<void> => {
      closed = true;
      await active;
    },
  };
};
