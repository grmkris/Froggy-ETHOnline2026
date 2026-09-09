import { TradeInput, TradingUnits } from "@froggy/domain";
import { Schema } from "effect";

export const TradePositionsInput = Schema.Struct({
  network: TradeInput.fields.network,
});
export const TradePosition = Schema.Struct({
  asset: TradeInput.fields.tokenIn,
  symbol: Schema.NullOr(Schema.String.check(Schema.isMaxLength(64))),
  decimals: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 36 })),
  units: Schema.NullOr(TradingUnits),
  reservedUnits: TradingUnits,
  availableUnits: Schema.NullOr(TradingUnits),
  kind: Schema.Literals(["native", "token", "vault", "unavailable"]),
  underlying: Schema.NullOr(TradeInput.fields.tokenIn),
  withdrawableShares: Schema.NullOr(TradingUnits),
  withdrawableAssets: Schema.NullOr(TradingUnits),
  recordedDeposits: TradingUnits,
  recordedWithdrawals: TradingUnits,
  realizedYield: Schema.NullOr(TradingUnits),
  limitation: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
});
export type TradePosition = typeof TradePosition.Type;
export const TradePositions = Schema.Struct({
  v: Schema.Literal(1),
  network: TradeInput.fields.network,
  wallet: TradeInput.fields.wallet,
  observedAt: Schema.Int,
  block: Schema.String.check(Schema.isMaxLength(128)),
  positions: Schema.Array(TradePosition).check(Schema.isMaxLength(21)),
  truncated: Schema.Boolean,
  stubbed: Schema.Boolean,
  limitations: Schema.Array(Schema.String.check(Schema.isMaxLength(500))).check(
    Schema.isMaxLength(8)
  ),
});
export type TradePositions = typeof TradePositions.Type;
