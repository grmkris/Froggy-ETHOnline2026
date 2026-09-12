import { EvmAddress, TradeQuoteId } from "@froggy/domain";
import { Schema } from "effect";

import { EvmTradingNetwork, TradingUnits } from "./trading";

const QuoteAsset = Schema.Union([Schema.Literal("native"), EvmAddress]);

const ShortText = Schema.String.check(Schema.isMaxLength(128));
const Timestamp = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const PoolId = Schema.String.check(Schema.isPattern(/^0x[\da-fA-F]{64}$/u));

export const SwapQuoteInput = Schema.Struct({
  network: EvmTradingNetwork,
  wallet: EvmAddress,
  tokenIn: QuoteAsset,
  tokenOut: QuoteAsset,
  amount: TradingUnits.check(
    Schema.makeFilter((value) => BigInt(value) > 0n, {
      message: "The quoted amount must be positive.",
    })
  ),
  slippageBps: Schema.Int.check(
    Schema.isGreaterThanOrEqualTo(1),
    Schema.isLessThanOrEqualTo(5000)
  ),
});
export type SwapQuoteInput = typeof SwapQuoteInput.Type;

const routeFields = {
  tokenIn: EvmAddress,
  tokenOut: EvmAddress,
  feeTier: Schema.NullOr(TradingUnits),
  tickSpacing: Schema.NullOr(Schema.Int),
};
const RouteHop = Schema.Union([
  Schema.Struct({
    ...routeFields,
    protocol: Schema.Literals(["v2", "v3"]),
    pool: EvmAddress,
    hook: Schema.Null,
  }),
  Schema.Struct({
    ...routeFields,
    protocol: Schema.Literals(["v4"]),
    pool: PoolId,
    hook: EvmAddress,
  }),
]);
const ApprovalSummary = Schema.Struct({
  kind: Schema.Literals(["approve", "reset"]),
  token: EvmAddress,
  spender: EvmAddress,
  amount: TradingUnits,
  exceedsRequestedAmount: Schema.Boolean,
});
const PermitSummary = Schema.Struct({
  kind: Schema.Literals(["PermitSingle"]),
  verifyingContract: EvmAddress,
  spender: EvmAddress,
  token: EvmAddress,
  amount: TradingUnits,
  nonce: TradingUnits,
  expiration: TradingUnits,
  signatureDeadline: TradingUnits,
});
const FeeOutput = Schema.Struct({
  token: EvmAddress,
  recipient: EvmAddress,
  amount: TradingUnits,
  minimumAmount: Schema.NullOr(TradingUnits),
});

/** Informational quote only. No returned field is a transaction or signing capability. */
export const SwapQuoteResult = Schema.Struct({
  v: Schema.Literals([1]),
  operation: Schema.Literals(["quote_action"]),
  provider: Schema.Literals(["uniswap"]),
  stubbed: Schema.Boolean,
  observedAt: Timestamp,
  network: EvmTradingNetwork,
  quoteId: TradeQuoteId,
  requestId: Schema.NullOr(ShortText),
  providerQuoteId: Schema.NullOr(ShortText),
  refreshAfter: Timestamp,
  providerExpiresAt: Schema.Null,
  input: SwapQuoteInput,
  routing: Schema.Literals(["CLASSIC"]),
  output: Schema.Struct({
    token: QuoteAsset,
    expectedAmount: TradingUnits,
    minimumAmount: Schema.NullOr(TradingUnits),
  }),
  route: Schema.Array(
    Schema.Array(RouteHop).check(Schema.isMaxLength(8))
  ).check(Schema.isMaxLength(8)),
  approval: Schema.Struct({
    status: Schema.Literals([
      "not_applicable",
      "sufficient",
      "required",
      "reset_required",
    ]),
    requestId: Schema.NullOr(ShortText),
    transactions: Schema.Array(ApprovalSummary).check(Schema.isMaxLength(2)),
    gasFee: Schema.NullOr(TradingUnits),
    resetGasFee: Schema.NullOr(TradingUnits),
  }),
  permit: Schema.NullOr(PermitSummary),
  feeOutputs: Schema.Array(FeeOutput).check(Schema.isMaxLength(8)),
  gas: Schema.Struct({
    units: Schema.NullOr(TradingUnits),
    nativeFee: Schema.NullOr(TradingUnits),
    includesApprovals: Schema.Literals([false]),
  }),
  simulation: Schema.Struct({
    source: Schema.Literals(["provider"]),
    status: Schema.Literals(["passed", "failed", "unavailable", "unknown"]),
    failureReasons: Schema.Array(ShortText).check(Schema.isMaxLength(8)),
    independentlySimulated: Schema.Literals([false]),
    blockNumber: Schema.NullOr(TradingUnits),
  }),
  limitations: Schema.Array(Schema.String.check(Schema.isMaxLength(300))).check(
    Schema.isMaxLength(8)
  ),
});
export type SwapQuoteResult = typeof SwapQuoteResult.Type;
