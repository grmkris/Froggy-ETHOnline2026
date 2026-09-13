import { describe, expect, test } from "bun:test";

import {
  EvmAddress,
  PriceObservation,
  ResolvedPriceSource,
  priceDecimalRatio,
  userId,
} from "@froggy/domain";
import type {
  OnchainNetwork,
  WatchlistInput,
  WatchlistItemId,
} from "@froggy/domain";
import { demoWalletStream } from "@froggy/graph";
import type { WalletStreamBlock, WalletStreamRequest } from "@froggy/graph";
import { memoryStore } from "@froggy/wallet";
import type { WalletAlert } from "@froggy/wallet";
import { Schema } from "effect";

import type { PriceResolver } from "./onchain-price";
import {
  configureOnchainMonitor,
  updateWalletMonitor,
  walletMonitorStatus,
} from "./wallet-monitor";
import {
  commitWalletBlock,
  dispatchWalletAlerts,
  runWalletMonitorWorker,
  undoWalletBlock,
} from "./wallet-monitor-worker";
import type { WalletWorkerDeps } from "./wallet-monitor-worker";
import { readBlockPrices } from "./wallet-price-events";

// Synthetic prices and addresses exercise persistence; no provider or wallet is called.
const address = (digit: string) =>
  Schema.decodeUnknownSync(EvmAddress)(`0x${digit.repeat(40)}`);
const token = address("1");
const feed = address("2");
const owner = userId("did:privy:price-events-test");
const blockHash = (number: number) =>
  `0x${number.toString(16).padStart(64, "0")}`;
