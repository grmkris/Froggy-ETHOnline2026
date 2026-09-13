/**
 * Where an address was seen.
 *
 * A saved wallet or token is one address. Which chains it lives on is a fact
 * Froggy discovers by reading each configured RPC at one pinned block, never a
 * choice the person makes at save time. These rows sit beside the item's other
 * observations, so a chain check and a human edit cannot conflict.
 */

import { Schema } from "effect";

import { EvmAddress } from "./address";
import { EvmTradingNetwork, TradingUnits } from "./trading";

const Time = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const HexBlock = Schema.String.check(
  Schema.isPattern(/^0x(?:0|[1-9a-fA-F][\da-fA-F]{0,63})$/u)
);

/** Checked, but shown only when nothing was found on a mainnet. */
export const TESTNETS: readonly EvmTradingNetwork[] = [
  "eip155:11155111",
  "eip155:84532",
];
export const isTestnet = (network: string): boolean =>
  TESTNETS.includes(network);

const CHAIN_NAMES = new Map([
  ["eip155:1", "Ethereum"],
  ["eip155:8453", "Base"],
  ["eip155:4663", "Robinhood"],
  ["eip155:11155111", "Sepolia"],
  ["eip155:84532", "Base Sepolia"],
]);
/** The word a person reads for a chain id; the id itself when there is none. */
export const chainName = (network: string): string =>
  CHAIN_NAMES.get(network) ?? network;
/** "Base", "Base and Ethereum", "Base, Ethereum and Robinhood". */
export const listChainNames = (networks: readonly string[]): string => {
  const names = networks.map(chainName);
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
};

/** One chain's answer to "is this address here", at one pinned block. Chain state only, never a screen or a quote. */
export const AddressPresence = Schema.Struct({
  network: EvmTradingNetwork,
  status: Schema.Literals(["observed", "absent", "unavailable"]),
  kind: Schema.NullOr(Schema.Literals(["eoa", "contract"])),
  block: Schema.NullOr(HexBlock),
  nativeBalance: Schema.NullOr(TradingUnits),
  usdc: Schema.NullOr(
    Schema.Struct({
      asset: EvmAddress,
      decimals: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 36 })),
      units: TradingUnits,
    })
  ),
  token: Schema.NullOr(
    Schema.Struct({
      name: Schema.NullOr(Schema.String.check(Schema.isMaxLength(64))),
      symbol: Schema.NullOr(Schema.String.check(Schema.isMaxLength(64))),
      decimals: Schema.NullOr(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 }))
      ),
      totalSupply: Schema.NullOr(TradingUnits),
    })
  ),
  observedAt: Time,
  stubbed: Schema.Boolean,
  note: Schema.NullOr(Schema.String.check(Schema.isMaxLength(300))),
});
export type AddressPresence = typeof AddressPresence.Type;

const observed = (
  rows: readonly AddressPresence[]
): readonly AddressPresence[] =>
  rows.filter((row) => row.status === "observed");

/** Testnets are checked but shown only when nothing was found on a mainnet. */
export const visiblePresence = (
  rows: readonly AddressPresence[]
): readonly AddressPresence[] =>
  observed(rows).some((row) => !isTestnet(row.network))
    ? rows.filter((row) => !isTestnet(row.network))
    : rows;

const reportsErc20 = (row: AddressPresence): boolean =>
  row.kind === "contract" &&
  (row.token?.symbol ?? row.token?.decimals ?? null) !== null;

/** The saved tag as a fact: a contract reporting ERC-20 metadata anywhere is a token. */
export const presenceTag = (
  rows: readonly AddressPresence[]
): "token" | "wallet" | null => {
  const seen = observed(rows);
  if (seen.length === 0) {
    return null;
  }
  return seen.some(reportsErc20) ? "token" : "wallet";
};

/** A name for the item from the first visible chain that reports one. */
export const presenceTitle = (
  rows: readonly AddressPresence[]
): string | null => {
  for (const row of observed(visiblePresence(rows))) {
    const name = row.token?.name ?? row.token?.symbol ?? null;
    if (name !== null && name !== "") {
      return name;
    }
  }
  return null;
};
