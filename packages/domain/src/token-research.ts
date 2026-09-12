/**
 * Typed token-research facts and the pure predicate that turns a human-authored
 * research policy into a named refusal before signing.
 *
 * Research reads are tolerant: each source reports observed / not_indexed /
 * unavailable / not_applicable. Rule gates are strict and fail closed: a policy
 * that needs a fact refuses when that fact is missing, stale, or the wrong
 * basis. Only own-RPC bases (venue_events, reconstructed) may gate signing.
 */

import { Schema } from "effect";

import { TradingAddress, TradingNetwork, TradingUnits } from "./trading";

const Time = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Note = Schema.String.check(Schema.isMaxLength(500));
const HexHash = Schema.String.check(Schema.isPattern(/^0x[0-9a-fA-F]{64}$/u));
const BlockNumber = Schema.String.check(Schema.isPattern(/^[0-9]+$/u));
const ShareBps = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 10_000 })
);

export const LauncherId = Schema.Literals([
  "pons",
  "pools_trade",
  "clanker",
  "zora",
  "flaunch",
  "virtuals",
  "unknown",
]);
export type LauncherId = typeof LauncherId.Type;

export const ResearchStatus = Schema.Literals([
  "observed",
  "not_indexed",
  "unavailable",
  "not_applicable",
]);
export type ResearchStatus = typeof ResearchStatus.Type;

export const LauncherFact = Schema.Struct({
  status: ResearchStatus,
  launcher: LauncherId,
  factory: Schema.NullOr(TradingAddress),
  deployer: Schema.NullOr(TradingAddress),
  feeRecipient: Schema.NullOr(TradingAddress),
  curveOrPool: Schema.NullOr(TradingAddress),
  phase: Schema.NullOr(Schema.Literals(["curve", "graduated", "standard"])),
  registrationBlock: Schema.NullOr(BlockNumber),
  note: Schema.NullOr(Note),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type LauncherFact = typeof LauncherFact.Type;

export const TokenTemplateFact = Schema.Struct({
  status: ResearchStatus,
  matches: Schema.NullOr(Schema.Boolean),
  hash: Schema.NullOr(HexHash),
  venue: Schema.NullOr(LauncherId),
  note: Schema.NullOr(Note),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type TokenTemplateFact = typeof TokenTemplateFact.Type;

export const LaunchCohortFact = Schema.Struct({
  status: ResearchStatus,
  basis: Schema.Literals(["venue_events", "first_mint_transfers", "none"]),
  launchBlock: Schema.NullOr(BlockNumber),
  launchTransaction: Schema.NullOr(
    Schema.String.check(Schema.isMaxLength(128))
  ),
  windowBlocks: Schema.Int.check(
    Schema.isBetween({ minimum: 0, maximum: 3000 })
  ),
  sameBlockBuyers: Schema.Array(TradingAddress).check(Schema.isMaxLength(100)),
  insiderBuyers: Schema.Array(TradingAddress).check(Schema.isMaxLength(20)),
  earlySellers: Schema.Array(TradingAddress).check(Schema.isMaxLength(100)),
  buyerCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  sellerCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  note: Schema.NullOr(Note),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type LaunchCohortFact = typeof LaunchCohortFact.Type;

export const HolderConcentrationFact = Schema.Struct({
  status: ResearchStatus,
  basis: Schema.Literals(["reconstructed", "indexed", "none"]),
  block: Schema.NullOr(BlockNumber),
  holdersCounted: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  topHolderCount: Schema.Int.check(
    Schema.isBetween({ minimum: 0, maximum: 20 })
  ),
  topShareBps: Schema.NullOr(ShareBps),
  denominator: Schema.Literals(["sellable", "total", "none"]),
  denominatorUnits: Schema.NullOr(TradingUnits),
  exclusions: Schema.Array(TradingAddress).check(Schema.isMaxLength(32)),
  supplyReconciled: Schema.Boolean,
  coverage: Schema.Literals(["complete", "partial", "none"]),
  transfersRead: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  pageBudget: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 20 })),
  note: Schema.NullOr(Note),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type HolderConcentrationFact = typeof HolderConcentrationFact.Type;

export const TokenScreenFact = Schema.Struct({
  status: ResearchStatus,
  isHoneypot: Schema.NullOr(Schema.Boolean),
  isMintable: Schema.NullOr(Schema.Boolean),
  isProxy: Schema.NullOr(Schema.Boolean),
  transferPausable: Schema.NullOr(Schema.Boolean),
  isBlacklisted: Schema.NullOr(Schema.Boolean),
  canTakeBackOwnership: Schema.NullOr(Schema.Boolean),
  ownerPercent: Schema.NullOr(
    Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 }))
  ),
  note: Schema.NullOr(Note),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type TokenScreenFact = typeof TokenScreenFact.Type;

/** One pinned observation of every research source for a single token. */
export const TokenResearchFacts = Schema.Struct({
  v: Schema.Literal(1),
  network: TradingNetwork,
  address: TradingAddress,
  block: Schema.NullOr(BlockNumber),
  blockHash: Schema.NullOr(HexHash),
  observedAt: Time,
  launcher: LauncherFact,
  template: TokenTemplateFact,
  cohort: LaunchCohortFact,
  holders: HolderConcentrationFact,
  screen: TokenScreenFact,
  stubbed: Schema.Boolean,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type TokenResearchFacts = typeof TokenResearchFacts.Type;

/**
 * Human-authored research requirements on a trading rule. Only own-RPC facts
 * (template, venue_events cohort, reconstructed holders) may satisfy these.
 */
export const TradeResearchPolicy = Schema.Struct({
  requireTemplateMatch: Schema.Boolean,
  forbidLaunchInsiders: Schema.Boolean,
  insiderWindowBlocks: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 3000 })
  ),
  maxTopHoldersBps: Schema.NullOr(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10_000 }))
  ),
  topHolderCount: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 20 })
  ),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type TradeResearchPolicy = typeof TradeResearchPolicy.Type;

