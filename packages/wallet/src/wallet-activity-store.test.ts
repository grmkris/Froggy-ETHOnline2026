import { describe, expect, test } from "bun:test";

import {
  EvmAddress,
  NoticeId,
  userId,
  WalletActivityId,
  WalletMonitorId,
  WatchlistItemId,
} from "@froggy/domain";
import type {
  UserId,
  WalletActivity,
  WalletPriceEvaluation,
  WatchlistItem,
} from "@froggy/domain";
import { Schema } from "effect";
import postgres from "postgres";

import type {
  WalletActivityStore,
  WalletAlert,
  WalletStreamNetwork,
} from "./wallet-activity-store";
import { memoryWalletActivityStores } from "./wallet-activity-store-memory";
import { postgresWalletActivityStore } from "./wallet-activity-store-postgres";
import type { WatchlistStore } from "./watchlist-store";
import { postgresWatchlistStore } from "./watchlist-store-postgres";

const base = "eip155:8453";
const robinhood = "eip155:4663";
const wallet = Schema.decodeUnknownSync(EvmAddress)(`0x${"1".repeat(40)}`);
const blockHash = `0x${"a".repeat(64)}`;
const item = (network: WalletStreamNetwork = base): WatchlistItem => ({
  v: 1,
  id: WatchlistItemId.generate(),
  title: "Fixture wallet",
  notes: "",
  source: { _tag: "wallet", network, address: wallet },
  createdAt: 1000,
  updatedAt: 1000,
  revision: 1,
  archived: false,
  walletMonitor: {
    v: 1,
    id: WalletMonitorId.generate(),
    revision: 1,
    enabled: true,
    startedAt: 1000,
    expiresAt: 1_000_000,
    startBlock: 10,
    telegram: true,
    swaps: true,
    transfers: true,
  },
});
const alert = (
  owner: UserId,
  saved: WatchlistItem,
  network: WalletStreamNetwork = base
): WalletAlert => {
  const id = NoticeId.generate();
  if (!saved.walletMonitor) {
    throw new Error("Monitor missing.");
  }
  return {
    v: 1,
    id,
    owner,
    network,
    itemId: saved.id,
    monitorId: saved.walletMonitor.id,
    revision: 1,
    key: `test:${id}`,
    kind: "activity",
    text: "Fixture activity",
    activityIds: [],
    state: "pending",
    createdAt: 1000,
    notBefore: 1000,
    attempts: 0,
    claimUntil: 0,
    telegramMessageId: null,
  };
};
const activity = (
  saved: WatchlistItem,
  network: WalletStreamNetwork = base
): WalletActivity => {
  if (!saved.walletMonitor) {
    throw new Error("Monitor missing.");
  }
  return {
    v: 1,
    id: WalletActivityId.generate(),
    itemId: saved.id,
    monitorId: saved.walletMonitor.id,
    monitorRevision: 1,
    network,
    wallet,
    transactionHash: null,
    blockHash,
    blockNumber: 11,
    blockTime: 1000,
    observedAt: 1000,
    kind: "transfer",
    flows: [],
    venues: [],
    finality: "finalized",
    delivery: "waiting",
    telegramMessageId: null,
    complete: true,
    stubbed: true,
  };
};
interface TestStores {
  readonly walletActivity: WalletActivityStore;
  readonly second: WalletActivityStore;
  readonly watchlist: WatchlistStore;
  readonly owner: UserId;
  readonly close: () => Promise<void>;
}
const databaseUrl = process.env["FROGGY_TEST_DATABASE_URL"];
const setup = (database: boolean): TestStores => {
  const owner = userId(`did:privy:wallet-store-${crypto.randomUUID()}`);
  if (!database) {
    const stores = memoryWalletActivityStores();
    return {
      ...stores,
      second: stores.walletActivity,
      owner,
      close: async () => {
        await Promise.resolve();
      },
    };
  }
  if (databaseUrl === undefined || databaseUrl === "") {
    throw new Error("Test database is not configured.");
  }
  const first = postgres(databaseUrl, { max: 2 });
  const second = postgres(databaseUrl, { max: 2 });
  const walletActivity = postgresWalletActivityStore(first);
  const watchlist = postgresWatchlistStore(first);
  return {
    walletActivity,
    second: postgresWalletActivityStore(second),
    watchlist,
    owner,
    close: async () => {
      await walletActivity.forget(owner);
      await watchlist.forget(owner);
      await first`delete from users where did = ${owner}`;
      await first.end();
      await second.end();
    },
  };
};

