import {
  ReceiptId,
  sameTradingAddress,
  tradeRuleRefusal,
  tradeExitRefusal,
  tradeProceedsRefusal,
} from "@froggy/domain";
import type {
  ApprovalId,
  Trade,
  TradeAssetAmount,
  TradeId,
  TradeRuleId,
  TradeRuleUsage,
  TradeStep,
  TradeStepId,
} from "@froggy/domain";

import type { TradeBook } from "./trading-store";

export type TradeAuthority =
  | {
      readonly kind: "human";
      readonly approvalId: ApprovalId;
      readonly fingerprint: string;
    }
  | {
      readonly kind: "rule";
      readonly ruleId: TradeRuleId;
      readonly verifiedFactory: string | null;
    };

export interface TradeClaimRequest {
  readonly id: TradeId;
  readonly stepId: TradeStepId;
  readonly authority: TradeAuthority;
  readonly now: number;
  readonly frozen: boolean;
  readonly balances: readonly TradeAssetAmount[];
  readonly balanceObservedAt: number;
}

export type TradeClaim =
  | { readonly ok: false; readonly reason: string }
  | { readonly ok: true; readonly trade: Trade; readonly step: TradeStep };

const refusal = (reason: string): TradeClaim => ({ ok: false, reason });
const started = (trade: Trade): boolean =>
  trade.steps.some((step) => step.authorizedAt !== null);

const ruleUsage = (
  book: TradeBook,
  id: TradeRuleId,
  current: TradeId
): TradeRuleUsage => {
  const trades = [...book.trades.values()].filter(
    (trade) =>
      trade.id !== current && trade.steps.some((step) => step.ruleId === id)
  );
  let input = 0n;
  let nativeFee = 0n;
  let openPositions = 0;
  for (const trade of trades) {
    if (trade.exitOfTradeId === undefined) {
      input += BigInt(trade.input.amount);
    }
    nativeFee +=
      trade.reservationState === "held"
        ? BigInt(trade.input.maxNativeFee)
        : trade.steps.reduce(
            (sum, step) => sum + BigInt(step.actualNativeFee ?? "0"),
            0n
          );
    if (trade.exitOfTradeId === undefined && trade.status !== "failed") {
      const exited = trades
        .filter(
          (other) =>
            other.exitOfTradeId === trade.id && other.status === "completed"
        )
        .reduce(
          (sum, other) => sum + BigInt(other.actualInput ?? other.input.amount),
          0n
        );
      if (trade.actualOutput === null || exited < BigInt(trade.actualOutput)) {
        openPositions += 1;
      }
    }
  }
  return {
    input,
    nativeFee,
    trades: trades.filter((trade) => trade.exitOfTradeId === undefined).length,
    openPositions,
  };
};

const checkAuthority = (
  book: TradeBook,
  trade: Trade,
  step: TradeStep,
  request: TradeClaimRequest
): string | null => {
  const { authority } = request;
  if (authority.kind === "human") {
    return authority.approvalId === step.approvalId &&
      authority.fingerprint === step.fingerprint
      ? null
      : "trade.approval: approval does not match this immutable step.";
  }
  const rule = book.rules.get(authority.ruleId);
  if (rule === undefined) {
    return "trade.rule_missing: no human-issued rule authorizes this trade.";
  }
  if (
    trade.automationRuleId !== undefined &&
    trade.automationRuleId !== rule.id
  ) {
    return "trade.rule_identity: this automatic proposal belongs to another rule.";
  }
  const usage = ruleUsage(book, rule.id, trade.id);
  if (trade.exitOfTradeId !== undefined) {
    const attempts = [...book.trades.values()].filter(
      (other) =>
        other.id !== trade.id && other.exitOfTradeId === trade.exitOfTradeId
    );
    let allocated = 0n;
    for (const other of attempts) {
      if (other.reservationState === "held") {
        allocated += BigInt(other.input.amount);
      } else if (other.status === "completed") {
        allocated += BigInt(other.actualInput ?? other.input.amount);
      }
    }
    return tradeExitRefusal({
      rule,
      trade,
      entry: book.trades.get(trade.exitOfTradeId),
      now: request.now,
      usage,
      allocated,
      attempts: attempts.length,
    });
  }
  return tradeRuleRefusal({
    rule,
    trade: trade.input,
    now: request.now,
    frozen: request.frozen,
    usage,
    verifiedFactory: authority.verifiedFactory,
  });
};

const reservationsFor = (trade: Trade): readonly TradeAssetAmount[] =>
  trade.input.tokenIn === "native"
    ? [
        {
          asset: "native",
          units: (
            BigInt(trade.input.amount) + BigInt(trade.input.maxNativeFee)
          ).toString(),
        },
      ]
    : [
        { asset: trade.input.tokenIn, units: trade.input.amount },
        { asset: "native", units: trade.input.maxNativeFee },
      ];

const proceedsRefusal = (book: TradeBook, trade: Trade): string | null => {
  if (trade.sourceTradeId === undefined) {
    return null;
  }
  const allocated = [...book.trades.values()]
    .filter(
      (other) =>
        other.id !== trade.id &&
        other.sourceTradeId === trade.sourceTradeId &&
        (other.reservationState === "held" ||
          other.steps.some(
            (step) => step.kind === "swap" && step.status === "confirmed"
          ))
    )
    .reduce((total, other) => total + BigInt(other.input.amount), 0n);
  return tradeProceedsRefusal(
    trade,
    book.trades.get(trade.sourceTradeId),
    allocated
  );
};

