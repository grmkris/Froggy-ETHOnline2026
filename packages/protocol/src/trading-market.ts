import { Schema } from "effect";

import { TradingAddress, TradingNetwork } from "./trading";

const Label = Schema.String.check(Schema.isMaxLength(120));
const NonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const Timestamp = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const MarketSearchInput = Schema.Struct({
  network: TradingNetwork,
  query: Schema.NullOr(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120))
  ),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })),
});
export type MarketSearchInput = typeof MarketSearchInput.Type;

export const TokenInspectInput = Schema.Struct({
  network: TradingNetwork,
  address: TradingAddress,
});
export type TokenInspectInput = typeof TokenInspectInput.Type;

const MarketToken = Schema.Struct({
  address: TradingAddress,
  name: Schema.NullOr(Label),
  symbol: Schema.NullOr(Label),
  decimals: Schema.NullOr(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 }))
  ),
  priceUsd: Schema.NullOr(NonNegative),
  liquidityUsd: Schema.NullOr(NonNegative),
  volume24hUsd: Schema.NullOr(NonNegative),
  priceChange24hPercent: Schema.NullOr(Schema.Finite),
  lastTradeAt: Schema.NullOr(Timestamp),
  // Birdeye's listing timestamp can omit a timezone; preserve its source text.
  listedAt: Schema.NullOr(Label),
  listingSource: Schema.NullOr(Label),
});

const SecurityFact = Schema.Struct({
  key: Label,
  value: Schema.NullOr(Schema.Union([Schema.Boolean, Schema.Finite, Label])),
  unit: Schema.Literals(["boolean", "supply_share", "provider_numeric_string"]),
});

const common = {
  v: Schema.Literal(1),
  provider: Schema.Literal("birdeye"),
  network: TradingNetwork,
  stubbed: Schema.Boolean,
  observedAt: Timestamp,
  freshness: Schema.Literal("provider_snapshot"),
  limitations: Schema.Array(Schema.String.check(Schema.isMaxLength(240))).check(
    Schema.isMaxLength(6)
  ),
};

export const MarketSearchResult = Schema.Struct({
  ...common,
  operation: Schema.Literal("market_search"),
  mode: Schema.Literals(["search", "new_listings"]),
  query: MarketSearchInput.fields.query,
  tokens: Schema.Array(MarketToken).check(Schema.isMaxLength(20)),
  truncated: Schema.Boolean,
  cursor: Schema.Null,
});
export type MarketSearchResult = typeof MarketSearchResult.Type;

export const TokenInspectResult = Schema.Struct({
  ...common,
  operation: Schema.Literal("token_inspect"),
  token: MarketToken,
  security: Schema.Struct({
    status: Schema.Literals(["reported", "unavailable"]),
    facts: Schema.Array(SecurityFact).check(Schema.isMaxLength(20)),
  }),
});
export type TokenInspectResult = typeof TokenInspectResult.Type;
