import {
  EvmAddress,
  EvmTradingNetwork,
  TokenResearchFacts,
  TradingNetwork,
  TradingUnits,
} from "@froggy/domain";
import { Schema } from "effect";

/**
 * A free, bounded answer to "what is this address": code or no code, native
 * and USDC balances, and ERC-20 metadata when it is a contract, on every
 * configured EVM network or the one named. It is chain state at one pinned
 * block per network, never a quote, a screen or trading authority.
 */
export const AddressLookupInput = Schema.Struct({
  address: EvmAddress,
  network: Schema.optional(EvmTradingNetwork),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type AddressLookupInput = typeof AddressLookupInput.Type;

const LookupNote = Schema.String.check(Schema.isMaxLength(300));

export const AddressLookupNetwork = Schema.Struct({
  network: EvmTradingNetwork,
  status: Schema.Literals(["observed", "unavailable"]),
  /** Hex block quantity every read on this row was pinned to; null when unavailable. */
  block: Schema.NullOr(
    Schema.String.check(
      Schema.isPattern(/^0x(?:0|[1-9a-fA-F][\da-fA-F]{0,63})$/u)
    )
  ),
  kind: Schema.NullOr(Schema.Literals(["eoa", "contract"])),
  nativeBalance: Schema.NullOr(TradingUnits),
  usdc: Schema.NullOr(
    Schema.Struct({
      asset: EvmAddress,
      decimals: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 36 })),
      units: TradingUnits,
    })
  ),
  /** ERC-20 metadata read from the contract itself; each field null when the call reverted. */
  token: Schema.NullOr(
    Schema.Struct({
      name: Schema.optional(
        Schema.NullOr(Schema.String.check(Schema.isMaxLength(64)))
      ),
      symbol: Schema.NullOr(Schema.String.check(Schema.isMaxLength(64))),
      decimals: Schema.NullOr(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 }))
      ),
      totalSupply: Schema.NullOr(TradingUnits),
    })
  ),
  note: Schema.NullOr(LookupNote),
});
export type AddressLookupNetwork = typeof AddressLookupNetwork.Type;

export const AddressLookupResult = Schema.Struct({
  v: Schema.Literals([1]),
  operation: Schema.Literals(["address_lookup"]),
  provider: Schema.Literals(["froggy"]),
  stubbed: Schema.Boolean,
  observedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  address: EvmAddress,
  /** Which of the person's own wallets this address is, if any. */
  mine: Schema.Array(
    Schema.Literals(["agent_signer", "agent_smart_account", "owner_ethereum"])
  ).check(Schema.isMaxLength(3)),
  networks: Schema.Array(AddressLookupNetwork).check(Schema.isMaxLength(6)),
  limitations: Schema.Array(LookupNote).check(Schema.isMaxLength(8)),
});
export type AddressLookupResult = typeof AddressLookupResult.Type;

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
