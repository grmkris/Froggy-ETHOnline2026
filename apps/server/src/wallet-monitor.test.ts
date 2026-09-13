import { describe, expect, test } from "bun:test";

import { EvmAddress, userId, WALLET_MONITOR_DURATION_MS } from "@froggy/domain";
import type { OnchainNetwork, WatchlistInput } from "@froggy/domain";
import { demoWalletStream } from "@froggy/graph";
import type { WalletStreamBlock, WalletStreamTransaction } from "@froggy/graph";
import { memoryStore } from "@froggy/wallet";
import type { WalletAlert } from "@froggy/wallet";
import { Schema } from "effect";

import {
  describeWalletActivity,
  walletActivityMatches,
} from "./wallet-activity";
import {
  configureOnchainMonitor,
  trackWallet,
  updateWalletMonitor,
  walletMonitorStatus,
} from "./wallet-monitor";
import {
  commitWalletBlock,
  dispatchWalletAlerts,
  runWalletMonitorWorker,
  undoWalletBlock,
} from "./wallet-monitor-worker";
import type {
  WalletAlertDelivery,
  WalletWorkerDeps,
} from "./wallet-monitor-worker";

// Synthetic fixture addresses; no production wallet or transaction is used.
const address = (digit: string) =>
  Schema.decodeUnknownSync(EvmAddress)(`0x${digit.repeat(40)}`);
