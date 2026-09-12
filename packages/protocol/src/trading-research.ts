import { EvmAddress, TokenResearchFacts, TradingNetwork } from "@froggy/domain";
import { Schema } from "effect";

export const TokenResearchInput = Schema.Struct({
  network: TradingNetwork,
  address: EvmAddress,
  cohortWindowBlocks: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 3000 })
  ),
  holderPageBudget: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 20 })
  ),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type TokenResearchInput = typeof TokenResearchInput.Type;

export const TokenResearchResult = Schema.Struct({
  v: Schema.Literals([1]),
  operation: Schema.Literals(["token_research"]),
  provider: Schema.Literals(["froggy"]),
  stubbed: Schema.Boolean,
  observedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  network: TradingNetwork,
  data: TokenResearchFacts,
  limitations: Schema.Array(Schema.String.check(Schema.isMaxLength(500))).check(
    Schema.isMaxLength(12)
  ),
});
export type TokenResearchResult = typeof TokenResearchResult.Type;
