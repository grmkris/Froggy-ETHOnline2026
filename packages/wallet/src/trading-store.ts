import { Trade, TradeRule } from "@froggy/domain";
import type {
  TradeId,
  TradeInput,
  TradePayload,
  TradeRuleId,
  TradeStep,
  UserId,
} from "@froggy/domain";
import { Schema } from "effect";

/** A transaction-local book. Nothing leaves it until the operation commits. */
export interface TradeBook {
  stopped: boolean;
  readonly trades: Map<TradeId, Trade>;
  readonly rules: Map<TradeRuleId, TradeRule>;
}

export interface TradingStore {
  /** Serializes authority checks, capital reservations and signing claims per person. */
  readonly transact: <T>(
    userId: UserId,
    operation: (book: TradeBook) => T
  ) => Promise<T>;
  readonly pendingOwners: () => Promise<readonly UserId[]>;
}

const same = (
  left: Trade | TradeRule | TradeInput | TradePayload | TradeStep,
  right: Trade | TradeRule | TradeInput | TradePayload | TradeStep
): boolean => Bun.deepEquals(left, right, true);

const validateSignedStep = (old: TradeStep, next: TradeStep): void => {
  if (old.authorizedAt !== null && old.ruleId !== next.ruleId) {
    throw new Error("trade.immutable: claimed authority cannot be replaced.");
  }
  for (const field of [
    "authorizedAt",
    "ruleId",
    "signedPayload",
    "transactionId",
    "submittedAt",
    "confirmedAt",
    "actualNativeFee",
  ] as const) {
    if (old[field] !== null && old[field] !== next[field]) {
      throw new Error(
        "trade.immutable: signing and settlement evidence cannot be replaced."
      );
    }
  }
  if (
    ["confirmed", "failed", "cancelled"].includes(old.status) &&
    !same(old, next)
  ) {
    throw new Error("trade.settled: a terminal step cannot be changed.");
  }
};

const validateProposal = (old: Trade, trade: Trade): void => {
  if (
    trade.revision !== old.revision + 1 ||
    (
      [
        "idempotencyKey",
        "inputFingerprint",
        "receiptId",
        "connectionId",
        "sourceTradeId",
        "automationRuleId",
        "launchEventId",
        "exitOfTradeId",
        "exitReason",
      ] as const
    ).some((field) => trade[field] !== old[field]) ||
    !same(trade.input, old.input) ||
    (old.actualOutput !== null && trade.actualOutput !== old.actualOutput) ||
    (old.actualInput !== undefined && trade.actualInput !== old.actualInput) ||
    (old.status !== "preparing" && trade.phase !== old.phase) ||
    trade.createdAt !== old.createdAt ||
    trade.stubbed !== old.stubbed
  ) {
    throw new Error("trade.immutable: invalid proposal revision.");
  }
  if (
    old.events.some(
      (event, index) => !Bun.deepEquals(event, trade.events[index], true)
    )
  ) {
    throw new Error(
      "trade.immutable: audit receipts cannot be changed or deleted."
    );
  }
};

const validateRevision = (old: Trade, trade: Trade): void => {
  validateProposal(old, trade);
  for (const [index, step] of old.steps.entries()) {
    const next = trade.steps[index];
    if (
      next === undefined ||
      next.id !== step.id ||
      next.kind !== step.kind ||
      next.description !== step.description ||
      next.fingerprint !== step.fingerprint ||
      next.approvalId !== step.approvalId ||
      next.expiresAt !== step.expiresAt ||
      !same(next.payload, step.payload)
    ) {
      throw new Error("trade.immutable: an existing step cannot be replaced.");
    }
    if (
      ["signing", "signed", "submitted", "confirmed", "uncertain"].includes(
        step.status
      ) &&
      ["prepared", "awaiting_approval"].includes(next.status)
    ) {
      throw new Error("trade.replay: a signing claim cannot be reset.");
    }
    validateSignedStep(step, next);
  }
};

/** Even an internal caller cannot replace an approved payload under its old identity. */
export const validateTradeBook = (
  before: TradeBook,
  after: TradeBook
): void => {
  for (const [id, candidate] of after.trades) {
    const trade = Schema.decodeUnknownSync(Trade)(candidate);
    if (id !== trade.id) {
      throw new Error("trade.identity: document and key disagree.");
    }
    const old = before.trades.get(id);
    if (old === undefined || same(old, trade)) {
      continue;
    }
    validateRevision(old, trade);
  }
  for (const id of before.trades.keys()) {
    if (!after.trades.has(id)) {
      throw new Error("trade.retention: recovery records cannot be deleted.");
    }
  }
  const keys = new Set<string>();
  for (const trade of after.trades.values()) {
    if (keys.has(trade.idempotencyKey)) {
      throw new Error("trade.idempotency: this key already has a proposal.");
    }
    keys.add(trade.idempotencyKey);
  }
  for (const [id, candidate] of after.rules) {
    const rule = Schema.decodeUnknownSync(TradeRule)(candidate);
    const old = before.rules.get(id);
    if (
      rule.id !== id ||
      (old !== undefined && !same({ ...old, revokedAt: rule.revokedAt }, rule))
    ) {
      throw new Error(
        "trade.rule_immutable: issue a new rule to change authority."
      );
    }
    if (
      old?.revokedAt !== null &&
      old?.revokedAt !== undefined &&
      rule.revokedAt !== old.revokedAt
    ) {
      throw new Error("trade.rule_revoked: revocation cannot be reversed.");
    }
  }
  for (const id of before.rules.keys()) {
    if (!after.rules.has(id)) {
      throw new Error("trade.retention: trading rules cannot be deleted.");
    }
  }
};

export const emptyTradeBook = (): TradeBook => ({
  stopped: false,
  trades: new Map(),
  rules: new Map(),
});

export const memoryTradingStore = (): TradingStore => {
  const books = new Map<UserId, TradeBook>();
  return {
    transact: async (userId, operation) => {
      await Promise.resolve();
      // The callback is synchronous: no other reservation can interleave here.
      const before = books.get(userId) ?? emptyTradeBook();
      const after = structuredClone(before);
      const result = structuredClone(operation(after));
      validateTradeBook(before, after);
      books.set(userId, structuredClone(after));
      return result;
    },
    pendingOwners: async () => {
      await Promise.resolve();
      return [...books]
        .filter(([, book]) =>
          [...book.trades.values()].some((trade) =>
            ["executing", "uncertain"].includes(trade.status)
          )
        )
        .map(([userId]) => userId);
    },
  };
};
