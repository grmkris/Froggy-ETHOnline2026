import { expect, test } from "bun:test";

import {
  LaunchEventId,
  SessionId,
  TaskId,
  emptyTokenResearchFacts,
  userId,
} from "@froggy/domain";
import type {
  TokenResearchFacts,
  TradeInput,
  TradeResearchPolicy,
} from "@froggy/domain";
import { memoryLedger, memoryStore, stubPrivyServer } from "@froggy/wallet";

import { WorkspaceSession } from "../session";
import { stubBirdeye } from "./birdeye";
import { TradeCoordinator } from "./coordinator";
import { LaunchCoordinator } from "./launches";
import { PONS_NETWORK, SOLANA_MAINNET } from "./networks";
import { PONS_DEPLOYMENTS } from "./pons";
import { PUMP_PROGRAMS } from "./pump-state";
import { LaunchReactor } from "./reactions";
import { stubTradeBackend } from "./stub-execution";

const NETWORK = SOLANA_MAINNET;
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PONS_TOKEN = `0x${"a".repeat(40)}`;
const PONS_WALLET = `0x${"b".repeat(40)}`;

/** Pons route with a concentration cap; the launcher facts are irrelevant to the gate. */
const ponsRoute = {
  network: PONS_NETWORK,
  wallet: PONS_WALLET,
  venue: "pons" as const,
  inputAsset: PONS_DEPLOYMENTS.quote.address,
  launchFactory: PONS_DEPLOYMENTS.factory.address,
  address: PONS_TOKEN,
  source: "pons",
};
const pumpRoute = {
  network: NETWORK,
  wallet: "11111111111111111111111111111111",
  venue: "pump" as const,
  inputAsset: "native",
  launchFactory: PUMP_PROGRAMS.curve,
  address: MINT,
  source: "pump",
};

const concentrationFacts = (
  topShareBps: number,
  observedAt: number
): TokenResearchFacts => {
  const empty = emptyTokenResearchFacts({
    network: PONS_NETWORK,
    address: PONS_TOKEN,
    observedAt,
    stubbed: false,
  });
  return {
    ...empty,
    holders: {
      ...empty.holders,
      status: "observed",
      basis: "reconstructed",
      block: "100",
      holdersCounted: 40,
      topHolderCount: 10,
      topShareBps,
      denominator: "total",
      denominatorUnits: "1000000",
      supplyReconciled: true,
      coverage: "complete",
      transfersRead: 40,
      pageBudget: 5,
    },
  };
};