/** Facts older than this cannot authorize a signature. */
export const RESEARCH_FRESHNESS_MS = 30_000;

const unavailable = (status: ResearchStatus): boolean =>
  status === "unavailable" ||
  status === "not_indexed" ||
  status === "not_applicable";

const templateMatchRefusal = (
  policy: TradeResearchPolicy,
  facts: TokenResearchFacts
): string | null => {
  if (!policy.requireTemplateMatch) {
    return null;
  }
  if (unavailable(facts.template.status) || facts.template.matches === null) {
    return "trade.research_template: template match was not observed.";
  }
  if (!facts.template.matches) {
    return "trade.research_template: token does not match the reviewed launcher template.";
  }
  return null;
};

const launchInsiderRefusal = (
  policy: TradeResearchPolicy,
  facts: TokenResearchFacts
): string | null => {
  if (!policy.forbidLaunchInsiders) {
    return null;
  }
  if (unavailable(facts.cohort.status)) {
    return "trade.research_insiders: launch cohort was not observed.";
  }
  if (facts.cohort.basis !== "venue_events") {
    return "trade.research_basis: launch-insider checks require venue trade events.";
  }
  if (facts.cohort.insiderBuyers.length > 0) {
    return "trade.research_insiders: deployer or fee recipient bought in the launch window.";
  }
  return null;
};

const holderConcentrationRefusal = (
  policy: TradeResearchPolicy,
  facts: TokenResearchFacts
): string | null => {
  if (policy.maxTopHoldersBps === null) {
    return null;
  }
  if (unavailable(facts.holders.status) || facts.holders.topShareBps === null) {
    return "trade.research_concentration: holder concentration was not observed.";
  }
  if (facts.holders.basis !== "reconstructed") {
    return "trade.research_basis: concentration checks require reconstructed Transfer history.";
  }
  if (!facts.holders.supplyReconciled) {
    return "trade.research_unreconciled: reconstructed supply does not match totalSupply.";
  }
  if (facts.holders.coverage !== "complete") {
    return "trade.research_concentration: holder history is incomplete for this rule.";
  }
  if (facts.holders.topHolderCount < policy.topHolderCount) {
    return "trade.research_concentration: fewer holders than the rule's top-N window.";
  }
  if (facts.holders.topShareBps > policy.maxTopHoldersBps) {
    return "trade.research_concentration: top holders exceed the authorized share.";
  }
  return null;
};

/**
 * Pure gate: named refusal when a research policy cannot be satisfied by the
 * supplied facts. Callers supply time; this function has no clock of its own.
 */
export const tradeResearchRefusal = (input: {
  readonly policy: TradeResearchPolicy;
  readonly facts: TokenResearchFacts | null;
  readonly now: number;
}): string | null => {
  const { policy, facts, now } = input;
  if (facts === null) {
    return "trade.research_missing: research facts were not supplied for this rule.";
  }
  if (facts.stubbed) {
    return "trade.research_missing: stubbed research cannot authorize a live rule.";
  }
  if (
    facts.observedAt > now ||
    now - facts.observedAt > RESEARCH_FRESHNESS_MS
  ) {
    return "trade.research_stale: refresh research facts before signing.";
  }

  return (
    templateMatchRefusal(policy, facts) ??
    launchInsiderRefusal(policy, facts) ??
    holderConcentrationRefusal(policy, facts)
  );
};

/** Empty facts used by stubs and by the fail-closed path when a read fails. */
export const emptyTokenResearchFacts = (input: {
  readonly network: TradingNetwork;
  readonly address: TradingAddress;
  readonly observedAt: number;
  readonly stubbed: boolean;
  readonly note?: string;
}): TokenResearchFacts => {
  const note = input.note ?? null;
  return {
    v: 1,
    network: input.network,
    address: input.address,
    block: null,
    blockHash: null,
    observedAt: input.observedAt,
    launcher: {
      status: "unavailable",
      launcher: "unknown",
      factory: null,
      deployer: null,
      feeRecipient: null,
      curveOrPool: null,
      phase: null,
      registrationBlock: null,
      note,
    },
    template: {
      status: "unavailable",
      matches: null,
      hash: null,
      venue: null,
      note,
    },
    cohort: {
      status: "unavailable",
      basis: "none",
      launchBlock: null,
      launchTransaction: null,
      windowBlocks: 0,
      sameBlockBuyers: [],
      insiderBuyers: [],
      earlySellers: [],
      buyerCount: 0,
      sellerCount: 0,
      note,
    },
    holders: {
      status: "unavailable",
      basis: "none",
      block: null,
      holdersCounted: 0,
      topHolderCount: 0,
      topShareBps: null,
      denominator: "none",
      denominatorUnits: null,
      exclusions: [],
      supplyReconciled: false,
      coverage: "none",
      transfersRead: 0,
      pageBudget: 0,
      note,
    },
    screen: {
      status: "unavailable",
      isHoneypot: null,
      isMintable: null,
      isProxy: null,
      transferPausable: null,
      isBlacklisted: null,
      canTakeBackOwnership: null,
      ownerPercent: null,
      note,
    },
    stubbed: input.stubbed,
  };
};
