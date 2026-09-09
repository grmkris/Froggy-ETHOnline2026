import { minimumTradeOutput, ReceiptId, TradeEvent } from "@froggy/domain";
import type { Trade, TradeId, TradeStep, UserId } from "@froggy/domain";
import { Schema } from "effect";

import { claimTradeStep } from "./trading-authority";
import type { TradeClaimRequest } from "./trading-authority";
import type { TradingStore } from "./trading-store";

export type TradeSettlement =
  | { readonly state: "pending" }
  | {
      readonly state: "confirmed" | "reverted";
      readonly nativeFee: string;
      readonly output: string | null;
      readonly actualInput?: string;
      readonly at: number;
    };

/** The adapter verifies the signed payload matches the claimed transaction before returning it. */
export interface TradeSubmission {
  readonly sign: (
    trade: Trade,
    step: TradeStep
  ) => Promise<{ readonly payload: string; readonly transactionId: string }>;
  readonly broadcast: (trade: Trade, step: TradeStep) => Promise<void>;
  readonly reconcile: (
    trade: Trade,
    step: TradeStep
  ) => Promise<TradeSettlement>;
}

const mutate = async (
  store: TradingStore,
  owner: UserId,
  id: TradeId,
  update: (trade: Trade) => Trade
): Promise<Trade> =>
  await store.transact(owner, (book) => {
    const current = book.trades.get(id);
    if (current === undefined) {
      throw new Error("trade.missing: trade not found.");
    }
    const next = update(current);
    if (next === current) {
      return current;
    }
    const events = next.steps.flatMap((step) => {
      const old = current.steps.find((entry) => entry.id === step.id);
      if (old?.status === step.status) {
        return [];
      }
      return [
        Schema.decodeUnknownSync(TradeEvent)({
          id: ReceiptId.generate(),
          at: next.updatedAt,
          stepId: step.id,
          outcome: step.status,
          reason:
            step.error ?? `trade.${step.status}: transaction state recorded.`,
          transactionId: step.transactionId,
        }),
      ];
    });
    const saved = {
      ...next,
      events: [...next.events, ...events],
      revision: current.revision + 1,
    };
    book.trades.set(id, saved);
    return saved;
  });

const updateStep = (
  trade: Trade,
  id: TradeStep["id"],
  patch: Partial<TradeStep>
): readonly TradeStep[] =>
  trade.steps.map((step) => (step.id === id ? { ...step, ...patch } : step));

const uncertain = async (
  store: TradingStore,
  owner: UserId,
  trade: Trade,
  step: TradeStep,
  message: string,
  now: number
): Promise<Trade> =>
  await mutate(store, owner, trade.id, (current) => {
    const latest = current.steps.find((entry) => entry.id === step.id);
    if (
      latest === undefined ||
      (latest.status === "uncertain" && latest.error === message) ||
      ["confirmed", "failed", "cancelled"].includes(latest.status)
    ) {
      return current;
    }
    return {
      ...current,
      status: "uncertain",
      updatedAt: now,
      error: message,
      steps: updateStep(current, step.id, {
        status: "uncertain",
        error: message,
      }),
    };
  });

const settlementRefusal = (
  trade: Trade,
  step: TradeStep,
  settlement: Exclude<TradeSettlement, { state: "pending" }>
): string | null => {
  if (settlement.state === "reverted") {
    return "trade.reverted: the chain confirmed a reverted transaction.";
  }
  if (
    settlement.actualInput !== undefined &&
    BigInt(settlement.actualInput) > BigInt(trade.input.amount)
  ) {
    return "trade.input_exceeded: settled principal exceeds the approved input cap.";
  }
  const fees = trade.steps.reduce(
    (total, entry) =>
      total +
      BigInt(
        entry.id === step.id
          ? settlement.nativeFee
          : (entry.actualNativeFee ?? "0")
      ),
    0n
  );
  if (fees > BigInt(trade.input.maxNativeFee)) {
    return "trade.fee_exceeded: settled native costs exceed the approved budget.";
  }
  const lastAction = trade.steps.findLast(
    (entry) => !["approve", "permit"].includes(entry.kind)
  );
  if (lastAction?.id === step.id && trade.minimumOutput !== null) {
    if (settlement.output === null) {
      return "trade.output_unknown: the transaction confirmed but its proceeds could not be established.";
    }
    if (
      BigInt(settlement.output) <
      minimumTradeOutput(trade, settlement.actualInput)
    ) {
      return "trade.output_below_minimum: settled proceeds are below the approved minimum.";
    }
  }
  return null;
};

const applySettlement = async (
  store: TradingStore,
  owner: UserId,
  trade: Trade,
  step: TradeStep,
  settlement: Exclude<TradeSettlement, { state: "pending" }>
): Promise<Trade> =>
  await mutate(store, owner, trade.id, (current) => {
    const latest = current.steps.find((entry) => entry.id === step.id);
    if (
      latest === undefined ||
      ["confirmed", "failed"].includes(latest.status)
    ) {
      return current;
    }
    const succeeded = settlement.state === "confirmed";
    const error = settlementRefusal(current, latest, settlement);
    const steps = updateStep(current, step.id, {
      status: succeeded ? "confirmed" : "failed",
      confirmedAt: settlement.at,
      actualNativeFee: settlement.nativeFee,
      error,
    }).map((entry): TradeStep =>
      error !== null && ["prepared", "awaiting_approval"].includes(entry.status)
        ? { ...entry, status: "cancelled", error }
        : entry
    );
    const complete = steps.every((entry) => entry.status === "confirmed");
    let status: Trade["status"] = complete ? "completed" : "awaiting_approval";
    if (error !== null) {
      status = steps.some((entry) => entry.status === "confirmed")
        ? "partial"
        : "failed";
    }
    const updated: Trade = {
      ...current,
      steps,
      status,
      updatedAt: settlement.at,
      actualOutput: settlement.output ?? current.actualOutput,
      reservationState: complete || error !== null ? "released" : "held",
      error,
    };
    return settlement.actualInput === undefined
      ? updated
      : { ...updated, actualInput: settlement.actualInput };
  });

