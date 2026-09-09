import { Schema } from "effect";

import {
  AgentTokenId,
  LaunchEventId,
  LaunchWatchId,
  OAuthGrantId,
  TaskId,
  TradeId,
  TradeRuleId,
} from "./id";
import { TradingAddress, TradingNetwork } from "./trading";

const Time = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const NonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const Note = Schema.String.check(Schema.isMaxLength(500));

/** Observation capacity only. This request cannot create or enlarge trading authority. */
export const LaunchWatchInput = Schema.Struct({
  network: TradingNetwork,
  durationMinutes: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 60 })
  ),
  minimumLiquidityUsd: Schema.NullOr(NonNegative),
  source: Schema.NullOr(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80))
  ),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type LaunchWatchInput = typeof LaunchWatchInput.Type;

export const LaunchObservation = Schema.Struct({
  v: Schema.Literal(1),
  id: LaunchEventId,
  address: TradingAddress,
  name: Schema.NullOr(Schema.String.check(Schema.isMaxLength(120))),
  symbol: Schema.NullOr(Schema.String.check(Schema.isMaxLength(120))),
  source: Schema.NullOr(Schema.String.check(Schema.isMaxLength(120))),
  listedAt: Schema.NullOr(Schema.String.check(Schema.isMaxLength(120))),
  observedAt: Time,
  liquidityUsd: Schema.NullOr(NonNegative),
  /** A listing provider is not evidence of membership in a launch program. */
  membership: Schema.Literals(["unverified", "factory_log"]),
  sourceAt: Schema.optionalKey(Time),
  block: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[0-9]+$/u))),
  blockHash: Schema.optionalKey(
    Schema.String.check(Schema.isPattern(/^0x[0-9a-fA-F]{64}$/u))
  ),
  transactionId: Schema.optionalKey(
    Schema.String.check(Schema.isMaxLength(128))
  ),
  stubbed: Schema.Boolean,
});
export type LaunchObservation = typeof LaunchObservation.Type;

/** Dispatch progress is data, never authority; the rule is checked again in the trading ledger. */
export const LaunchReaction = Schema.Struct({
  ruleId: TradeRuleId,
  createdAt: Time,
  nextCheckAt: Time,
  lastCheckAt: Schema.NullOr(Time),
  claimExpiresAt: Schema.NullOr(Time),
  checksUsed: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 120 })),
  maxChecks: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 120 })),
  entryCursor: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  positionCursor: Schema.Int.check(
    Schema.isBetween({ minimum: 0, maximum: 100 })
  ),
  pendingTradeId: Schema.NullOr(TradeId),
  error: Schema.NullOr(Note),
});
export type LaunchReaction = typeof LaunchReaction.Type;

export const LaunchWatch = Schema.Struct({
  v: Schema.Literal(1),
  id: LaunchWatchId,
  sourceTaskId: TaskId,
  reaction: Schema.optionalKey(LaunchReaction),
  chainCursor: Schema.optionalKey(
    Schema.Struct({
      block: Schema.String.check(Schema.isPattern(/^[0-9]+$/u)),
      blockHash: Schema.String.check(Schema.isPattern(/^0x[0-9a-fA-F]{64}$/u)),
    })
  ),
  orphanedEvents: Schema.optionalKey(
    Schema.Array(LaunchEventId).check(Schema.isMaxLength(100))
  ),
  connectionId: Schema.NullOr(Schema.Union([AgentTokenId, OAuthGrantId])),
  input: LaunchWatchInput,
  createdAt: Time,
  expiresAt: Time,
  status: Schema.Literals(["active", "completed", "cancelled"]),
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  nextPollAt: Time,
  lastPollAt: Schema.NullOr(Time),
  claimExpiresAt: Schema.NullOr(Time),
  pollsUsed: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 120 })),
  maxPolls: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 120 })),
  /** Durable deduplication covers the complete purchased capacity, including filtered listings. */
  seen: Schema.Array(TradingAddress).check(Schema.isMaxLength(2400)),
  events: Schema.Array(LaunchObservation).check(Schema.isMaxLength(100)),
  gapCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  lastGap: Schema.NullOr(Note),
  error: Schema.NullOr(Note),
  providerStubbed: Schema.Boolean,
  stubbed: Schema.Boolean,
});
export type LaunchWatch = typeof LaunchWatch.Type;