const owner = userId("did:privy:wallet-monitor-test");
const other = userId("did:privy:wallet-monitor-other");
const wallet = address("1");
const pool = address("2");
const token = address("3");
const recipient = address("4");
const hash = (digit: string) => `0x${digit.repeat(64)}`;
const input: WatchlistInput = {
  title: "My external wallet",
  notes: "Keep these notes",
  source: { _tag: "wallet", network: "eip155:8453", address: wallet },
};
const options = { swaps: true, transfers: true, telegram: true };
const transaction = (
  changes: Partial<WalletStreamTransaction> = {}
): WalletStreamTransaction => ({
  wallet,
  hash: hash("a"),
  transactionFrom: recipient,
  truncated: false,
  transfers: [
    {
      asset: token,
      from: pool,
      to: wallet,
      amount: "1000000",
      ordinal: "20",
      callIndex: 2,
      callKnown: true,
      logIndex: 1,
    },
  ],
  swapsV2: [],
  swapsV3: [],
  swapsV4: [],
  swapsAerodrome: [],
  ...changes,
});
const setup = (
  network: OnchainNetwork = "eip155:8453",
  store = memoryStore()
) => {
  let now = 1_000_000;
  let outcome: WalletAlertDelivery = {
    kind: "delivered",
    messageId: "telegram:123",
  };
  const sent: string[] = [];
  const alerts: WalletAlert[] = [];
  let deliver: WalletWorkerDeps["deliver"] | undefined;
  const deps: WalletWorkerDeps = {
    store,
    source: demoWalletStream(),
    network,
    now: () => now,
    head: async () => await Promise.resolve(1000),
    appUrl: "https://froggy.example",
    verifier: {
      verify: async () => await Promise.resolve(false),
      metadata: async () =>
        await Promise.resolve({ symbol: "TEST", decimals: 6 }),
    },
    deliver: async (alert) => {
      sent.push(alert.key);
      alerts.push(alert);
      return deliver ? await deliver(alert) : await Promise.resolve(outcome);
    },
    invalidate: () => {},
  };
  const fence = async () =>
    await store.walletActivity.transact(async (tx) => {
      const epoch = tx.checkpoint.epoch + 1;
      await tx.saveCheckpoint({
        ...tx.checkpoint,
        epoch,
        leaseUntil: now + 45_000,
      });
      return { epoch, generation: tx.checkpoint.generation };
    }, network);
  const block = (
    number: number,
    transactions: readonly WalletStreamTransaction[] = [],
    finalizedBlock = 0
  ): WalletStreamBlock => ({
    kind: "block",
    number,
    cursor: `cursor:${number}`,
    hash: `0x${number.toString(16).padStart(64, "0")}`,
    timestamp: now,
    finalizedBlock,
    extended: true,
    truncated: false,
    transactions,
    stubbed: true,
  });
  return {
    deps,
    store,
    sent,
    alerts,
    fence,
    block,
    delivery: (next: WalletWorkerDeps["deliver"]) => {
      deliver = next;
    },
    advance: (ms: number) => {
      now += ms;
    },
    outcome: (next: WalletAlertDelivery) => {
      outcome = next;
    },
  };
};
describe("wallet monitoring persistence and authority", () => {
  test("tracking deduplicates by wallet, preserving notes and expiry", async () => {
    const s = setup();
    const first = await trackWallet(s.deps, owner, input, options);
    s.advance(1000);
    const again = await trackWallet(
      s.deps,
      owner,
      { ...input, title: "Overwrite", notes: "changed" },
      options
    );
    expect(again).toEqual(first);
    expect(await s.store.watchlist.transact(owner, (book) => book.size)).toBe(
      1
    );
    expect(first.walletMonitor?.expiresAt).toBe(
      1_000_000 + WALLET_MONITOR_DURATION_MS
    );
  });
  test("another user cannot read or update the watch", async () => {
    const s = setup();
    const item = await trackWallet(s.deps, owner, input, options);
    const readError = await walletMonitorStatus(s.deps, other, item.id).then(
      () => null,
      String
    );
    const updateError = await updateWalletMonitor(
      s.deps,
      other,
      item.id,
      "pause"
    ).then(() => null, String);
    expect(readError).toContain("not found");
    expect(updateError).toContain("not found");
    expect(await s.store.walletActivity.list(other, item.id)).toEqual([]);
  });
  test("paused watches retain expiry; expired ones need explicit extension", async () => {
    const s = setup();
    const item = await trackWallet(s.deps, owner, input, options);
    const paused = await updateWalletMonitor(s.deps, owner, item.id, "pause");
    expect(paused.walletMonitor?.expiresAt).toBe(item.walletMonitor?.expiresAt);
    s.advance(WALLET_MONITOR_DURATION_MS + 1);
    const resumeError = await updateWalletMonitor(
      s.deps,
      owner,
      item.id,
      "resume"
    ).then(() => null, String);
    expect(resumeError).toContain("expired");
    const extended = await updateWalletMonitor(
      s.deps,
      owner,
      item.id,
      "extend"
    );
    expect(extended.walletMonitor?.expiresAt).toBe(
      s.deps.now() + WALLET_MONITOR_DURATION_MS
    );
  });
  test("capacity refusal does not leave an orphan saved item", async () => {
    const s = setup();
    await Promise.all(
      ["1", "2", "3"].map(
        async (digit) =>
          await trackWallet(
            s.deps,
            owner,
            {
              ...input,
              source: {
                _tag: "wallet",
                network: "eip155:8453",
                address: address(digit),
              },
            },
            options
          )
      )
    );
    const capacityError = await trackWallet(
      s.deps,
      owner,
      {
        ...input,
        source: {
          _tag: "wallet",
          network: "eip155:8453",
          address: address("4"),
        },
      },
      options
    ).then(() => null, String);
    expect(capacityError).toContain("three items");
    expect(await s.store.watchlist.transact(owner, (book) => book.size)).toBe(
      3
    );
  });
  test("extending an active watch preserves its start and pending activity delivery", async () => {
    const s = setup();
    const item = await trackWallet(s.deps, owner, input, options);
    let fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001, [transaction()]));
    await dispatchWalletAlerts(s.deps);
    await commitWalletBlock(s.deps, fence, s.block(1003));
    s.advance(10_000);
    const extended = await updateWalletMonitor(
      s.deps,
      owner,
      item.id,
      "extend"
    );
    expect(extended.walletMonitor?.revision).toBe(item.walletMonitor?.revision);
    expect(extended.walletMonitor?.startBlock).toBe(
      item.walletMonitor?.startBlock
    );
    expect(extended.walletMonitor?.expiresAt).toBe(
      s.deps.now() + WALLET_MONITOR_DURATION_MS
    );
    await dispatchWalletAlerts(s.deps);
    expect(s.alerts.filter((alert) => alert.kind === "activity")).toHaveLength(
      1
    );
    const [activity] = await s.store.walletActivity.list(owner, item.id);
    expect(activity?.delivery).toBe("delivered");
    fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1004));
    await dispatchWalletAlerts(s.deps);
    expect(s.alerts.filter((alert) => alert.kind === "ready")).toHaveLength(1);
    expect(s.alerts.filter((alert) => alert.kind === "activity")).toHaveLength(
      1
    );
  });

  test("a changed watch generation fences the old stream before its cursor advances", async () => {
    const s = setup();
    const item = await trackWallet(s.deps, owner, input, options);
    const fence = await s.fence();
    await updateWalletMonitor(s.deps, owner, item.id, "pause");
    expect(
      await commitWalletBlock(s.deps, fence, s.block(1001, [transaction()]))
    ).toBe(false);
    expect(
      await s.store.walletActivity.transact(
        async (tx) => await Promise.resolve(tx.checkpoint.block)
      )
    ).toBe(0);
  });
  test("two sealed successor blocks release one alert; replay is idempotent", async () => {
    const s = setup();
    const item = await trackWallet(s.deps, owner, input, options);
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001, [transaction()]));
    await dispatchWalletAlerts(s.deps);
    // Only the readiness message has been sent.
    expect(s.sent).toHaveLength(1);
    await commitWalletBlock(s.deps, fence, s.block(1002));
    await dispatchWalletAlerts(s.deps);
    expect(s.sent).toHaveLength(1);
    await commitWalletBlock(s.deps, fence, s.block(1003));
    await dispatchWalletAlerts(s.deps);
    expect(s.sent).toHaveLength(2);
    await commitWalletBlock(s.deps, fence, s.block(1003));
    await dispatchWalletAlerts(s.deps);
    expect(s.sent).toHaveLength(2);
    const activities = await s.store.walletActivity.list(owner, item.id);
    expect(activities).toHaveLength(1);
    expect(activities[0]?.delivery).toBe("delivered");
    expect(activities[0]?.stubbed).toBe(true);
  });
  test("a delivered provisional event gets one reorg correction even after pause", async () => {
    const s = setup();
    const item = await trackWallet(s.deps, owner, input, options);
    let fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001, [transaction()]));
    await commitWalletBlock(s.deps, fence, s.block(1003));
    await dispatchWalletAlerts(s.deps);
    await updateWalletMonitor(s.deps, owner, item.id, "pause");
    fence = await s.fence();
    const undo = {
      kind: "undo" as const,
      lastValidBlock: 1000,
      lastValidHash: hash("b"),
      cursor: "rewound",
    };
    expect(await undoWalletBlock(s.deps, fence, undo)).toBe(true);
    await dispatchWalletAlerts(s.deps);
    await undoWalletBlock(s.deps, fence, undo);
    await dispatchWalletAlerts(s.deps);
    expect(s.sent.filter((key) => key.startsWith("correction:"))).toHaveLength(
      1
    );
    const [activity] = await s.store.walletActivity.list(owner, item.id);
    expect(activity?.finality).toBe("reverted");
  });
  test("unknown delivery is durable and never blindly retried", async () => {
    const s = setup();
    const item = await trackWallet(s.deps, owner, input, options);
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001, [transaction()]));
    await dispatchWalletAlerts(s.deps);
    s.outcome({ kind: "uncertain" });
    await commitWalletBlock(s.deps, fence, s.block(1003));
    await dispatchWalletAlerts(s.deps);
    s.advance(60_000);
    await dispatchWalletAlerts(s.deps);
    expect(s.sent.filter((key) => key.startsWith("activity:"))).toHaveLength(1);
    const [activity] = await s.store.walletActivity.list(owner, item.id);
    expect(activity?.delivery).toBe("uncertain");
  });
});
describe("wallet trade attribution", () => {
  test("a generic swap topic without a verified pool stays wallet activity", async () => {
    const s = setup();
    const result = await describeWalletActivity(
      transaction({
        swapsV2: [
          {
            location: {
              contract: pool,
              logIndex: 2,
              callIndex: 2,
              beginOrdinal: "10",
              endOrdinal: "100",
            },
            sender: recipient,
            recipient: wallet,
            amount0In: "1",
            amount1In: "0",
            amount0Out: "0",
            amount1Out: "1",
          },
        ],
      }),
      1001,
      s.deps.verifier
    );
    expect(result.kind).toBe("activity");
    expect(result.venues).toEqual([]);
  });
  test("an unrelated token receipt or input refund does not match a buy filter inside a verified swap", async () => {
    const s = setup();
    const quote = address("5");
    const unrelated = address("6");
    const deps: WalletWorkerDeps = {
      ...s.deps,
      verifier: {
        ...s.deps.verifier,
        verify: async (_venue, location) =>
          await Promise.resolve(location.contract === pool),
      },
    };
    const item = await configureOnchainMonitor(deps, owner, input, {
      telegram: true,
      conditions: [
        { _tag: "swap", side: "bought", token: quote },
        { _tag: "swap", side: "bought", token: unrelated },
      ],
    });
    const tx = transaction({
      transfers: [
        {
          asset: quote,
          from: wallet,
          to: pool,
          amount: "100",
          ordinal: "10",
          callIndex: 2,
          callKnown: true,
          logIndex: 1,
        },
        {
          asset: quote,
          from: pool,
          to: wallet,
          amount: "10",
          ordinal: "20",
          callIndex: 2,
          callKnown: true,
          logIndex: 2,
        },
        {
          asset: token,
          from: pool,
          to: wallet,
          amount: "1000",
          ordinal: "30",
          callIndex: 2,
          callKnown: true,
          logIndex: 3,
        },
        {
          asset: unrelated,
          from: recipient,
          to: wallet,
          amount: "1",
          ordinal: "40",
          callIndex: 3,
          callKnown: true,
          logIndex: 4,
        },
      ],
      swapsV2: [
        {
          location: {
            contract: pool,
            logIndex: 5,
            callIndex: 2,
            beginOrdinal: "1",
            endOrdinal: "35",
          },
          sender: wallet,
          recipient: wallet,
          amount0In: "90",
          amount1In: "0",
          amount0Out: "0",
          amount1Out: "1000",
        },
      ],
    });
    const fence = await s.fence();
    await commitWalletBlock(deps, fence, s.block(1001, [tx]));
    await commitWalletBlock(deps, fence, s.block(1003));
    await dispatchWalletAlerts(deps);
    const [activity] = await s.store.walletActivity.list(owner, item.id);
    const monitor = item.walletMonitor;
    const rule = monitor?.rules?.[0];
    if (!activity || !monitor || !rule) {
      throw new Error(
        "Expected the configured monitor and persisted swap fixture."
      );
    }
    expect(activity.kind).toBe("swap");
    expect(
      activity.flows.find((flow) => flow.asset === unrelated)?.swapSide
    ).toBeUndefined();
    expect(
      activity.flows.find(
        (flow) => flow.asset === quote && flow.direction === "received"
      )?.swapSide
    ).toBeUndefined();
    expect(activity.flows.find((flow) => flow.asset === token)?.swapSide).toBe(
      "received"
    );
    expect(walletActivityMatches(monitor, activity)).toBe(false);
    expect(
      walletActivityMatches(
        {
          ...monitor,
          rules: [
            { ...rule, condition: { _tag: "swap", side: "bought", token } },
          ],
        },
        activity
      )
    ).toBe(true);
    expect(
      walletActivityMatches(
        {
          ...monitor,
          rules: [
            {
              ...rule,
              condition: { _tag: "swap", side: "sold", token: quote },
            },
          ],
        },
        activity
      )
    ).toBe(true);
    expect(s.alerts.filter((alert) => alert.kind === "activity")).toEqual([]);
  });

  test("a sponsor or router is not substituted for the watched wallet", async () => {
    const s = setup();
    const tx = transaction();
    const result = await describeWalletActivity(tx, 1001, s.deps.verifier);
    expect(tx.transactionFrom).not.toBe(tx.wallet);
    expect(result.flows[0]?.direction).toBe("received");
    expect(result.flows[0]?.amount).toBe("1000000");
  });
});

