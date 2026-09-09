import { Schema } from "effect";

import { EvmAddress } from "./address";

/** Data and trade networks are independent of the service payment network. */
export const EvmTradingNetwork = Schema.String.check(
  Schema.isPattern(/^eip155:[1-9]\d{0,9}$/u)
);
export type EvmTradingNetwork = typeof EvmTradingNetwork.Type;

const SolanaTradingNetwork = Schema.Literals([
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
]);
export const TradingNetwork = Schema.Union([
  EvmTradingNetwork,
  SolanaTradingNetwork,
]);
export type TradingNetwork = typeof TradingNetwork.Type;

export const TradingUnits = Schema.String.check(
  Schema.isPattern(/^(?:0|[1-9]\d{0,77})$/u),
  Schema.makeFilter((value) => BigInt(value) < 2n ** 256n, {
    message: "Amount must fit in an unsigned 256-bit integer.",
  })
);
export type TradingUnits = typeof TradingUnits.Type;

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const hasBase58Size = (value: string, bytes: number): boolean => {
  let number = 0n;
  for (const character of value) {
    const digit = BASE58.indexOf(character);
    if (digit === -1) {
      return false;
    }
    number = number * 58n + BigInt(digit);
  }
  const leadingZeroes = value.length - value.replace(/^1+/u, "").length;
  const significantBytes =
    number === 0n ? 0 : Math.ceil(number.toString(16).length / 2);
  return leadingZeroes + significantBytes === bytes;
};

export const SolanaTradingAddress = Schema.String.check(
  Schema.isPattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u),
  Schema.makeFilter((value) => hasBase58Size(value, 32), {
    message: "A Solana address must encode exactly 32 bytes.",
  })
);

export const TradingAddress = Schema.Union([EvmAddress, SolanaTradingAddress]);
export type TradingAddress = typeof TradingAddress.Type;

/** EVM checksums do not create a new account; Solana address case is significant. */
export const sameTradingAddress = (
  network: TradingNetwork,
  left: string,
  right: string
): boolean =>
  network.startsWith("eip155:")
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
