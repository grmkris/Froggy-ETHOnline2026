import { expect, test } from "bun:test";

import { TradeRule, TradeRuleId } from "@froggy/domain";
import type { Trade } from "@froggy/domain";
import { Schema } from "effect";

import { claimTradeStep } from "./trading-authority";
import { tradeFixture } from "./trading-fixture";
import { emptyTradeBook } from "./trading-store";

const expectRefusal = (
  result: ReturnType<typeof claimTradeStep>,
  reason: string
): void => {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason).toContain(reason);
  }
};

const fixture = () => {
  const entry = tradeFixture("entry");
  const rule = Schema.decodeUnknownSync(TradeRule)({
    v: 1,
    id: TradeRuleId.generate(),
    label: "Bounded position exits",
    createdAt: 1,
    expiresAt: 100_000,
    revokedAt: null,
    network: entry.input.network,
    wallet: entry.input.wallet,
    venues: [entry.input.venue],
    actions: ["swap"],
    inputAsset: entry.input.tokenIn,
    outputAssets: [entry.input.tokenOut],
    launchFactory: null,
    maxInputPerTrade: "100",
    maxTotalInput: "200",
    maxNativeFeePerTrade: "10",
    maxTotalNativeFee: "30",
    maxSlippageBps: 100,
    maxTrades: 2,
    maxOpenPositions: 1,
    exits: {
      maxHoldMinutes: 1,
      takeProfitBps: null,
      stopLossBps: null,
      minimumQuoteLiquidity: null,
      maxAttempts: 2,
    },
  });
  const acquired: Trade = {
    ...entry,
    automationRuleId: rule.id,
    status: "completed",
    actualInput: "100",
    actualOutput: "200",
    reservationState: "released",
    steps: entry.steps.map((step) => ({
      ...step,
      status: "confirmed",
      authorizedAt: 1,
      confirmedAt: 2,
      actualNativeFee: "1",
      ruleId: rule.id,
    })),
  };
  const proposal = tradeFixture("exit");
  const exit: Trade = {
    ...proposal,
    automationRuleId: rule.id,
    exitOfTradeId: acquired.id,
    exitReason: "time",
    input: {
      ...proposal.input,
      tokenIn: acquired.input.tokenOut,
      tokenOut: acquired.input.tokenIn,
      amount: "200",
    },
  };
  const [step] = exit.steps;
  if (step === undefined) {
    throw new Error("Missing fixture step");
  }
  const book = emptyTradeBook();
  book.rules.set(rule.id, rule);
  book.trades.set(acquired.id, acquired);
  book.trades.set(exit.id, exit);
  const request = {
    id: exit.id,
    stepId: step.id,
    authority: {
      kind: "rule" as const,
      ruleId: rule.id,
      verifiedFactory: null,
    },
    now: 10,
    frozen: false,
    balances: [
      { asset: exit.input.tokenIn, units: "1000" },
      { asset: "native" as const, units: "1000" },
    ],
    balanceObservedAt: 10,
  };
  return { book, entry: acquired, exit, rule, request };
};

test("exit authority accepts only the confirmed acquisition and caps its remaining amount", () => {
  const f = fixture();
  expect(claimTradeStep(f.book, f.request).ok).toBe(true);
  const excessive = fixture();
  excessive.book.trades.set(excessive.exit.id, {
    ...excessive.exit,
    input: { ...excessive.exit.input, amount: "201" },
  });
  expectRefusal(
    claimTradeStep(excessive.book, excessive.request),
    "exit_capital"
  );
  const unconfirmed = fixture();
  unconfirmed.book.trades.set(unconfirmed.entry.id, {
    ...unconfirmed.entry,
    status: "uncertain",
  });
  expectRefusal(
    claimTradeStep(unconfirmed.book, unconfirmed.request),
    "exit_source"
  );
});

test("an exit cannot substitute another wallet, quote asset, rule or human-only acquisition", () => {
  for (const mutation of ["wallet", "asset", "rule", "source"] as const) {
    const f = fixture();
    if (mutation === "wallet") {
      f.book.trades.set(f.exit.id, {
        ...f.exit,
        input: { ...f.exit.input, wallet: f.entry.input.tokenIn },
      });
    }
    if (mutation === "asset") {
      f.book.trades.set(f.exit.id, {
        ...f.exit,
        input: { ...f.exit.input, tokenOut: f.entry.input.wallet },
      });
    }
    if (mutation === "rule") {
      f.book.trades.set(f.exit.id, {
        ...f.exit,
        automationRuleId: TradeRuleId.generate(),
      });
    }
    if (mutation === "source") {
      f.book.trades.set(f.entry.id, {
        ...f.entry,
        steps: f.entry.steps.map((step) => ({ ...step, ruleId: null })),
      });
    }
    expect(claimTradeStep(f.book, f.request).ok).toBe(false);
  }
});

test("confirmed exits cannot spend the acquisition again and native fees remain cumulative", () => {
  const f = fixture();
  const previous = tradeFixture("previous-exit");
  f.book.trades.set(previous.id, {
    ...f.exit,
    id: previous.id,
    idempotencyKey: previous.idempotencyKey,
    status: "completed",
    actualInput: "200",
    actualOutput: "100",
    steps: previous.steps.map((step) => ({
      ...step,
      status: "confirmed",
      ruleId: f.rule.id,
      actualNativeFee: "1",
    })),
  });
  expectRefusal(claimTradeStep(f.book, f.request), "exit_capital");
  const gas = fixture();
  gas.book.rules.set(gas.rule.id, { ...gas.rule, maxTotalNativeFee: "10" });
  expectRefusal(claimTradeStep(gas.book, gas.request), "trade.gas");
});