/** A receipt is authoritative; a timeout or signing exception never releases a reservation. */
export const reconcileTradeStep = async (
  store: TradingStore,
  owner: UserId,
  trade: Trade,
  step: TradeStep,
  submission: Pick<TradeSubmission, "reconcile">
): Promise<Trade> => {
  const settlement = await submission.reconcile(trade, step);
  return settlement.state === "pending"
    ? trade
    : await applySettlement(store, owner, trade, step, settlement);
};

const broadcastSaved = async (
  store: TradingStore,
  owner: UserId,
  trade: Trade,
  step: TradeStep,
  submission: TradeSubmission,
  now: number
): Promise<Trade> => {
  let shouldBroadcast = false;
  const submitted = await mutate(store, owner, trade.id, (current) => {
    const latest = current.steps.find((entry) => entry.id === step.id);
    if (latest?.status !== "signed") {
      return current;
    }
    shouldBroadcast = true;
    return {
      ...current,
      status: "executing",
      updatedAt: now,
      steps: updateStep(current, step.id, {
        status: "submitted",
        submittedAt: now,
      }),
    };
  });
  if (!shouldBroadcast) {
    return submitted;
  }
  try {
    await submission.broadcast(submitted, step);
    return await reconcileTradeStep(store, owner, submitted, step, submission);
  } catch {
    return await uncertain(
      store,
      owner,
      submitted,
      step,
      "trade.submission_unknown: reconcile this transaction before another order. No replacement was signed.",
      now
    );
  }
};

/** Authority and reservation commit before signing; the exact signed identity commits before broadcast. */
export const executeTradeStep = async (
  store: TradingStore,
  owner: UserId,
  request: TradeClaimRequest,
  submission: TradeSubmission
): Promise<Trade> => {
  const claim = await store.transact(owner, (book) => {
    const result = claimTradeStep(book, request);
    if (!result.ok) {
      const trade = book.trades.get(request.id);
      if (trade !== undefined && trade.events.length < 241) {
        book.trades.set(trade.id, {
          ...trade,
          revision: trade.revision + 1,
          updatedAt: request.now,
          error: result.reason,
          events: [
            ...trade.events,
            {
              id: ReceiptId.generate(),
              at: request.now,
              stepId: request.stepId,
              outcome: "denied",
              reason: result.reason,
              transactionId: null,
            },
          ],
        });
      }
    }
    return result;
  });
  if (!claim.ok) {
    throw new Error(claim.reason);
  }
  const { trade, step } = claim;
  let signed: Awaited<ReturnType<TradeSubmission["sign"]>>;
  try {
    signed = await submission.sign(trade, step);
  } catch {
    return await uncertain(
      store,
      owner,
      trade,
      step,
      "trade.signing_unknown: signing did not return a verified transaction. Automatic retry is disabled.",
      request.now
    );
  }
  const saved = await mutate(store, owner, trade.id, (current) => ({
    ...current,
    updatedAt: request.now,
    steps: updateStep(current, step.id, {
      status: "signed",
      signedPayload: signed.payload,
      transactionId: signed.transactionId,
    }),
  }));
  const savedStep = saved.steps.find((entry) => entry.id === step.id);
  if (savedStep === undefined) {
    throw new Error("trade.recovery: signed step disappeared.");
  }
  return await broadcastSaved(
    store,
    owner,
    saved,
    savedStep,
    submission,
    request.now
  );
};

/** Recovery can only rebroadcast an already persisted transaction, never request a replacement signature. */
export const recoverTrade = async (
  store: TradingStore,
  owner: UserId,
  id: TradeId,
  submission: TradeSubmission,
  now: number
): Promise<Trade> => {
  const trade = await store.transact(owner, (book) => book.trades.get(id));
  if (trade === undefined) {
    throw new Error("trade.missing: trade not found.");
  }
  const step = trade.steps.find((entry) =>
    ["signing", "signed", "submitted", "uncertain"].includes(entry.status)
  );
  if (step === undefined) {
    return trade;
  }
  if (step.transactionId === null || step.signedPayload === null) {
    if (step.status === "signing" && now - trade.updatedAt < 120_000) {
      return trade;
    }
    return await uncertain(
      store,
      owner,
      trade,
      step,
      "trade.signing_unknown: no persisted transaction identity; inspect wallet activity before resolving this reservation.",
      now
    );
  }
  if (step.status === "signed") {
    return await broadcastSaved(store, owner, trade, step, submission, now);
  }
  const reconciled = await reconcileTradeStep(
    store,
    owner,
    trade,
    step,
    submission
  );
  if (reconciled.revision !== trade.revision) {
    return reconciled;
  }
  // A crash can occur after committing submitted but before sending.
  // Reusing the exact saved bytes is idempotent on chain, even across workers.
  try {
    await submission.broadcast(trade, step);
  } catch {
    return trade;
  }
  return await reconcileTradeStep(store, owner, trade, step, submission);
};