const setup = async (
  options: {
    readonly route?: typeof pumpRoute | typeof ponsRoute;
    readonly research?: TradeResearchPolicy;
  } = {}
) => {
  const route = options.route ?? pumpRoute;
  const store = memoryStore();
  let now = 1000;
  let quotedReturn = "100";
  let liquidity = "1000000";
  let observations = 0;
  let researchReads = 0;
  let topShareBps = 1000;
  const owner = userId(`did:privy:reaction-${crypto.randomUUID()}`);
  const session = new WorkspaceSession(
    SessionId.generate(),
    owner,
    {
      store,
      ledger: memoryLedger(),
      modes: {
        browser: "stub",
        database: "stub",
        graph: "stub",
        hedera: "stub",
        model: "stub",
        privy: "stub",
        telegram: "stub",
      },
      balances: {
        hbar: async () => await Promise.resolve(null),
        usdc: async () => await Promise.resolve(null),
      },
      networks: { evm: "eip155:8453", hedera: "hedera:testnet" },
      quote: () => null,
      onPolicyDecision: () => {},
      onReceipt: () => {},
      now: () => now,
    },
    { hosts: [], payeeIds: [] }
  );
  const base = stubTradeBackend(() => now);
  const backend = {
    ...base,
    observe: async (_input: TradeInput) => {
      await Promise.resolve();
      observations += 1;
      return {
        factory: route.launchFactory,
        expectedOutput: quotedReturn,
        quoteLiquidity: liquidity,
        observedAt: now,
      };
    },
    research: async (_input: TradeInput) => {
      await Promise.resolve();
      researchReads += 1;
      return concentrationFacts(topShareBps, now);
    },
  };
  const trades = new TradeCoordinator({
    store: store.trading,
    watches: store.launches,
    privy: stubPrivyServer(),
    backend: () => backend,
    now: () => now,
  });
  const launches = new LaunchCoordinator({
    store: store.launches,
    market: stubBirdeye(),
    providerStubbed: true,
    now: () => now,
    revokeRules: async (did, id) => {
      await trades.revokeWatchRules(did, id);
    },
  });
  const watch = await launches.create({
    owner,
    connectionId: null,
    sourceTaskId: TaskId.generate(),
    input: {
      network: route.network,
      durationMinutes: 5,
      source: null,
      minimumLiquidityUsd: null,
    },
    paymentStubbed: true,
  });
  const ruleRequest = {
    v: 1 as const,
    label: "Bounded launch reactions",
    expiresAt: watch.expiresAt,
    network: route.network,
    wallet: route.wallet,
    venues: [route.venue],
    actions: ["swap" as const],
    inputAsset: route.inputAsset,
    outputAssets: [],
    launchFactory: route.launchFactory,
    watchId: watch.id,
    exits: {
      maxHoldMinutes: 1,
      takeProfitBps: 1000,
      stopLossBps: 1000,
      minimumQuoteLiquidity: "100",
      maxAttempts: 2,
    },
    maxInputPerTrade: "100",
    maxTotalInput: "200",
    maxNativeFeePerTrade: "10",
    maxTotalNativeFee: "40",
    maxSlippageBps: 100,
    maxTrades: 2,
    maxOpenPositions: 1,
  };
  const rule = await trades.createRule(
    owner,
    options.research === undefined
      ? ruleRequest
      : { ...ruleRequest, research: options.research }
  );
  const reactor = () =>
    new LaunchReactor({
      watches: store.launches,
      store: store.trading,
      trades,
      sessionFor: async () => await Promise.resolve(session),
      now: () => now,
    });
  const emit = async () => {
    await store.launches.transact(owner, (book) => {
      const current = book.get(watch.id);
      if (current === undefined) {
        throw new Error("Missing watch fixture");
      }
      book.set(watch.id, {
        ...current,
        revision: current.revision + 1,
        events: [
          ...current.events,
          {
            v: 1,
            id: LaunchEventId.generate(),
            address: route.address,
            name: "DEMO",
            symbol: "DEMO",
            source: route.source,
            listedAt: null,
            observedAt: now,
            liquidityUsd: 100,
            membership: "unverified",
            stubbed: true,
          },
        ],
      });
    });
  };
  return {
    owner,
    store,
    trades,
    launches,
    watch,
    rule,
    reactor,
    emit,
    setTime: (value: number): void => {
      now = value;
    },
    setQuote: (value: string): void => {
      quotedReturn = value;
    },
    setLiquidity: (value: string): void => {
      liquidity = value;
    },
    observations: () => observations,
    researchReads: () => researchReads,
    setTopShareBps: (value: number): void => {
      topShareBps = value;
    },
    history: async () =>
      await store.trading.transact(owner, (book) => [...book.trades.values()]),
    state: async () => await launches.get(owner, watch.id, null),
  };
};

test("duplicate reaction workers and restarts produce one entry per observation", async () => {
  const f = await setup();
  await f.emit();
  await Promise.all([f.reactor().tick(), f.reactor().tick()]);
  const entries = await f.history();
  expect(entries).toHaveLength(1);
  expect(entries[0]?.status).toBe("completed");
  expect(entries[0]?.steps[0]?.ruleId).toBe(f.rule.id);
  const state1 = await f.state();
  expect(state1.reaction?.checksUsed).toBe(1);
  await f.reactor().tick();
  expect(await f.history()).toHaveLength(1);
  const state2 = await f.state();
  expect(state2.reaction?.checksUsed).toBe(1);
});

