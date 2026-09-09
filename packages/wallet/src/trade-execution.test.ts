import { expect, test } from "bun:test";

import { userId } from "@froggy/domain";

import { executeTradeStep, recoverTrade } from "./trade-execution";
import type { TradeSettlement, TradeSubmission } from "./trade-execution";
import { tradeFixture } from "./trading-fixture";
import { memoryTradingStore } from "./trading-store";

const setup = async () => {
  const owner = userId(`did:privy:execution-${crypto.randomUUID()}`);
  const store = memoryTradingStore();
  const trade = tradeFixture("execution");
  const [step] = trade.steps;
  if (step === undefined) {
    throw new Error("Missing fixture step");
  }
  await store.transact(owner, (book) => {
    book.trades.set(trade.id, trade);
  });
  const request = {
    id: trade.id,
    stepId: step.id,
    authority: {
      kind: "human" as const,
      approvalId: step.approvalId,
      fingerprint: step.fingerprint,
    },
    now: 10,
    frozen: false,
    balances: [
      { asset: trade.input.tokenIn, units: "1000" },
      { asset: "native" as const, units: "100" },
    ],
    balanceObservedAt: 1,
  };
  return { owner, store, trade, step, request };
};

test("persists the claim before signing and transaction identity before broadcast; a retry never signs twice", async () => {
  const { owner, store, trade, request } = await setup();
  let signs = 0;
  let broadcasts = 0;
  const submission: TradeSubmission = {
    sign: async () => {
      signs += 1;
      const saved = await store.transact(owner, (book) =>
        book.trades.get(trade.id)
      );
      expect(saved?.steps[0]?.status).toBe("signing");
      expect(saved?.reservationState).toBe("held");
      return {
        payload: "test-signed-payload",
        transactionId: "test-transaction",
      };
    },
    broadcast: async () => {
      broadcasts += 1;
      const saved = await store.transact(owner, (book) =>
        book.trades.get(trade.id)
      );
      expect(saved?.steps[0]?.signedPayload).toBe("test-signed-payload");
      expect(saved?.steps[0]?.transactionId).toBe("test-transaction");
      expect(saved?.steps[0]?.status).toBe("submitted");
    },
    reconcile: async () =>
      await Promise.resolve({
        state: "confirmed",
        nativeFee: "1",
        output: "995",
        at: 20,
      }),
  };
  const results = await Promise.allSettled([
    executeTradeStep(store, owner, request, submission),
    executeTradeStep(store, owner, request, submission),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled")
  ).toHaveLength(1);
  expect(signs).toBe(1);
  expect(broadcasts).toBe(1);
  const saved = await store.transact(owner, (book) =>
    book.trades.get(trade.id)
  );
  expect(saved?.status).toBe("completed");
  expect(saved?.actualOutput).toBe("995");
  expect(saved?.reservationState).toBe("released");
});

test("a lost signing reply retains principal and recovery never asks for a replacement signature", async () => {
  const { owner, store, trade, request } = await setup();
  let signs = 0;
  const submission: TradeSubmission = {
    sign: async () => {
      signs += 1;
      await Promise.resolve();
      throw new Error("lost signing reply");
    },
    broadcast: async () => {
      await Promise.resolve();
      throw new Error("must not broadcast");
    },
    reconcile: async () => await Promise.resolve({ state: "pending" }),
  };
  const first = await executeTradeStep(store, owner, request, submission);
  expect(first.status).toBe("uncertain");
  expect(first.reservationState).toBe("held");
  const recovered = await recoverTrade(store, owner, trade.id, submission, 20);
  expect(recovered.status).toBe("uncertain");
  expect(signs).toBe(1);
});

test("a broadcast timeout is reconciled from its saved identity after restart", async () => {
  const { owner, store, trade, request } = await setup();
  let settlement: TradeSettlement = { state: "pending" };
  let signs = 0;
  const submission: TradeSubmission = {
    sign: async () => {
      signs += 1;
      return await Promise.resolve({
        payload: "saved-wire-transaction",
        transactionId: "saved-hash",
      });
    },
    broadcast: async () => {
      await Promise.resolve();
      throw new Error("reply lost after acceptance");
    },
    reconcile: async (_trade, step) => {
      expect(step.transactionId).toBe("saved-hash");
      return await Promise.resolve(settlement);
    },
  };
  const first = await executeTradeStep(store, owner, request, submission);
  expect(first.status).toBe("uncertain");
  expect(first.reservationState).toBe("held");
  settlement = { state: "confirmed", nativeFee: "2", output: "995", at: 30 };
  const recovered = await recoverTrade(store, owner, trade.id, submission, 30);
  expect(recovered.status).toBe("completed");
  expect(recovered.reservationState).toBe("released");
  expect(signs).toBe(1);
});

test("a crash before broadcast recovers the saved signature without needing a receipt first", async () => {
  const { owner, store, trade, step } = await setup();
  await store.transact(owner, (book) => {
    book.trades.set(trade.id, {
      ...trade,
      revision: trade.revision + 1,
      status: "executing",
      reservationState: "held",
      steps: [
        {
          ...step,
          status: "signed",
          authorizedAt: 10,
          signedPayload: "saved-bytes",
          transactionId: "saved-hash",
        },
      ],
    });
  });
  let broadcasts = 0;
  const submission: TradeSubmission = {
    sign: async () => {
      await Promise.resolve();
      throw new Error("Recovery cannot sign");
    },
    broadcast: async (_trade, saved) => {
      expect(saved.signedPayload).toBe("saved-bytes");
      broadcasts += 1;
      await Promise.resolve();
    },
    reconcile: async () => {
      expect(broadcasts).toBe(1);
      return await Promise.resolve({
        state: "confirmed",
        nativeFee: "1",
        output: "199",
        at: 30,
      });
    },
  };
  await Promise.all([
    recoverTrade(store, owner, trade.id, submission, 30),
    recoverTrade(store, owner, trade.id, submission, 30),
  ]);
  expect(broadcasts).toBe(1);
  const completed = await store.transact(owner, (book) =>
    book.trades.get(trade.id)
  );
  expect(completed?.status).toBe("completed");
});

test("a crash after submitted is committed rebroadcasts identical bytes and releases only after settlement", async () => {
  const { owner, store, trade, step } = await setup();
  await store.transact(owner, (book) => {
    book.trades.set(trade.id, {
      ...trade,
      revision: trade.revision + 1,
      status: "executing",
      reservationState: "held",
      steps: [
        {
          ...step,
          status: "submitted",
          authorizedAt: 10,
          submittedAt: 10,
          signedPayload: "saved-bytes",
          transactionId: "saved-hash",
        },
      ],
    });
  });
  let broadcast = false;
  const submission: TradeSubmission = {
    sign: async () => {
      await Promise.resolve();
      throw new Error("Recovery cannot sign");
    },
    broadcast: async (_trade, saved) => {
      expect(saved.signedPayload).toBe("saved-bytes");
      expect(saved.transactionId).toBe("saved-hash");
      broadcast = true;
      await Promise.resolve();
    },
    reconcile: async () =>
      await Promise.resolve(
        broadcast
          ? { state: "confirmed", nativeFee: "1", output: "199", at: 30 }
          : { state: "pending" }
      ),
  };
  const result = await recoverTrade(store, owner, trade.id, submission, 30);
  expect(result.status).toBe("completed");
  expect(result.reservationState).toBe("released");
});

test("repeated recovery of an unknown signature does not fill the audit log", async () => {
  const { owner, store, trade, step } = await setup();
  await store.transact(owner, (book) => {
    book.trades.set(trade.id, {
      ...trade,
      revision: trade.revision + 1,
      status: "executing",
      reservationState: "held",
      steps: [{ ...step, status: "signing", authorizedAt: 10 }],
    });
  });
  const submission: TradeSubmission = {
    sign: async () => {
      await Promise.resolve();
      throw new Error("Recovery cannot sign");
    },
    broadcast: async () => {
      await Promise.resolve();
      throw new Error("No bytes to broadcast");
    },
    reconcile: async () => {
      await Promise.resolve();
      throw new Error("No identity to reconcile");
    },
  };
  const inProgress = await recoverTrade(store, owner, trade.id, submission, 30);
  expect(inProgress.steps[0]?.status).toBe("signing");
  const first = await recoverTrade(store, owner, trade.id, submission, 130_000);
  const again = await recoverTrade(store, owner, trade.id, submission, 140_000);
  expect(first.status).toBe("uncertain");
  expect(again.revision).toBe(first.revision);
  expect(again.events).toEqual(first.events);
  expect(again.reservationState).toBe("held");
});

test.each([
  { nativeFee: "1", output: "198", reason: "trade.output_below_minimum" },
  { nativeFee: "11", output: "200", reason: "trade.fee_exceeded" },
  { nativeFee: "1", output: null, reason: "trade.output_unknown" },
])(
  "confirmed settlement preserves chain facts but reports $reason",
  async ({ nativeFee, output, reason }) => {
    const { owner, store, request, trade } = await setup();
    const submission: TradeSubmission = {
      sign: async () =>
        await Promise.resolve({ payload: "saved", transactionId: "hash" }),
      broadcast: async () => {
        await Promise.resolve();
      },
      reconcile: async () =>
        await Promise.resolve({
          state: "confirmed",
          nativeFee,
          output,
          at: 20,
        }),
    };
    const result = await executeTradeStep(store, owner, request, submission);
    expect(result.status).toBe("partial");
    expect(result.steps[0]?.status).toBe("confirmed");
    expect(result.steps[0]?.actualNativeFee).toBe(nativeFee);
    expect(result.actualOutput).toBe(output);
    expect(result.error).toStartWith(reason);
    expect(result.reservationState).toBe("released");
    expect(result.events.at(-1)?.reason).toStartWith(reason);
    const recovered = await recoverTrade(
      store,
      owner,
      trade.id,
      submission,
      30
    );
    expect(recovered.revision).toBe(result.revision);
  }
);

test.each(["85", "101"])(
  "settlement preserves actual input %s and prevents rewriting its evidence",
  async (actualInput) => {
    const { owner, store, request, trade } = await setup();
    const submission: TradeSubmission = {
      sign: async () =>
        await Promise.resolve({ payload: "saved", transactionId: "hash" }),
      broadcast: async () => {
        await Promise.resolve();
      },
      reconcile: async () =>
        await Promise.resolve({
          state: "confirmed",
          nativeFee: "1",
          output: "200",
          actualInput,
          at: 20,
        }),
    };
    const result = await executeTradeStep(store, owner, request, submission);
    expect(result.actualInput).toBe(actualInput);
    expect(result.status).toBe(actualInput === "101" ? "partial" : "completed");
    if (actualInput === "101") {
      expect(result.error).toStartWith("trade.input_exceeded");
    }
    expect(result.reservationState).toBe("released");
    const changed = store.transact(owner, (book) => {
      book.trades.set(trade.id, {
        ...result,
        revision: result.revision + 1,
        actualInput: "0",
      });
    });
    expect(await changed.then(() => null, String)).toContain("trade.immutable");
    const recovered = await recoverTrade(
      store,
      owner,
      trade.id,
      submission,
      30
    );
    expect(recovered.actualInput).toBe(actualInput);
  }
);