describe("wallet alert delivery integration", () => {
  test("five activity messages per person per minute are shared across both networks, then one summary", async () => {
    const store = memoryStore();
    const base = setup("eip155:8453", store);
    const robinhood = setup("eip155:4663", store);
    const baseItem = await trackWallet(base.deps, owner, input, options);
    const hoodItem = await trackWallet(
      robinhood.deps,
      owner,
      {
        ...input,
        source: { _tag: "wallet", network: "eip155:4663", address: wallet },
      },
      options
    );
    const baseFence = await base.fence();
    const hoodFence = await robinhood.fence();
    const transactions = Array.from({ length: 6 }, (_, index) =>
      transaction({ hash: `0x${index.toString(16).padStart(64, "0")}` })
    );
    await commitWalletBlock(
      base.deps,
      baseFence,
      base.block(1001, transactions)
    );
    await commitWalletBlock(
      robinhood.deps,
      hoodFence,
      robinhood.block(1001, transactions)
    );
    await commitWalletBlock(base.deps, baseFence, base.block(1003));
    await commitWalletBlock(robinhood.deps, hoodFence, robinhood.block(1003));
    await dispatchWalletAlerts(base.deps);
    await dispatchWalletAlerts(robinhood.deps);
    await dispatchWalletAlerts(base.deps);
    await dispatchWalletAlerts(robinhood.deps);
    const before = [...base.alerts, ...robinhood.alerts];
    expect(before.filter((alert) => alert.kind === "activity")).toHaveLength(5);
    expect(before.filter((alert) => alert.kind === "summary")).toHaveLength(0);
    base.advance(20_001);
    robinhood.advance(20_001);
    await Promise.all([
      dispatchWalletAlerts(base.deps),
      dispatchWalletAlerts(robinhood.deps),
    ]);
    const summaries = [...base.alerts, ...robinhood.alerts].filter(
      (alert) => alert.kind === "summary"
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.text).toContain("7 more onchain alerts");
    const rows = [
      ...(await store.walletActivity.list(owner, baseItem.id)),
      ...(await store.walletActivity.list(owner, hoodItem.id)),
    ];
    expect(rows.filter((row) => row.delivery === "delivered")).toHaveLength(5);
    expect(rows.filter((row) => row.delivery === "summarized")).toHaveLength(7);
    await Promise.all([
      dispatchWalletAlerts(base.deps),
      dispatchWalletAlerts(robinhood.deps),
    ]);
    expect(
      [...base.alerts, ...robinhood.alerts].filter(
        (alert) => alert.kind === "summary"
      )
    ).toHaveLength(1);
  });

  test("early finalization does not strand an event waiting for the two-block delay", async () => {
    const s = setup();
    const item = await trackWallet(s.deps, owner, input, options);
    const fence = await s.fence();
    await commitWalletBlock(
      s.deps,
      fence,
      s.block(1001, [transaction()], 1001)
    );
    await dispatchWalletAlerts(s.deps);
    const [finalized] = await s.store.walletActivity.list(owner, item.id);
    expect(finalized?.finality).toBe("finalized");
    expect(s.alerts.filter((alert) => alert.kind === "activity")).toHaveLength(
      0
    );
    await commitWalletBlock(s.deps, fence, s.block(1003, [], 1003));
    await dispatchWalletAlerts(s.deps);
    expect(s.alerts.filter((alert) => alert.kind === "activity")).toHaveLength(
      1
    );
    const [delivered] = await s.store.walletActivity.list(owner, item.id);
    expect(delivered?.delivery).toBe("delivered");
  });

  test("a reorg while Telegram is sending produces exactly one correction after delivery completes", async () => {
    const s = setup();
    const item = await trackWallet(s.deps, owner, input, options);
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001, [transaction()]));
    await dispatchWalletAlerts(s.deps);
    await commitWalletBlock(s.deps, fence, s.block(1003));
    const entered = Promise.withResolvers<null>();
    const release = Promise.withResolvers<null>();
    s.delivery(async (alert) => {
      if (alert.kind === "activity") {
        entered.resolve(null);
        await release.promise;
      }
      return { kind: "delivered", messageId: "telegram:race" };
    });
    const sending = dispatchWalletAlerts(s.deps);
    await entered.promise;
    await undoWalletBlock(s.deps, fence, {
      kind: "undo",
      lastValidBlock: 1000,
      lastValidHash: hash("b"),
      cursor: "race-rewind",
    });
    const [activity] = await s.store.walletActivity.list(owner, item.id);
    expect(activity?.finality).toBe("reverted");
    release.resolve(null);
    await sending;
    await dispatchWalletAlerts(s.deps);
    await dispatchWalletAlerts(s.deps);
    expect(s.alerts.filter((alert) => alert.kind === "activity")).toHaveLength(
      1
    );
    expect(
      s.alerts.filter((alert) => alert.kind === "correction")
    ).toHaveLength(1);
  });

  test("a late successful send resolves durable uncertainty and corrects a reorg without resending", async () => {
    const s = setup();
    const item = await trackWallet(s.deps, owner, input, options);
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001, [transaction()]));
    await dispatchWalletAlerts(s.deps);
    await commitWalletBlock(s.deps, fence, s.block(1003));
    const entered = Promise.withResolvers<null>();
    const release = Promise.withResolvers<null>();
    s.delivery(async (alert) => {
      if (alert.kind === "activity") {
        entered.resolve(null);
        await release.promise;
      }
      return { kind: "delivered", messageId: "telegram:late" };
    });
    const sending = dispatchWalletAlerts(s.deps);
    await entered.promise;
    try {
      s.advance(30_001);
      await dispatchWalletAlerts(s.deps);
      const [uncertain] = await s.store.walletActivity.list(owner, item.id);
      expect(uncertain?.delivery).toBe("uncertain");
      expect(
        s.alerts.filter((alert) => alert.kind === "activity")
      ).toHaveLength(1);
      await undoWalletBlock(s.deps, fence, {
        kind: "undo",
        lastValidBlock: 1000,
        lastValidHash: hash("b"),
        cursor: "late-rewind",
      });
    } finally {
      release.resolve(null);
      await sending;
    }
    const [delivered] = await s.store.walletActivity.list(owner, item.id);
    expect(delivered?.delivery).toBe("delivered");
    expect(delivered?.telegramMessageId).toBe("telegram:late");
    expect(delivered?.finality).toBe("reverted");
    await dispatchWalletAlerts(s.deps);
    await dispatchWalletAlerts(s.deps);
    expect(s.alerts.filter((alert) => alert.kind === "activity")).toHaveLength(
      1
    );
    expect(
      s.alerts.filter((alert) => alert.kind === "correction")
    ).toHaveLength(1);
  });

  test("the worker closes its stream after the last paused watch finishes finality reconciliation", async () => {
    const s = setup();
    const item = await trackWallet(s.deps, owner, input, options);
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001, [transaction()]));
    await updateWalletMonitor(s.deps, owner, item.id, "pause");
    await s.store.walletActivity.transact(async (tx) => {
      await tx.saveCheckpoint({ ...tx.checkpoint, leaseUntil: 0 });
    });
    const closed = Promise.withResolvers<null>();
    const controller = new AbortController();
    let advancedAfterIdle = false;
    let connections = 0;
    const timer = setTimeout(() => {
      controller.abort();
      closed.resolve(null);
    }, 2000);
    const running = runWalletMonitorWorker(
      {
        ...s.deps,
        source: {
          ...s.deps.source,
          async *blocks() {
            connections += 1;
            try {
              await Promise.resolve();
              yield s.block(1003, [], 1001);
              advancedAfterIdle = true;
              yield s.block(1004, [], 1001);
            } finally {
              closed.resolve(null);
            }
          },
        },
      },
      controller.signal
    );
    try {
      await closed.promise;
    } finally {
      controller.abort();
      clearTimeout(timer);
      await running;
    }
    expect(connections).toBe(1);
    expect(advancedAfterIdle).toBe(false);
    const [activity] = await s.store.walletActivity.list(owner, item.id);
    expect(activity?.finality).toBe("finalized");
    expect(activity?.delivery).toBe("cancelled");
    const checkpoint = await s.store.walletActivity.transact(
      async (tx) => await Promise.resolve(tx.checkpoint)
    );
    expect(checkpoint.block).toBe(1003);
    expect(checkpoint.leaseUntil).toBe(0);
  });

  test("pausing or archiving before dispatch prevents a queued activity send", async () => {
    const paused = setup();
    const pausedItem = await trackWallet(paused.deps, owner, input, options);
    const pausedFence = await paused.fence();
    await commitWalletBlock(
      paused.deps,
      pausedFence,
      paused.block(1001, [transaction()])
    );
    await dispatchWalletAlerts(paused.deps);
    await commitWalletBlock(paused.deps, pausedFence, paused.block(1003));
    await updateWalletMonitor(paused.deps, owner, pausedItem.id, "pause");
    await dispatchWalletAlerts(paused.deps);
    expect(
      paused.alerts.filter((alert) => alert.kind === "activity")
    ).toHaveLength(0);
    const [cancelled] = await paused.store.walletActivity.list(
      owner,
      pausedItem.id
    );
    expect(cancelled?.delivery).toBe("cancelled");

    const archived = setup();
    const archivedItem = await trackWallet(
      archived.deps,
      owner,
      input,
      options
    );
    const archivedFence = await archived.fence();
    await commitWalletBlock(
      archived.deps,
      archivedFence,
      archived.block(1001, [transaction()])
    );
    await dispatchWalletAlerts(archived.deps);
    await commitWalletBlock(archived.deps, archivedFence, archived.block(1003));
    await archived.store.watchlist.transact(owner, (book) => {
      const item = book.get(archivedItem.id);
      if (item) {
        book.set(item.id, {
          ...item,
          archived: true,
          revision: item.revision + 1,
        });
      }
    });
    await dispatchWalletAlerts(archived.deps);
    expect(
      archived.alerts.filter((alert) => alert.kind === "activity")
    ).toHaveLength(0);
  });
});