for (const kind of ["time", "take_profit", "stop_loss", "liquidity"] as const) {
  test(`${kind} exits spend only the confirmed acquisition under the same rule`, async () => {
    const f = await setup();
    await f.emit();
    await f.reactor().tick();
    f.setTime(kind === "time" ? 61_000 : 31_000);
    if (kind === "take_profit") {
      f.setQuote("110");
    }
    if (kind === "stop_loss") {
      f.setQuote("90");
    }
    if (kind === "liquidity") {
      f.setLiquidity("99");
    }
    await f.reactor().tick();
    const [entry, exit] = await f.history();
    expect(entry?.status).toBe("completed");
    expect(exit?.status).toBe("completed");
    expect(exit?.exitOfTradeId).toBe(entry?.id);
    expect(exit?.exitReason).toBe(kind);
    expect(exit?.input.amount).toBe(entry?.actualOutput ?? "missing");
    expect(exit?.input.tokenOut).toBe("native");
    f.setTime(91_000);
    await f.reactor().tick();
    expect(await f.history()).toHaveLength(2);
  });
}

test("cancelling observation revokes the rule before any later dispatch", async () => {
  const f = await setup();
  await f.emit();
  await f.launches.cancel(f.owner, f.watch.id, null);
  await f.reactor().tick();
  expect(await f.history()).toHaveLength(0);
  const revoked = await f.store.trading.transact(
    f.owner,
    (book) => book.rules.get(f.rule.id)?.revokedAt
  );
  expect(revoked).toBe(1000);
});

test("a revoked rule and expired observation capacity cannot dispatch entries", async () => {
  const f = await setup();
  await f.emit();
  await f.trades.revokeRule(f.owner, f.rule.id);
  await f.reactor().tick();
  expect(await f.history()).toHaveLength(0);
  const state3 = await f.state();
  expect(state3.reaction?.error).toContain("rule_inactive");
  f.setTime(f.watch.expiresAt);
  await f.reactor().tick();
  const state4 = await f.state();
  expect(state4.reaction?.checksUsed).toBe(1);
});

test("an orphaned launch cannot trigger an entry", async () => {
  const f = await setup();
  await f.emit();
  await f.store.launches.transact(f.owner, (book) => {
    const watch = book.get(f.watch.id);
    if (watch === undefined) {
      throw new Error("Missing fixture");
    }
    book.set(watch.id, {
      ...watch,
      revision: watch.revision + 1,
      orphanedEvents: watch.events.map((event) => event.id),
    });
  });
  await f.reactor().tick();
  expect(await f.history()).toHaveLength(0);
  const state = await f.state();
  expect(state.reaction?.entryCursor).toBe(1);
});

test("research predicates gate entries only; exits never wait on a research read", async () => {
  const f = await setup({
    route: ponsRoute,
    research: {
      requireTemplateMatch: false,
      forbidLaunchInsiders: false,
      insiderWindowBlocks: 600,
      maxTopHoldersBps: 5000,
      topHolderCount: 10,
    },
  });
  f.setTopShareBps(9000);
  await f.emit();
  await f.reactor().tick();
  const [refused] = await f.history();
  expect(refused?.status).toBe("awaiting_approval");
  expect(
    refused?.events.find((event) => event.outcome === "denied")?.reason
  ).toContain("research_concentration");
  expect(f.researchReads()).toBe(1);

  // The pending entry is retried on the next check with a fresh read.
  f.setTopShareBps(1000);
  f.setTime(31_000);
  await f.reactor().tick();
  const [entry] = await f.history();
  expect(entry?.id).toBe(refused?.id);
  expect(entry?.status).toBe("completed");
  expect(f.researchReads()).toBe(2);

  f.setTopShareBps(9000);
  f.setTime(95_000);
  await f.reactor().tick();
  const history = await f.history();
  const exit = history.find((trade) => trade.exitOfTradeId !== undefined);
  expect(exit?.exitOfTradeId).toBe(entry?.id);
  expect(exit?.status).toBe("completed");
  expect(exit?.exitReason).toBe("time");
  expect(f.researchReads()).toBe(2);
});
