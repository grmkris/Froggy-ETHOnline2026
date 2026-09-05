/**
 * Money, in the two units this product actually reasons about.
 *
 * `Amount` is what a chain moves: an integer count of an asset's smallest unit,
 * carried as a decimal string because JSON has no integers wide enough and a
 * float would round a payment. `UsdMicros` is what a *mandate* is written in:
 * a cap of "$2 per transaction" has to compare a Hedera HBAR transfer against a
 * Base USDC transfer, and the only honest way to do that is to convert both to
 * one unit at the moment of the decision and record the rate on the receipt.
 *
 * Micro-dollars rather than cents because x402 prices are routinely fractions
 * of a cent, and a cap that cannot express the price it is capping is not a cap.
 */

import { Schema } from "effect";

/**
 * The chains this build settles on, as CAIP-2 identifiers.
 *
 * CAIP-2 rather than a friendly name because that is what an x402 challenge
 * carries in `accepts[].network`: a mandate that spells Base Sepolia one way
 * while every 402 spells it `eip155:84532` is a mandate that can never match.
 */
export const Network = Schema.Literals([
  "eip155:8453",
  "eip155:84532",
  "hedera:testnet",
]);
export type Network = typeof Network.Type;

/**
 * An amount in USD millionths. Integer: `2_000_000` is two dollars.
 *
 * Every cap, every running total and every threshold in the policy engine is
 * this type, so a comparison can never silently mix units.
 */
export const UsdMicros = Schema.Int.pipe(Schema.brand("UsdMicros"));
export type UsdMicros = typeof UsdMicros.Type;

export const usdMicros = (value: number): UsdMicros =>
  Schema.decodeUnknownSync(UsdMicros)(Math.round(value));

/** `2.5` dollars as `UsdMicros`. Convenience for defaults and fixtures only. */
export const usd = (dollars: number): UsdMicros =>
  usdMicros(dollars * 1_000_000);

/**
 * Render micro-dollars for a human.
 *
 * Takes a plain `number`, not `UsdMicros`. It is a formatter, and a running
 * total read back off the wire is just as much a quantity of micro-dollars as
 * a branded cap is — requiring the brand here only taught call sites to cast
 * their way past it, which is worse than not having the brand.
 */
export const formatUsd = (micros: number): string =>
  `$${(micros / 1_000_000).toFixed(micros % 10_000 === 0 ? 2 : 4)}`;

/**
 * An asset on a specific network.
 *
 * `id` is the chain's own identifier and is deliberately untyped beyond a
 * string: an EVM contract address and a Hedera entity id (`0.0.429274`) are
 * both legitimate here, and forcing them into one shape would mean inventing a
 * translation nobody asked for. `0.0.0` is native HBAR by x402 convention.
 */
export const Asset = Schema.Struct({
  decimals: Schema.Int,
  id: Schema.String,
  network: Network,
  symbol: Schema.String,
});
export type Asset = typeof Asset.Type;

/**
 * A quantity of an asset, in that asset's smallest unit.
 *
 * `units` is a decimal string, not a number: USDC has six decimals and HBAR
 * eight, and `Number` starts losing integers at 2^53. It is parsed to `bigint`
 * at the one place arithmetic happens and nowhere else.
 */
export const Amount = Schema.Struct({
  asset: Asset,
  units: Schema.String.pipe(
    Schema.check(
      Schema.isPattern(/^\d+$/u, {
        message: "Expected a non-negative integer in the asset's smallest unit",
      })
    )
  ),
});
export type Amount = typeof Amount.Type;

/**
 * The assets this build knows how to price. Anything outside this table cannot
 * be converted to `UsdMicros`, and a spend the policy engine cannot price is
 * refused rather than guessed at — see `priceInUsdMicros`.
 */
export const KNOWN_ASSETS = {
  /** Base mainnet USDC: what The Graph's x402 gateway is paid in. Real money. */
  "eip155:8453:usdc": {
    decimals: 6,
    id: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    network: "eip155:8453",
    symbol: "USDC",
  },
  "eip155:84532:usdc": {
    decimals: 6,
    id: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    network: "eip155:84532",
    symbol: "USDC",
  },
  "hedera:testnet:hbar": {
    decimals: 8,
    id: "0.0.0",
    network: "hedera:testnet",
    symbol: "HBAR",
  },
  "hedera:testnet:usdc": {
    decimals: 6,
    id: "0.0.429274",
    network: "hedera:testnet",
    symbol: "USDC",
  },
} as const satisfies Record<string, Asset>;

/**
 * A price quote used to convert an `Amount` into `UsdMicros`.
 *
 * It is a value, not a lookup, because the rate that authorised a spend has to
 * end up on the receipt. "Why did it spend?" is unanswerable if the number the
 * policy compared against is only reconstructable from a price feed that has
 * since moved.
 */
export const Quote = Schema.Struct({
  /** USD millionths per whole unit of the asset. */
  usdMicrosPerUnit: Schema.Finite,
  asOf: Schema.Int,
  source: Schema.String,
});
export type Quote = typeof Quote.Type;

/**
 * Convert an amount to the mandate's unit.
 *
 * Rounds **up**. A cap is a promise not to exceed a number, so the half-micro
 * of ambiguity belongs on the side that spends less.
 */
export const priceInUsdMicros = (amount: Amount, quote: Quote): UsdMicros => {
  const whole = Number(BigInt(amount.units)) / 10 ** amount.asset.decimals;
  return usdMicros(Math.ceil(whole * quote.usdMicrosPerUnit));
};

/** A stable-coin quote: one unit is one dollar, and we say where that came from. */
export const parQuote = (asOf: number): Quote => ({
  asOf,
  source: "par:stablecoin",
  usdMicrosPerUnit: 1_000_000,
});
