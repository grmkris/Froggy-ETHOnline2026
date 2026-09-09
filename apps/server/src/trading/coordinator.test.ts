import { expect, test } from "bun:test";

import { AgentTokenId, SessionId, userId } from "@froggy/domain";
import type { TradeInput } from "@froggy/domain";
import { memoryLedger, memoryStore, stubPrivyServer } from "@froggy/wallet";

import { WorkspaceSession } from "../session";
import { TradeCoordinator } from "./coordinator";
import type { TradeBackend } from "./coordinator";
import { createTradeRecovery } from "./recovery";
import { stubTradeBackend } from "./stub-execution";

const input: TradeInput = {
  network: "eip155:8453",
  venue: "uniswap",
  action: "swap",
  wallet: "0x1111111111111111111111111111111111111111",
  tokenIn: "0x2222222222222222222222222222222222222222",
  tokenOut: "0x3333333333333333333333333333333333333333",
  amount: "100",
  position: null,
  slippageBps: 100,
  maxNativeFee: "10",
};
const fixture = (overrides: Partial<TradeBackend> = {}) => {
  const store = memoryStore();
  const session = new WorkspaceSession(
    SessionId.generate(),
    userId(`did:privy:trade-${crypto.randomUUID()}`),
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
      now: () => 100,
    },
    { hosts: [], payeeIds: [] }
  );
  const backend = { ...stubTradeBackend(() => 100), ...overrides };
  const coordinator = new TradeCoordinator({
    store: store.trading,
    privy: stubPrivyServer(),
    backend: () => backend,
    now: () => 100,
  });
  return {
    store,
    session,
    coordinator,
    context: { session, connectionId: null },
    backend,
  };
};

test("one durable request survives concurrent retries and rejects changed inputs", async () => {
  const setup = fixture();
  const request = { v: 1 as const, input, idempotencyKey: "same" };
  const [first, second] = await Promise.all([
    setup.coordinator.prepare(setup.context, request),
    setup.coordinator.prepare(setup.context, request),
  ]);
  expect(first.id).toBe(second.id);
  expect(await setup.coordinator.list(setup.session.userId, null)).toHaveLength(
    1
  );
  expect(
    await setup.coordinator
      .prepare(setup.context, {
        ...request,
        input: { ...input, amount: "101" },
      })
      .then(() => null, String)
  ).toContain("idempotency");
});

test("human approval executes through the session and public results never contain signed bytes", async () => {
  const setup = fixture();
  const trade = await setup.coordinator.prepare(setup.context, {
    v: 1,
    input,
    idempotencyKey: "execute",
  });
  const [step] = trade.steps;
  if (step === undefined) {
    throw new Error("Missing step");
  }
  const answer = {
    v: 1 as const,
    stepId: step.id,
    approvalId: step.approvalId,
    fingerprint: step.fingerprint,
    decision: "allow_once" as const,
  };
  const completed = await setup.coordinator.answer(
    setup.context,
    trade.id,
    answer,
    "fixture-owner-token"
  );
  expect(completed.status).toBe("completed");
  expect(completed.stubbed).toBe(true);
  expect(completed.reservationState).toBe("released");
  expect(completed.events.map((event) => event.outcome)).toEqual([
    "prepared",
    "allowed",
    "signed",
    "submitted",
    "confirmed",
  ]);
  expect(JSON.stringify(completed)).not.toContain("signedPayload");
  const privateTrade = await setup.store.trading.transact(
    setup.session.userId,
    (book) => book.trades.get(trade.id)
  );
  expect(privateTrade?.steps[0]?.signedPayload).toStartWith("stub:");
  expect(
    await setup.coordinator
      .answer(setup.context, trade.id, answer, "fixture-owner-token")
      .then(() => null, String)
  ).toContain("state");
});

