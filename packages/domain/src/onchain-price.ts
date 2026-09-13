import { Schema } from "effect";

import { EvmAddress } from "./address";

const natural = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const decimals = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 36 })
);
const hash = Schema.String.check(Schema.isPattern(/^0x[0-9a-fA-F]{64}$/u));
const integer = Schema.String.check(Schema.isPattern(/^[0-9]{1,320}$/u));
export const PriceDecimal = Schema.String.check(
  Schema.isPattern(/^(?:0|[1-9][0-9]{0,77})(?:\.[0-9]{1,78})?$/u)
);
export const OnchainPriceNetwork = Schema.Literals([
  "eip155:8453",
  "eip155:4663",
]);
export type OnchainPriceNetwork = typeof OnchainPriceNetwork.Type;
export const PriceQuoteCurrency = Schema.Literals([
  "USD",
  "USDC",
  "USDG",
  "ETH",
]);
export type PriceQuoteCurrency = typeof PriceQuoteCurrency.Type;
export const PriceAsset = Schema.Union([Schema.Literal("native"), EvmAddress]);
export type PriceAsset = typeof PriceAsset.Type;

export const PriceOracleFeed = Schema.Struct({
  proxy: EvmAddress,
  aggregator: EvmAddress,
  decimals,
  heartbeatSeconds: Schema.Int.check(Schema.isGreaterThan(0)),
  sequencer: Schema.NullOr(EvmAddress),
  stockToken: Schema.NullOr(EvmAddress),
});
export type PriceOracleFeed = typeof PriceOracleFeed.Type;

const common = {
  v: Schema.Literal(1),
  key: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  network: OnchainPriceNetwork,
  token: PriceAsset,
  quoteCurrency: PriceQuoteCurrency,
  label: Schema.String.check(Schema.isMaxLength(120)),
  basis: Schema.Literal("per_token"),
  limitations: Schema.Array(Schema.String.check(Schema.isMaxLength(240))).check(
    Schema.isMaxLength(4)
  ),
};
export const ResolvedPriceSource = Schema.Union([
  Schema.Struct({
    ...common,
    kind: Schema.Literal("oracle"),
    oracle: PriceOracleFeed,
  }),
  Schema.Struct({
    ...common,
    kind: Schema.Literal("pool"),
    pool: Schema.Struct({
      protocol: Schema.Literals([
        "uniswap_v2",
        "uniswap_v3",
        "uniswap_v4",
        "aerodrome",
      ]),
      contract: EvmAddress,
      factory: Schema.NullOr(EvmAddress),
      poolId: Schema.NullOr(hash),
      token0: EvmAddress,
      token1: EvmAddress,
      tokenDecimals: decimals,
      quoteToken: EvmAddress,
      quoteDecimals: decimals,
      quoteSymbol: Schema.Literals(["USDC", "USDG", "ETH"]),
      fee: natural,
      tickSpacing: Schema.Int,
      hook: EvmAddress,
      stateView: Schema.NullOr(EvmAddress),
    }),
    conversion: Schema.NullOr(PriceOracleFeed),
  }),
]);
export type ResolvedPriceSource = typeof ResolvedPriceSource.Type;

export const PriceObservation = Schema.Struct({
  v: Schema.Literal(1),
  sourceKey: Schema.String.check(Schema.isMaxLength(200)),
  network: OnchainPriceNetwork,
  blockNumber: natural,
  blockHash: hash,
  blockTime: natural,
  status: Schema.Literals(["available", "unavailable"]),
  price: Schema.NullOr(PriceDecimal),
  numerator: Schema.NullOr(integer),
  denominator: Schema.NullOr(integer),
  reason: Schema.NullOr(Schema.String.check(Schema.isMaxLength(240))),
  stubbed: Schema.Boolean,
});
export type PriceObservation = typeof PriceObservation.Type;

export interface PriceRatio {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

export const priceDecimalRatio = (value: string): PriceRatio => {
  const decoded = Schema.decodeUnknownSync(PriceDecimal)(value);
  const [whole, fraction = ""] = decoded.split(".");
  return {
    numerator: BigInt(`${whole}${fraction}`),
    denominator: 10n ** BigInt(fraction.length),
  };
};

/** Display rounding never participates in a threshold comparison. */
export const priceRatioDecimal = (ratio: PriceRatio): string => {
  if (ratio.numerator < 0n || ratio.denominator <= 0n) {
    throw new Error("Invalid price ratio.");
  }
  const scale = 10n ** 78n;
  const scaled = (ratio.numerator * scale) / ratio.denominator;
  const raw = scaled.toString().padStart(79, "0");
  const fraction = raw.slice(-78).replace(/0+$/u, "");
  return Schema.decodeUnknownSync(PriceDecimal)(
    `${raw.slice(0, -78)}${fraction ? `.${fraction}` : ""}`
  );
};

export const matchesPriceThreshold = (
  observation: PriceObservation,
  comparison: "above" | "below",
  threshold: string
): boolean => {
  if (
    observation.status !== "available" ||
    observation.numerator === null ||
    observation.denominator === null
  ) {
    return false;
  }
  const target = priceDecimalRatio(threshold);
  const denominator = BigInt(observation.denominator);
  if (target.numerator <= 0n || denominator <= 0n) {
    return false;
  }
  const left = BigInt(observation.numerator) * target.denominator;
  const right = target.numerator * denominator;
  return comparison === "above" ? left > right : left < right;
};