const setup = (network: OnchainNetwork = "eip155:8453") => {
  const store = memoryStore();
  let now = 1_000_000;
  let head = 1000;
  let price: string | null = "11";
  let overrides: Partial<PriceObservation> = {};
  const reads: number[] = [];
  const sent: WalletAlert[] = [];
  let deliver: WalletWorkerDeps["deliver"] | undefined;
  const source = Schema.decodeUnknownSync(ResolvedPriceSource)({
    v: 1,
    key: `${network}:${token}:oracle:${feed}`,
    network,
    token,
    quoteCurrency: "USD",
    label: "Synthetic token / USD",
    basis: "per_token",
    limitations: [],
    kind: "oracle",
    oracle: {
      proxy: feed,
      aggregator: address("3"),
      decimals: 8,
      heartbeatSeconds: 3600,
      sequencer: null,
      stockToken: null,
    },
  });
  const prices: PriceResolver = {
    resolve: async () => await Promise.resolve(source),
    read: async (_source, block) => {
      reads.push(block.number);
      const ratio = price === null ? null : priceDecimalRatio(price);
      return await Promise.resolve(
        Schema.decodeUnknownSync(PriceObservation)({
          v: 1,
          sourceKey: source.key,
          network,
          blockNumber: block.number,
          blockHash: block.hash,
          blockTime: block.timestamp,
          status: ratio ? "available" : "unavailable",
          price,
          numerator: ratio?.numerator.toString() ?? null,
          denominator: ratio?.denominator.toString() ?? null,
          reason: ratio ? null : "Synthetic unavailable feed",
          stubbed: false,
          ...overrides,
        })
      );
    },
    streamSubscriptions: () => [
      { key: source.key, contract: feed, poolId: null },
    ],
  };
  const deps: WalletWorkerDeps = {
    store,
    source: { ...demoWalletStream(), stubbed: false },
    network,
    now: () => now,
    prices,
    head: async () => await Promise.resolve(head),
    headBlock: async () =>
      await Promise.resolve({
        number: head,
        hash: blockHash(head),
        timestamp: now,
      }),
    appUrl: "https://froggy.example",
    verifier: {
      verify: async () => await Promise.resolve(false),
      metadata: async () =>
        await Promise.resolve({ symbol: "TEST", decimals: 6 }),
    },
    deliver: async (alert) => {
      sent.push(alert);
      return deliver
        ? await deliver(alert)
        : await Promise.resolve({
            kind: "delivered",
            messageId: "telegram:price-test",
          });
    },
    invalidate: () => {},
  };
  const input: WatchlistInput = {
    title: "My token",
    notes: "Price watch",
    source: { _tag: "token", network, address: token },
  };
  const configure = async (
    threshold = "10",
    comparison: "above" | "below" = "above"
  ) =>
    await configureOnchainMonitor(deps, owner, input, {
      telegram: true,
      conditions: [
        { _tag: "price", comparison, threshold, quoteCurrency: "USD" },
      ],
    });
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
    changedSources: readonly string[] = [source.key]
  ): WalletStreamBlock => ({
    kind: "block",
    cursor: `price:${number}`,
    number,
    hash: blockHash(number),
    timestamp: now,
    finalizedBlock: 0,
    extended: true,
    truncated: false,
    transactions: [],
    changedSources,
    stubbed: false,
  });
  const item = async (id: WatchlistItemId) =>
    await store.walletActivity.transact(async (tx) => {
      const items = await tx.items(owner);
      return items.find((saved) => saved.id === id);
    }, network);
  const recover = async (numbers: readonly number[], finalizedBlock = 0) => {
    const requests: WalletStreamRequest[] = [];
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, 2000);
    try {
      await runWalletMonitorWorker(
        {
          ...deps,
          source: {
            ...deps.source,
            identity: async () => await Promise.resolve("fixture:recovered-v2"),
            async *blocks(request) {
              requests.push(request);
              await Promise.resolve();
              for (const number of numbers) {
                yield { ...block(number), finalizedBlock };
              }
              controller.abort();
            },
          },
        },
        controller.signal
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    expect(requests).toHaveLength(1);
    return requests;
  };
  return {
    deps,
    store,
    source,
    reads,
    sent,
    configure,
    recover,
    delivery: (next: WalletWorkerDeps["deliver"]) => {
      deliver = next;
    },
    fence,
    block,
    item,
    price: (next: string | null) => {
      price = next;
    },
    head: (next: number) => {
      head = next;
    },
    override: (next: Partial<PriceObservation>) => {
      overrides = next;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe("price rules on the shared stream", () => {
  test("a token-only watch evaluates and notifies on both networks without a wallet transaction", async () => {
    await Promise.all(
      (["eip155:8453", "eip155:4663"] as const).map(async (network) => {
        const s = setup(network);
        const item = await s.configure();
        const fence = await s.fence();
        const first = s.block(1001);
        expect(first.transactions).toEqual([]);
        expect(await commitWalletBlock(s.deps, fence, first)).toBe(true);
        const [activity] = await s.store.walletActivity.list(owner, item.id);
        expect(activity?.kind).toBe("price");
        expect(activity?.network).toBe(network);
        expect(activity?.transactionHash).toBeNull();
        expect(activity?.price?.initiallyMatched).toBe(true);
        const triggered = await s.item(item.id);
        expect(triggered?.walletMonitor?.rules?.[0]?.triggeredBlock).toBe(1001);
        await commitWalletBlock(s.deps, fence, s.block(1003));
        await dispatchWalletAlerts(s.deps);
        expect(
          s.sent.filter((alert) => alert.kind === "activity")
        ).toHaveLength(1);
        expect(s.reads).toEqual([1001]);
        await commitWalletBlock(s.deps, fence, s.block(1004));
        await dispatchWalletAlerts(s.deps);
        expect(
          s.sent.filter((alert) => alert.kind === "activity")
        ).toHaveLength(1);
      })
    );
  });

  test("threshold equality does not match and unavailable evidence never becomes zero", async () => {
    const s = setup();
    s.price("10");
    const item = await s.configure("10", "below");
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001));
    expect(await s.store.walletActivity.list(owner, item.id)).toEqual([]);
    s.price(null);
    await commitWalletBlock(s.deps, fence, s.block(1002));
    expect(await s.store.walletActivity.list(owner, item.id)).toEqual([]);
    const status = await walletMonitorStatus(s.deps, owner, item.id);
    expect(status.state).toBe("waiting_price");
    s.price("9.999999999999999999");
    await commitWalletBlock(s.deps, fence, s.block(1003));
    const [activity] = await s.store.walletActivity.list(owner, item.id);
    const triggered = await s.item(item.id);
    expect(activity?.kind).toBe("price");
    expect(triggered?.walletMonitor?.rules?.[0]?.triggeredBlock).toBe(1003);
  });

  test("unchanged sources reuse a fresh observation, while source changes and age refresh it", async () => {
    const s = setup();
    s.price("9");
    const item = await s.configure();
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001, []));
    await commitWalletBlock(s.deps, fence, s.block(1002, []));
    expect(s.reads).toEqual([1001]);
    await commitWalletBlock(s.deps, fence, s.block(1003));
    expect(s.reads).toEqual([1001, 1003]);
    s.advance(30_001);
    await commitWalletBlock(s.deps, fence, s.block(1004, []));
    expect(s.reads).toEqual([1001, 1003, 1004]);
    expect(await s.store.walletActivity.list(owner, item.id)).toEqual([]);
  });

  test("rearm explicitly resets a one-shot rule and starts after the newly observed head", async () => {
    const s = setup();
    const item = await s.configure();
    let fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001));
    await commitWalletBlock(s.deps, fence, s.block(1003));
    await dispatchWalletAlerts(s.deps);
    expect(s.sent.filter((alert) => alert.kind === "activity")).toHaveLength(1);
    s.head(1003);
    const rearmed = await updateWalletMonitor(s.deps, owner, item.id, "rearm");
    expect(rearmed.walletMonitor?.rules?.[0]?.triggeredBlock).toBeNull();
    expect(rearmed.walletMonitor?.startBlock).toBe(1004);
    fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1004));
    await commitWalletBlock(s.deps, fence, s.block(1006));
    await dispatchWalletAlerts(s.deps);
    expect(s.sent.filter((alert) => alert.kind === "activity")).toHaveLength(2);
    expect(await s.store.walletActivity.list(owner, item.id)).toHaveLength(2);
  });

  test("undo restores the pre-trigger rule and permits one replacement canonical match", async () => {
    const s = setup();
    s.price("9");
    const item = await s.configure();
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001));
    s.price("11");
    await commitWalletBlock(s.deps, fence, s.block(1002));
    const triggered = await s.item(item.id);
    expect(triggered?.walletMonitor?.rules?.[0]?.triggeredBlock).toBe(1002);
    await undoWalletBlock(s.deps, fence, {
      kind: "undo",
      lastValidBlock: 1001,
      lastValidHash: blockHash(1001),
      cursor: "price-rewind",
    });
    const restoredItem = await s.item(item.id);
    const restored = restoredItem?.walletMonitor?.rules?.[0];
    expect(restored?.triggeredBlock).toBeNull();
    expect(restored?.latest?.price).toBe("9");
    const [reverted] = await s.store.walletActivity.list(owner, item.id);
    expect(reverted?.finality).toBe("reverted");
    const replacement = { ...s.block(1002), hash: `0x${"f".repeat(64)}` };
    await commitWalletBlock(s.deps, fence, replacement);
    await commitWalletBlock(s.deps, fence, s.block(1004));
    await dispatchWalletAlerts(s.deps);
    const rows = await s.store.walletActivity.list(owner, item.id);
    expect(rows.filter((row) => row.finality !== "reverted")).toHaveLength(1);
    expect(s.sent.filter((alert) => alert.kind === "activity")).toHaveLength(1);
  });

  test("undoing old observations cannot restore price state cleared by an explicit rearm", async () => {
    const s = setup();
    s.price("9");
    const item = await s.configure();
    let fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001));
    s.price("11");
    await commitWalletBlock(s.deps, fence, s.block(1002));
    s.head(1003);
    const rearmed = await updateWalletMonitor(s.deps, owner, item.id, "rearm");
    expect(rearmed.walletMonitor?.rules?.[0]?.latest).toBeNull();
    fence = await s.fence();
    await undoWalletBlock(s.deps, fence, {
      kind: "undo",
      lastValidBlock: 1001,
      lastValidHash: blockHash(1001),
      cursor: "rearm-rewind",
    });
    const restored = await s.item(item.id);
    expect(restored?.walletMonitor?.rules?.[0]?.latest).toBeNull();
    expect(restored?.walletMonitor?.rules?.[0]?.triggeredBlock).toBeNull();
    expect(restored?.walletMonitor?.startBlock).toBe(1004);
  });

  test("a paused price rule still rolls back reverted observations without resuming", async () => {
    const s = setup();
    s.price("9");
    const item = await s.configure();
    let fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001));
    s.price("11");
    await commitWalletBlock(s.deps, fence, s.block(1002));
    await updateWalletMonitor(s.deps, owner, item.id, "pause");
    fence = await s.fence();
    await undoWalletBlock(s.deps, fence, {
      kind: "undo",
      lastValidBlock: 1001,
      lastValidHash: blockHash(1001),
      cursor: "paused-price-rewind",
    });
    const restored = await s.item(item.id);
    expect(restored?.walletMonitor?.enabled).toBe(false);
    expect(restored?.walletMonitor?.rules?.[0]?.triggeredBlock).toBeNull();
    expect(restored?.walletMonitor?.rules?.[0]?.latest?.price).toBe("9");
    await dispatchWalletAlerts(s.deps);
    expect(s.sent.filter((alert) => alert.kind === "activity")).toEqual([]);
  });

  test("initial readiness explains that an unavailable price is still pending", async () => {
    const s = setup();
    s.price(null);
    await s.configure();
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001));
    await dispatchWalletAlerts(s.deps);
    const ready = s.sent.filter((alert) => alert.kind === "ready");
    expect(ready).toHaveLength(1);
    expect(ready[0]?.text).toContain("Waiting for a valid price observation.");
    expect(s.sent.filter((alert) => alert.kind === "activity")).toEqual([]);
  });

  test("a long monitoring gap marks old provisional evidence unverified and restarts the price baseline", async () => {
    const s = setup();
    s.price("9");
    const item = await s.configure();
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001));
    s.price("11");
    await commitWalletBlock(s.deps, fence, s.block(1002));
    await commitWalletBlock(s.deps, fence, s.block(1004));
    await dispatchWalletAlerts(s.deps);
    s.advance(31 * 60_000);
    const [request] = await s.recover([2001, 2003]);
    expect(request?.cursor).toBeUndefined();
    expect(
      request?.priceSources?.some(
        (subscription) => subscription.key === s.source.key
      )
    ).toBe(true);
    await dispatchWalletAlerts(s.deps);
    const rows = await s.store.walletActivity.list(owner, item.id);
    const previous = rows.find((row) => row.blockNumber === 1002);
    const fresh = rows.find((row) => row.blockNumber === 2001);
    expect(previous?.finality).toBe("unverified");
    expect(previous?.delivery).toBe("delivered");
    expect(fresh?.price?.initiallyMatched).toBe(true);
    expect(fresh?.delivery).toBe("delivered");
    expect(s.sent.filter((alert) => alert.kind === "activity")).toHaveLength(2);
    const corrections = s.sent.filter((alert) => alert.kind === "correction");
    expect(corrections).toHaveLength(1);
    expect(corrections[0]?.text).toContain(
      "could not be reverified after a monitoring gap"
    );
    expect(corrections[0]?.text).not.toContain("chain reorganization");
    expect(corrections[0]?.key).toStartWith("gap-correction:");
  });

  test("a gap cancels undelivered provisional matches before new head alerts can send", async () => {
    const s = setup();
    const item = await s.configure();
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001));
    await dispatchWalletAlerts(s.deps);
    await commitWalletBlock(s.deps, fence, s.block(1003));
    s.advance(31 * 60_000);
    await s.recover([2001, 2003]);
    await dispatchWalletAlerts(s.deps);
    const rows = await s.store.walletActivity.list(owner, item.id);
    const previous = rows.find((row) => row.blockNumber === 1001);
    expect(previous?.finality).toBe("unverified");
    expect(previous?.delivery).toBe("cancelled");
    expect(s.sent.filter((alert) => alert.kind === "activity")).toHaveLength(1);
    expect(s.sent.filter((alert) => alert.kind === "correction")).toEqual([]);
  });

  test("gap recovery preserves a known finalized one-shot match", async () => {
    const s = setup();
    const item = await s.configure();
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, {
      ...s.block(1001),
      finalizedBlock: 1001,
    });
    await commitWalletBlock(s.deps, fence, {
      ...s.block(1003),
      finalizedBlock: 1001,
    });
    await dispatchWalletAlerts(s.deps);
    s.advance(31 * 60_000);
    await s.recover([2001, 2003], 1001);
    await dispatchWalletAlerts(s.deps);
    const preserved = await s.item(item.id);
    expect(preserved?.walletMonitor?.rules?.[0]?.triggeredBlock).toBe(1001);
    const rows = await s.store.walletActivity.list(owner, item.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.finality).toBe("finalized");
    expect(s.reads).toEqual([1001]);
    expect(s.sent.filter((alert) => alert.kind === "correction")).toEqual([]);
  });

  test("source identity replacement preserves manual rearm and refreshes its subscriptions", async () => {
    const s = setup();
    const item = await s.configure();
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001));
    await commitWalletBlock(s.deps, fence, s.block(1003));
    s.head(1004);
    const rearmed = await updateWalletMonitor(s.deps, owner, item.id, "rearm");
    await s.store.walletActivity.transact(async (tx) => {
      await tx.saveCheckpoint({
        ...tx.checkpoint,
        leaseUntil: 0,
        sourceIdentity: "previous:package",
      });
    }, s.deps.network);
    const [request] = await s.recover([1005, 1007]);
    expect(request?.cursor).toBeUndefined();
    expect(request?.priceSources).toHaveLength(1);
    const current = await s.item(item.id);
    expect(current?.walletMonitor?.revision).toBe(
      rearmed.walletMonitor?.revision
    );
    expect(current?.walletMonitor?.startBlock).toBe(1005);
    expect(current?.walletMonitor?.rules?.[0]?.triggeredBlock).toBe(1005);
    const rows = await s.store.walletActivity.list(owner, item.id);
    expect(rows.find((row) => row.blockNumber === 1001)?.finality).toBe(
      "unverified"
    );
    expect(
      rows.find((row) => row.blockNumber === 1005)?.price?.initiallyMatched
    ).toBe(true);
  });

  test("late delivery after a gap resolves uncertainty with a gap correction instead of a reorg claim", async () => {
    const s = setup();
    const item = await s.configure();
    const fence = await s.fence();
    await commitWalletBlock(s.deps, fence, s.block(1001));
    await dispatchWalletAlerts(s.deps);
    await commitWalletBlock(s.deps, fence, s.block(1003));
    const entered = Promise.withResolvers<null>();
    const release = Promise.withResolvers<null>();
    s.delivery(async (alert) => {
      if (alert.kind === "activity") {
        entered.resolve(null);
        await release.promise;
      }
      return { kind: "delivered", messageId: "telegram:gap-late" };
    });
    const sending = dispatchWalletAlerts(s.deps);
    await entered.promise;
    try {
      s.advance(31 * 60_000);
      await dispatchWalletAlerts(s.deps);
      await s.recover([2001, 2003]);
    } finally {
      release.resolve(null);
      await sending;
    }
    await dispatchWalletAlerts(s.deps);
    await dispatchWalletAlerts(s.deps);
    const rows = await s.store.walletActivity.list(owner, item.id);
    const previous = rows.find((row) => row.blockNumber === 1001);
    expect(previous?.finality).toBe("unverified");
    expect(previous?.delivery).toBe("delivered");
    expect(previous?.telegramMessageId).toBe("telegram:gap-late");
    const corrections = s.sent.filter((alert) => alert.kind === "correction");
    expect(corrections).toHaveLength(1);
    expect(corrections[0]?.text).toContain("monitoring gap");
    expect(corrections[0]?.text).not.toContain("chain reorganization");
    expect(s.sent.filter((alert) => alert.kind === "activity")).toHaveLength(2);
  });

  test("observation identity and block coordinates must match the requested price source", async () => {
    const mismatches: Partial<PriceObservation>[] = [
      { sourceKey: "another-source" },
      { blockNumber: 999 },
      { blockTime: 1 },
    ];
    await Promise.all(
      mismatches.map(async (mismatch) => {
        const s = setup();
        const item = await s.configure();
        const fence = await s.fence();
        s.override(mismatch);
        const error = await commitWalletBlock(
          s.deps,
          fence,
          s.block(1001)
        ).then(() => null, String);
        expect(error).toContain("does not match");
        expect(await s.store.walletActivity.list(owner, item.id)).toEqual([]);
        const unchanged = await s.item(item.id);
        expect(unchanged?.walletMonitor?.rules?.[0]?.latest).toBeNull();
      })
    );
  });

  test("mismatched block evidence rolls back both price state and stream checkpoint", async () => {
    const s = setup();
    const item = await s.configure();
    const fence = await s.fence();
    s.override({ blockHash: `0x${"e".repeat(64)}` });
    const error = await commitWalletBlock(s.deps, fence, s.block(1001)).then(
      () => null,
      String
    );
    expect(error).toContain("does not match");
    expect(await s.store.walletActivity.list(owner, item.id)).toEqual([]);
    const unchanged = await s.item(item.id);
    expect(unchanged?.walletMonitor?.rules?.[0]?.latest).toBeNull();
    const checkpoint = await s.store.walletActivity.transact(
      async (tx) => await Promise.resolve(tx.checkpoint),
      s.deps.network
    );
    expect(checkpoint.block).toBe(0);
  });

  test("paused, pre-start and incomplete blocks cannot cause a provider price read", async () => {
    const s = setup();
    const item = await s.configure();
    const [beforeStart, truncated, incomplete] = await Promise.all([
      readBlockPrices(s.deps, s.block(1000)),
      readBlockPrices(s.deps, { ...s.block(1001), truncated: true }),
      readBlockPrices(s.deps, { ...s.block(1001), extended: false }),
    ]);
    expect(beforeStart.size).toBe(0);
    expect(truncated.size).toBe(0);
    expect(incomplete.size).toBe(0);
    await updateWalletMonitor(s.deps, owner, item.id, "pause");
    const paused = await readBlockPrices(s.deps, s.block(1001));
    expect(paused.size).toBe(0);
    expect(s.reads).toEqual([]);
  });
});