test("agent requests cannot approve and are invisible to other agent connections", async () => {
  const setup = fixture();
  const connectionId = AgentTokenId.generate();
  const context = { session: setup.session, connectionId };
  const trade = await setup.coordinator.prepare(context, {
    v: 1,
    input,
    idempotencyKey: "agent",
  });
  const [step] = trade.steps;
  if (step === undefined) {
    throw new Error("Missing step");
  }
  expect(
    await setup.coordinator
      .answer(
        context,
        trade.id,
        {
          v: 1,
          stepId: step.id,
          approvalId: step.approvalId,
          fingerprint: step.fingerprint,
          decision: "allow_once",
        },
        "token"
      )
      .then(() => null, String)
  ).toContain("human_only");
  expect(
    await setup.coordinator
      .get(setup.session.userId, trade.id, AgentTokenId.generate())
      .then(() => null, String)
  ).toContain("missing");
  expect(
    await setup.coordinator
      .get(userId("did:privy:stranger"), trade.id, null)
      .then(() => null, String)
  ).toContain("missing");
});

test("stop wins before signing and the refusal remains an audit receipt", async () => {
  const setup = fixture();
  const trade = await setup.coordinator.prepare(setup.context, {
    v: 1,
    input,
    idempotencyKey: "stop",
  });
  const [step] = trade.steps;
  if (step === undefined) {
    throw new Error("Missing step");
  }
  await setup.coordinator.stop(setup.session.userId, true);
  expect(
    await setup.coordinator
      .answer(
        setup.context,
        trade.id,
        {
          v: 1,
          stepId: step.id,
          approvalId: step.approvalId,
          fingerprint: step.fingerprint,
          decision: "allow_once",
        },
        "token"
      )
      .then(() => null, String)
  ).toContain("frozen");
  const saved = await setup.coordinator.get(
    setup.session.userId,
    trade.id,
    null
  );
  expect(saved.events.at(-1)?.outcome).toBe("denied");
  expect(saved.events.at(-1)?.reason).toContain("frozen");
  expect(saved.reservationState).toBe("none");
});

test("background recovery joins overlapping ticks, visits later trades and drains on shutdown", async () => {
  const setup = fixture();
  const ids = await Promise.all(
    Array.from({ length: 10 }, async (_, index) => {
      const trade = await setup.coordinator.prepare(setup.context, {
        v: 1,
        input,
        idempotencyKey: `recovery-${index}`,
      });
      await setup.store.trading.transact(setup.session.userId, (book) => {
        const saved = book.trades.get(trade.id);
        if (saved !== undefined) {
          book.trades.set(saved.id, {
            ...saved,
            revision: saved.revision + 1,
            status: "executing",
          });
        }
      });
      return trade.id;
    })
  );
  const visited = new Set<string>();
  const gate = Promise.withResolvers<null>();
  let calls = 0;
  const recovery = createTradeRecovery({
    store: setup.store.trading,
    recover: async (owner, id) => {
      expect(owner).toBe(setup.session.userId);
      calls += 1;
      visited.add(id);
      await gate.promise;
      if (id === ids[0]) {
        throw new Error("Provider unavailable");
      }
    },
  });
  const first = recovery.tick();
  const overlapping = recovery.tick();
  gate.resolve(null);
  await Promise.all([first, overlapping]);
  expect(calls).toBe(8);
  await recovery.tick();
  expect(visited.size).toBe(10);
  expect(calls).toBe(16);
  await recovery.close();
  await recovery.tick();
  expect(calls).toBe(16);
});

test("a simulation failure before signing records a bounded refusal without reserving funds", async () => {
  const setup = fixture({
    simulate: async () => {
      await Promise.resolve();
      throw new Error("Provider leaked secret in failure");
    },
  });
  const trade = await setup.coordinator.prepare(setup.context, {
    v: 1,
    input,
    idempotencyKey: "simulation-failure",
  });
  const [step] = trade.steps;
  if (step === undefined) {
    throw new Error("Missing step");
  }
  expect(
    await setup.coordinator
      .answer(
        setup.context,
        trade.id,
        {
          v: 1,
          stepId: step.id,
          approvalId: step.approvalId,
          fingerprint: step.fingerprint,
          decision: "allow_once",
        },
        "token"
      )
      .then(() => null, String)
  ).toContain("trade.unavailable");
  const saved = await setup.coordinator.get(
    setup.session.userId,
    trade.id,
    null
  );
  expect(saved.reservationState).toBe("none");
  expect(saved.events.at(-1)?.outcome).toBe("denied");
  expect(JSON.stringify(saved)).not.toContain("secret");
});