for (const database of [false, true]) {
  describe.skipIf(
    database && (databaseUrl === undefined || databaseUrl === "")
  )(`${database ? "Postgres" : "memory"} wallet activity store`, () => {
    test("checkpoints are isolated by network and global invalidation reaches both", async () => {
      const s = setup(database);
      try {
        await s.walletActivity.transact(async (tx) => {
          await tx.saveCheckpoint({
            ...tx.checkpoint,
            block: 100,
            cursor: "base-cursor",
            sourceIdentity: "base:package:module",
          });
        }, base);
        await s.second.transact(async (tx) => {
          await tx.saveCheckpoint({
            ...tx.checkpoint,
            block: 200,
            cursor: "robinhood-cursor",
            sourceIdentity: "robinhood:package:module",
          });
        }, robinhood);
        const before = await s.walletActivity.transact(
          async (tx) => await Promise.resolve(tx.checkpoint.generation),
          base
        );
        await s.second.transact(async (tx) => {
          await tx.bumpGenerations();
        }, robinhood);
        expect(
          await s.walletActivity.transact(
            async (tx) =>
              await Promise.resolve([
                tx.checkpoint.block,
                tx.checkpoint.cursor,
                tx.checkpoint.generation,
              ]),
            base
          )
        ).toEqual([100, "base-cursor", before + 1]);
        expect(
          await s.second.transact(
            async (tx) =>
              await Promise.resolve([
                tx.checkpoint.block,
                tx.checkpoint.cursor,
              ]),
            robinhood
          )
        ).toEqual([200, "robinhood-cursor"]);
      } finally {
        await s.close();
      }
    });
    test("concurrent sends share five owner-wide slots and one summary across networks", async () => {
      const s = setup(database);
      try {
        const left = item();
        const right = item(robinhood);
        await s.walletActivity.transact(async (tx) => {
          await tx.saveItem(s.owner, left);
          await tx.saveItem(s.owner, right);
        });
        const messages = Array.from({ length: 12 }, (_, i) =>
          alert(s.owner, i % 2 ? right : left, i % 2 ? robinhood : base)
        );
        const decisions = await Promise.all(
          messages.map(
            async (message, i) =>
              await (i % 2 ? s.second : s.walletActivity).transact(
                async (tx) => {
                  await tx.saveAlert(message);
                  if (await tx.claimActivitySlot(message, 60_001)) {
                    await tx.saveAlert({ ...message, state: "sending" });
                    return "individual";
                  }
                  const summary = await tx.deferToSummary(message, 60_001);
                  return summary.id;
                },
                message.network
              )
          )
        );
        expect(
          decisions.filter((value) => value === "individual")
        ).toHaveLength(5);
        const ids = [
          ...new Set(decisions.filter((value) => value !== "individual")),
        ];
        expect(ids).toHaveLength(1);
        const [first] = messages;
        const [summaryId] = ids;
        if (!first || !summaryId) {
          throw new Error("Fixture is incomplete.");
        }
        expect(
          await s.second.transact(
            async (tx) => await tx.claimActivitySlot(first, 120_001)
          )
        ).toBe(true);
        expect(
          await s.walletActivity.transact(
            async (tx) => await tx.summaryCount(summaryId)
          )
        ).toBe(7);
        const members = await s.walletActivity.transact(
          async (tx) => await tx.summaryMembers(summaryId)
        );
        expect(new Set(members.map((member) => member.network)).size).toBe(2);
        const [member] = members;
        if (!member) {
          throw new Error("Summary fixture is empty.");
        }
        await s.walletActivity.transact(async (tx) => {
          await tx.saveAlert({
            ...member,
            state: "sending",
            attempts: 1,
            claimUntil: 180_000,
          });
        }, member.network);
        const directlyPending = await s.walletActivity.transact(
          async (tx) => await tx.pending(120_001),
          member.network
        );
        expect(
          directlyPending.some((candidate) => candidate.id === member.id)
        ).toBe(false);

        const summary = await s.walletActivity.transact(
          async (tx) => await tx.alert(`summary:${s.owner}:1`)
        );
        expect(summary?.itemId).toBeNull();
        expect(summary?.monitorId).toBeNull();
        expect(summary?.notBefore).toBe(120_000);
      } finally {
        await s.close();
      }
    });
    test("a failed transaction cannot consume a delivery slot", async () => {
      const s = setup(database);
      try {
        const saved = item();
        const message = alert(s.owner, saved);
        await s.walletActivity.transact(async (tx) => {
          await tx.saveItem(s.owner, saved);
          await tx.saveAlert(message);
        });
        const failure = s.walletActivity.transact(async (tx) => {
          await tx.claimActivitySlot(message, 60_001);
          throw new Error("rollback");
        });
        expect(failure).rejects.toThrow("rollback");
        await failure.catch(() => null);
        const reserved = await s.walletActivity.transact(
          async (tx) => await tx.alert(message.key)
        );
        expect(reserved?.reservedMinute).toBeUndefined();
      } finally {
        await s.close();
      }
    });
    test("finalized waiting events remain eligible and reconciliation pages are bounded", async () => {
      const s = setup(database);
      try {
        const saved = item();
        const events = Array.from({ length: 201 }, () => activity(saved));
        await s.walletActivity.transact(async (tx) => {
          await tx.saveItem(s.owner, saved);
          await Promise.all(
            events.map(async (event) => {
              await tx.saveActivity(s.owner, event);
            })
          );
        });
        const first = await s.walletActivity.transact(
          async (tx) => await tx.awaitingDelivery()
        );
        const ownFirst = first.filter((row) => row.owner === s.owner);
        expect(ownFirst).toHaveLength(200);
        const cursor = ownFirst.at(-1)?.activity.id;
        if (!cursor) {
          throw new Error("Missing cursor.");
        }
        const second = await s.walletActivity.transact(
          async (tx) => await tx.awaitingDelivery(cursor)
        );
        expect(second.filter((row) => row.owner === s.owner)).toHaveLength(1);
        expect(
          await s.walletActivity.transact(async (tx) => await tx.provisional())
        ).toEqual([]);
        await s.walletActivity.prune(2000);
        expect(await s.walletActivity.list(s.owner, saved.id)).toHaveLength(50);
      } finally {
        await s.close();
      }
    });
    test("price rollback uses block order and preserves unfinalized snapshots", async () => {
      const s = setup(database);
      try {
        const saved = item();
        const monitor = saved.walletMonitor;
        if (!monitor) {
          throw new Error("Monitor missing.");
        }
        const records: WalletPriceEvaluation[] = [12, 11, 12].map(
          (blockNumber) => ({
            v: 1,
            id: WalletActivityId.generate(),
            owner: s.owner,
            itemId: saved.id,
            monitorId: monitor.id,
            revision: 1,
            network: base,
            blockNumber,
            blockHash,
            before: monitor,
            after: monitor,
          })
        );
        await s.walletActivity.transact(async (tx) => {
          await tx.saveItem(s.owner, saved);
          await Promise.all(
            records.map(async (record) => {
              await tx.savePriceEvaluation(record);
            })
          );
          await tx.saveCheckpoint({ ...tx.checkpoint, finalizedBlock: 11 });
        });
        await s.walletActivity.prune(2000);
        const remaining = await s.walletActivity.transact(
          async (tx) => await tx.priceEvaluationsAfter(10)
        );
        expect(
          remaining
            .filter((record) => record.owner === s.owner)
            .map((record) => record.blockNumber)
        ).toEqual([12, 12]);
        await s.walletActivity.transact(async (tx) => {
          await Promise.all(
            remaining.map(async (record) => {
              await tx.deletePriceEvaluation(record.id);
            })
          );
        });
        expect(
          await s.walletActivity.transact(
            async (tx) => await tx.priceEvaluationsAfter(10)
          )
        ).toEqual([]);
      } finally {
        await s.close();
      }
    });
    test("archiving cancels grouped children while preserving correction delivery", async () => {
      const s = setup(database);
      try {
        const saved = item();
        const message = alert(s.owner, saved);
        const correction = {
          ...alert(s.owner, saved),
          kind: "correction" as const,
        };
        await s.walletActivity.transact(async (tx) => {
          await tx.saveItem(s.owner, saved);
          await tx.saveAlert(message);
          await tx.deferToSummary(message, 60_001);
          await tx.saveAlert(correction);
        });
        await s.watchlist.transact(s.owner, (book) => {
          book.set(saved.id, {
            ...saved,
            archived: true,
            revision: saved.revision + 1,
          });
        });
        const cancelled = await s.walletActivity.transact(
          async (tx) => await tx.alert(message.key)
        );
        const retained = await s.walletActivity.transact(
          async (tx) => await tx.alert(correction.key)
        );
        expect(cancelled?.state).toBe("cancelled");
        expect(retained?.state).toBe("pending");
      } finally {
        await s.close();
      }
    });
    test("archiving cancels finalized waiting activities before outbox creation across page boundaries", async () => {
      const s = setup(database);
      try {
        const saved = item();
        await s.walletActivity.transact(async (tx) => {
          await tx.saveItem(s.owner, saved);
          await Promise.all(
            Array.from({ length: 205 }, async () => {
              await tx.saveActivity(s.owner, activity(saved));
            })
          );
        });
        await s.watchlist.transact(s.owner, (book) => {
          book.set(saved.id, {
            ...saved,
            archived: true,
            revision: saved.revision + 1,
          });
        });
        const pending = await s.walletActivity.transact(
          async (tx) => await tx.awaitingDelivery()
        );
        expect(pending.filter((row) => row.owner === s.owner)).toEqual([]);
        const rows = await s.walletActivity.list(s.owner, saved.id);
        expect(rows).toHaveLength(50);
        expect(rows.every((row) => row.delivery === "cancelled")).toBe(true);
      } finally {
        await s.close();
      }
    });
    test("forgetting a watchlist removes finalized waiting activities with no outbox", async () => {
      const s = setup(database);
      try {
        const saved = item();
        await s.walletActivity.transact(async (tx) => {
          await tx.saveItem(s.owner, saved);
          await tx.saveActivity(s.owner, activity(saved));
        });
        await s.watchlist.forget(s.owner);
        expect(await s.walletActivity.list(s.owner, saved.id)).toEqual([]);
        expect(
          await s.walletActivity.transact(async (tx) => await tx.items(s.owner))
        ).toEqual([]);
      } finally {
        await s.close();
      }
    });
    test("unverified gap evidence cannot enter delivery and is pruned after retention", async () => {
      const s = setup(database);
      try {
        const saved = item();
        const unverified: WalletActivity = {
          ...activity(saved),
          finality: "unverified",
        };
        await s.walletActivity.transact(async (tx) => {
          await tx.saveItem(s.owner, saved);
          await tx.saveActivity(s.owner, unverified);
        });
        const pending = await s.walletActivity.transact(
          async (tx) => await tx.awaitingDelivery()
        );
        expect(pending.filter((row) => row.owner === s.owner)).toEqual([]);
        await s.walletActivity.transact(async (tx) => {
          await tx.saveActivity(s.owner, {
            ...unverified,
            delivery: "cancelled",
          });
        });
        await s.walletActivity.prune(2000);
        expect(await s.walletActivity.list(s.owner, saved.id)).toEqual([]);
      } finally {
        await s.close();
      }
    });
    test("deleting one item removes its activity but preserves an owner-wide summary", async () => {
      const s = setup(database);
      try {
        const saved = item();
        const event = activity(saved);
        const message = alert(s.owner, saved);
        await s.walletActivity.transact(async (tx) => {
          await tx.saveItem(s.owner, saved);
          await tx.saveActivity(s.owner, event);
          await tx.saveAlert(message);
          await tx.deferToSummary(message, 60_001);
        });
        await s.watchlist.transact(s.owner, (book) => {
          book.delete(saved.id);
        });
        expect(await s.walletActivity.list(s.owner, saved.id)).toEqual([]);
        expect(
          await s.walletActivity.transact(
            async (tx) => await tx.alert(message.key)
          )
        ).toBeNull();
        const summary = await s.walletActivity.transact(
          async (tx) => await tx.alert(`summary:${s.owner}:1`)
        );
        expect(summary?.kind).toBe("summary");
      } finally {
        await s.close();
      }
    });
  });
}