const capitalRefusal = (
  book: TradeBook,
  trade: Trade,
  request: TradeClaimRequest
): string | null => {
  const proceeds = proceedsRefusal(book, trade);
  if (proceeds !== null) {
    return proceeds;
  }
  if (
    request.balanceObservedAt > request.now ||
    request.now - request.balanceObservedAt > 15_000
  ) {
    return "trade.balance_stale: refresh balances before reserving capital.";
  }
  const required = reservationsFor(trade);
  for (const amount of required) {
    const balance = request.balances.find((entry) =>
      sameTradingAddress(trade.input.network, entry.asset, amount.asset)
    );
    const held = [...book.trades.values()]
      .filter(
        (entry) =>
          entry.id !== trade.id &&
          entry.input.network === trade.input.network &&
          sameTradingAddress(
            trade.input.network,
            entry.input.wallet,
            trade.input.wallet
          ) &&
          entry.reservationState === "held"
      )
      .reduce(
        (sum, entry) =>
          sum +
          entry.reservations
            .filter((reservation) =>
              sameTradingAddress(
                trade.input.network,
                reservation.asset,
                amount.asset
              )
            )
            .reduce(
              (total, reservation) => total + BigInt(reservation.units),
              0n
            ),
        0n
      );
    if (
      balance === undefined ||
      BigInt(balance.units) < held + BigInt(amount.units)
    ) {
      return "trade.balance: available balance after other reservations is insufficient.";
    }
  }
  return null;
};

const transactionRefusal = (book: TradeBook, trade: Trade): string | null => {
  const pending = [...book.trades.values()].some(
    (other) =>
      other.id !== trade.id &&
      other.input.network === trade.input.network &&
      sameTradingAddress(
        trade.input.network,
        other.input.wallet,
        trade.input.wallet
      ) &&
      other.reservationState === "held"
  );
  if (pending) {
    return "trade.pending: reconcile the existing wallet transaction before starting another order.";
  }
  let fees = 0n;
  for (const step of trade.steps) {
    if (step.actualNativeFee !== null) {
      fees += BigInt(step.actualNativeFee);
    } else if (step.payload.kind === "evm") {
      fees += BigInt(step.payload.gasLimit) * BigInt(step.payload.maxFeePerGas);
    } else if (step.payload.kind === "solana") {
      fees += BigInt(step.payload.nativeFeeLimit);
    }
  }
  return fees > BigInt(trade.input.maxNativeFee)
    ? "trade.gas: cumulative transaction fee bounds exceed the approved native fee budget."
    : null;
};

/** Called inside the store transaction, immediately before the sole signing attempt. */
export const claimTradeStep = (
  book: TradeBook,
  request: TradeClaimRequest
): TradeClaim => {
  if (request.frozen || book.stopped) {
    return refusal("trade.frozen: the person stopped trading.");
  }
  const trade = book.trades.get(request.id);
  if (trade === undefined) {
    return refusal("trade.missing: proposal not found.");
  }
  if (!["awaiting_approval", "executing"].includes(trade.status)) {
    return refusal(
      "trade.state: this proposal cannot start a signing attempt."
    );
  }
  if (trade.events.length > 240) {
    return refusal(
      "trade.audit_capacity: prepare a new trade after resolving this one."
    );
  }
  const index = trade.steps.findIndex((step) => step.id === request.stepId);
  const step = trade.steps[index];
  if (
    step === undefined ||
    !["prepared", "awaiting_approval"].includes(step.status)
  ) {
    return refusal(
      "trade.replay: this step is absent or has already been claimed."
    );
  }
  if (
    trade.steps.slice(0, index).some((entry) => entry.status !== "confirmed")
  ) {
    return refusal("trade.sequence: preceding steps must be confirmed first.");
  }
  if (step.expiresAt <= request.now) {
    return refusal("trade.expired: prepare a fresh transaction.");
  }
  if (
    step.simulation.status !== "passed" ||
    step.simulation.observedAt > request.now ||
    request.now - step.simulation.observedAt > 30_000 ||
    step.simulation.stubbed !== trade.stubbed
  ) {
    return refusal(
      "trade.simulation: a fresh, matching independent simulation is required."
    );
  }
  const denied =
    transactionRefusal(book, trade) ??
    checkAuthority(book, trade, step, request);
  if (denied !== null) {
    return refusal(denied);
  }
  if (!started(trade)) {
    const capital = capitalRefusal(book, trade, request);
    if (capital !== null) {
      return refusal(capital);
    }
  }
  const claimed: TradeStep = {
    ...step,
    status: "signing",
    authorizedAt: request.now,
    ruleId: request.authority.kind === "rule" ? request.authority.ruleId : null,
  };
  const next: Trade = {
    ...trade,
    events: [
      ...trade.events,
      {
        id: ReceiptId.generate(),
        at: request.now,
        stepId: step.id,
        outcome: "allowed",
        reason:
          request.authority.kind === "human"
            ? "trade.approval: exact human approval."
            : "trade.rule: authorized by a human-issued rule.",
        transactionId: null,
      },
    ],
    status: "executing",
    revision: trade.revision + 1,
    updatedAt: request.now,
    reservationState: "held",
    reservations: reservationsFor(trade),
    steps: trade.steps.map((entry) => (entry.id === step.id ? claimed : entry)),
  };
  book.trades.set(trade.id, next);
  return { ok: true, trade: next, step: claimed };
};