test("withdrawal proceeds require confirmation and remain scoped to the originating agent", async () => {
  const setup = fixture();
  const connectionId = AgentTokenId.generate();
  const context = { session: setup.session, connectionId };
  const withdrawal = await setup.coordinator.prepare(context, {
    v: 1,
    input: {
      ...input,
      venue: "enso",
      action: "withdraw",
      position: input.tokenIn,
    },
    idempotencyKey: "withdrawal-source",
  });
  const request = {
    v: 1 as const,
    input: { ...input, tokenIn: input.tokenOut, tokenOut: input.tokenIn },
    sourceTradeId: withdrawal.id,
    idempotencyKey: "withdrawal-proceeds",
  };
  expect(
    await setup.coordinator.prepare(context, request).then(() => null, String)
  ).toContain("proceeds_pending");
  expect(
    await setup.coordinator
      .prepare(
        { session: setup.session, connectionId: AgentTokenId.generate() },
        request
      )
      .then(() => null, String)
  ).toContain("trade.missing");
  const [step] = withdrawal.steps;
  if (step === undefined) {
    throw new Error("Missing withdrawal step");
  }
  const completed = await setup.coordinator.answer(
    setup.context,
    withdrawal.id,
    {
      v: 1,
      stepId: step.id,
      approvalId: step.approvalId,
      fingerprint: step.fingerprint,
      decision: "allow_once",
    },
    "fixture-owner-token"
  );
  expect(completed.status).toBe("completed");
  const proposed = await setup.coordinator.prepare(context, request);
  expect(proposed.sourceTradeId).toBe(withdrawal.id);
  expect(proposed.status).toBe("awaiting_approval");
  expect(
    await setup.coordinator
      .prepare(context, {
        v: 1,
        input: request.input,
        idempotencyKey: request.idempotencyKey,
      })
      .then(() => null, String)
  ).toContain("idempotency");
  expect(
    await setup.coordinator
      .prepare(context, {
        ...request,
        idempotencyKey: "wrong-proceeds-asset",
        input,
      })
      .then(() => null, String)
  ).toContain("proceeds_identity");
});

test("account reset revokes rules and stops new trades while preserving transaction history", async () => {
  const setup = fixture();
  const trade = await setup.coordinator.prepare(setup.context, {
    v: 1,
    input,
    idempotencyKey: "before-reset",
  });
  const rule = await setup.coordinator.createRule(setup.session.userId, {
    v: 1,
    label: "A bounded swap rule",
    expiresAt: 1000,
    network: input.network,
    wallet: input.wallet,
    venues: [input.venue],
    actions: [input.action],
    inputAsset: input.tokenIn,
    outputAssets: [input.tokenOut],
    launchFactory: null,
    maxInputPerTrade: "100",
    maxTotalInput: "100",
    maxNativeFeePerTrade: "10",
    maxTotalNativeFee: "10",
    maxSlippageBps: 100,
    maxTrades: 1,
    maxOpenPositions: 1,
  });
  await setup.coordinator.stopAndRevoke(setup.session.userId);
  const book = await setup.store.trading.transact(
    setup.session.userId,
    (current) => current
  );
  expect(book.stopped).toBe(true);
  expect(book.rules.get(rule.id)?.revokedAt).toBe(100);
  expect(book.trades.has(trade.id)).toBe(true);
  expect(
    await setup.coordinator
      .prepare(setup.context, { v: 1, input, idempotencyKey: "after-reset" })
      .then(() => null, String)
  ).toContain("trade.frozen");
  await setup.coordinator.stop(setup.session.userId, false);
  expect(
    await setup.store.trading.transact(
      setup.session.userId,
      (current) => current.rules.get(rule.id)?.revokedAt
    )
  ).toBe(100);
});
