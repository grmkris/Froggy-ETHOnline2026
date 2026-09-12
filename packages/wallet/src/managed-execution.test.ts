import { expect, test } from "bun:test";

import { TradeRuleId, userId } from "@froggy/domain";
import type { Trade } from "@froggy/domain";

import { executeTradeStep, recoverTrade } from "./trade-execution";
import type { ManagedTradeSubmission } from "./trade-execution";
import { tradeFixture } from "./trading-fixture";
import { memoryTradingStore } from "./trading-store";

const setup = async () => {
  const owner = userId(`did:privy:managed-${crypto.randomUUID()}`);
  const original = tradeFixture("managed");
  const [raw] = original.steps;
  if (raw?.payload.kind !== "evm") {
    throw new Error("Missing EVM fixture");
  }
  const trade: Trade = {
    ...original,
    steps: [
      {
        ...raw,
        payload: { kind: "evm_calls", feePayer: "app", calls: [raw.payload] },
      },
    ],
  };
  const store = memoryTradingStore();
  await store.transact(owner, (book) => {
    book.trades.set(trade.id, trade);
  });
  const request = {
    id: trade.id,
    stepId: raw.id,
    authority: {
      kind: "human" as const,
      approvalId: raw.approvalId,
      fingerprint: raw.fingerprint,
    },
    now: 10,
    frozen: false,
    balances: [
      { asset: trade.input.tokenIn, units: "100" },
      { asset: "native", units: "0" },
    ],
    balanceObservedAt: 1,
  };
  const submission: ManagedTradeSubmission = {
    kind: "privy",
    prepare: async () =>
      await Promise.resolve({
        walletId: "embedded-wallet",
        request: { sponsor: true, params: { calls: [] } },
        authorizationSignature: "owner-request-signature",
        idempotencyKey: raw.id,
        expiresAt: raw.expiresAt,
        providerTransactionId: null,
        userOperationHash: null,
      }),
    submit: async () => await Promise.resolve("privy-operation"),
    inspect: async () =>
      await Promise.resolve({
        transactionHash: null,
        userOperationHash: null,
        settlement: { state: "pending" },
      }),
  };
  return { owner, trade, store, request, submission };
};

test("managed requests reserve principal with zero ETH and persist exact authority before submission", async () => {
  const { owner, trade, store, request, submission } = await setup();
  let calls = 0;
  const sender: ManagedTradeSubmission = {
    ...submission,
    submit: async (_trade, step) => {
      calls += 1;
      const saved = await store.transact(owner, (book) =>
        book.trades.get(trade.id)
      );
      expect(saved?.reservationState).toBe("held");
      expect(saved?.reservations).toEqual([
        { asset: trade.input.tokenIn, units: "100" },
      ]);
      expect(saved?.steps[0]?.managed?.authorizationSignature).toBe(
        "owner-request-signature"
      );
      expect(saved?.steps[0]?.managed?.idempotencyKey).toBe(step.id);
      expect(saved?.steps[0]?.signedPayload).toBeNull();
      return "privy-operation";
    },
  };
  const outcomes = await Promise.allSettled([
    executeTradeStep(store, owner, request, sender),
    executeTradeStep(store, owner, request, sender),
  ]);
  expect(calls).toBe(1);
  expect(
    outcomes.filter((result) => result.status === "fulfilled")
  ).toHaveLength(1);
  const recovered = await recoverTrade(store, owner, trade.id, sender, 20);
  expect(calls).toBe(1);
  expect(recovered.steps[0]?.managed?.providerTransactionId).toBe(
    "privy-operation"
  );
  expect(recovered.steps[0]?.transactionId).toBeNull();
});

test("response loss reuses the persisted request and key; confirmation records a distinct chain hash", async () => {
  const { owner, trade, store, request, submission } = await setup();
  let attempts = 0;
  const keys: string[] = [];
  const sender: ManagedTradeSubmission = {
    ...submission,
    submit: async (_trade, step) => {
      await Promise.resolve();
      attempts += 1;
      keys.push(step.managed?.idempotencyKey ?? "missing");
      if (attempts === 1) {
        throw new Error("response lost after submission");
      }
      return "privy-operation";
    },
    inspect: async () =>
      await Promise.resolve({
        transactionHash: `0x${"a".repeat(64)}`,
        userOperationHash: `0x${"b".repeat(64)}`,
        settlement: {
          state: "confirmed",
          nativeFee: "0",
          sponsoredNativeFee: "45",
          actualInput: "100",
          output: "200",
          at: 30,
        },
      }),
  };
  const unknown = await executeTradeStep(store, owner, request, sender);
  expect(unknown.status).toBe("uncertain");
  expect(unknown.reservationState).toBe("held");
  const done = await recoverTrade(store, owner, trade.id, sender, 20);
  expect(keys).toEqual([request.stepId, request.stepId]);
  expect(done.status).toBe("completed");
  expect(done.steps[0]?.actualNativeFee).toBe("0");
  expect(done.steps[0]?.sponsoredNativeFee).toBe("45");
  expect(done.steps[0]?.transactionId).toBe(`0x${"a".repeat(64)}`);
  expect(done.steps[0]?.managed?.providerTransactionId).toBe("privy-operation");
  expect(done.steps[0]?.managed?.userOperationHash).toBe(`0x${"b".repeat(64)}`);
  expect(done.reservationState).toBe("released");
});

test("expired unknown requests retain reservations and cannot be replaced or resubmitted", async () => {
  const { owner, trade, store, request, submission } = await setup();
  let calls = 0;
  const sender: ManagedTradeSubmission = {
    ...submission,
    submit: async () => {
      calls += 1;
      await Promise.resolve();
      throw new Error("response lost");
    },
  };
  await executeTradeStep(store, owner, request, sender);
  const unknown = await recoverTrade(store, owner, trade.id, sender, 100_001);
  expect(calls).toBe(1);
  expect(unknown.status).toBe("uncertain");
  expect(unknown.reservationState).toBe("held");
  const overwrite = store.transact(owner, (book) => {
    book.trades.set(trade.id, {
      ...unknown,
      revision: unknown.revision + 1,
      steps: unknown.steps.map((step) => {
        if (step.managed === undefined) {
          throw new Error("Missing saved request");
        }
        return {
          ...step,
          managed: { ...step.managed, idempotencyKey: "replacement" },
        };
      }),
    });
  });
  expect(await overwrite.then(() => null, String)).toContain("trade.immutable");
});

test("a trading rule cannot grant batch authority and a freeze prevents submission", async () => {
  const { owner, store, request, submission } = await setup();
  expect(
    await executeTradeStep(
      store,
      owner,
      { ...request, frozen: true },
      submission
    ).then(() => null, String)
  ).toContain("trade.frozen");
  expect(
    await executeTradeStep(
      store,
      owner,
      {
        ...request,
        authority: {
          kind: "rule",
          ruleId: TradeRuleId.generate(),
          verifiedFactory: null,
          research: null,
        },
      },
      submission
    ).then(() => null, String)
  ).toContain("trade.human_only");
});
