import { EvmAddress } from "@froggy/domain";
import {
  MarketSearchInput,
  MarketSearchResult,
  SolanaTradingAddress,
  TokenInspectInput,
  TokenInspectResult,
} from "@froggy/protocol";
import type { TradingNetwork } from "@froggy/protocol";
import { Redacted, Schema } from "effect";

import { boundedBytes, safeFetch } from "../outbound";
import type { OutboundOptions } from "../outbound";
import { PONS_NETWORK, SOLANA_MAINNET } from "./networks";

// https://data.birdeye.so/docs/resources/data-coverage/supported-networks
// Solana CAIP-2: https://namespaces.chainagnostic.org/solana/caip2
const CHAINS = {
  "eip155:1": "ethereum",
  "eip155:10": "optimism",
  "eip155:56": "bsc",
  "eip155:137": "polygon",
  "eip155:324": "zksync",
  "eip155:999": "hyperevm",
  // Robinhood Chain. Birdeye answers overview, listings and trending here, but
  // `token_security` returns 401 on this plan, so inspection reports security
  // as unavailable rather than as a clean screen.
  [PONS_NETWORK]: "robinhood",
  "eip155:5000": "mantle",
  "eip155:8453": "base",
  "eip155:42161": "arbitrum",
  "eip155:43114": "avalanche",
  [SOLANA_MAINNET]: "solana",
};
export const BIRDEYE_NETWORKS: readonly TradingNetwork[] = Object.keys(CHAINS);

const BODY_LIMIT = 256 * 1024;
const OptionalText = Schema.optionalKey(Schema.NullOr(Schema.String));
const OptionalNumber = Schema.optionalKey(Schema.NullOr(Schema.Finite));
const OptionalAmount = Schema.optionalKey(
  Schema.NullOr(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)))
);
const OptionalFlag = Schema.optionalKey(Schema.NullOr(Schema.Boolean));
const OptionalDecimals = Schema.optionalKey(
  Schema.NullOr(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 }))
  )
);
const OptionalSeconds = Schema.optionalKey(
  Schema.NullOr(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000_000_000 }))
  )
);
const Identity = {
  address: Schema.String,
  name: OptionalText,
  symbol: OptionalText,
  decimals: OptionalDecimals,
  liquidity: OptionalAmount,
};
const Listing = Schema.Struct({
  ...Identity,
  source: OptionalText,
  liquidityAddedAt: OptionalText,
});
const SearchToken = Schema.Struct({
  ...Identity,
  network: Schema.String,
  price: OptionalAmount,
  volume_24h_usd: OptionalAmount,
  price_change_24h_percent: OptionalNumber,
  last_trade_unix_time: OptionalSeconds,
});
const Overview = Schema.Struct({
  ...Identity,
  price: OptionalAmount,
  v24hUSD: OptionalAmount,
  priceChange24hPercent: OptionalNumber,
  lastTradeUnixTime: OptionalSeconds,
});
const ListingResponse = Schema.Struct({
  success: Schema.Literal(true),
  data: Schema.Struct({ items: Schema.Array(Listing) }),
});
const SearchResponse = Schema.Struct({
  success: Schema.Literal(true),
  data: Schema.Struct({
    items: Schema.Array(
      Schema.Union([
        Schema.Struct({
          type: Schema.Literal("token"),
          result: Schema.Array(SearchToken),
        }),
        Schema.Struct({
          type: Schema.Literal("market"),
          result: Schema.Array(Schema.Unknown),
        }),
      ])
    ),
  }),
});
const OverviewResponse = Schema.Struct({
  success: Schema.Literal(true),
  data: Overview,
});
const SolanaSecurity = Schema.Struct({
  mutableMetadata: OptionalFlag,
  fakeToken: OptionalFlag,
  freezeable: OptionalFlag,
  transferFeeEnable: OptionalFlag,
  isToken2022: OptionalFlag,
  nonTransferable: OptionalFlag,
  top10HolderPercent: OptionalNumber,
  top10UserPercent: OptionalNumber,
});
const EvmSecurity = Schema.Struct({
  isHoneypot: OptionalText,
  isMintable: OptionalText,
  isOpenSource: OptionalText,
  isProxy: OptionalText,
  cannotBuy: OptionalText,
  cannotSellAll: OptionalText,
  canTakeBackOwnership: OptionalText,
  hiddenOwner: OptionalText,
  isBlacklisted: OptionalText,
  transferPausable: OptionalText,
  buyTax: OptionalText,
  sellTax: OptionalText,
});
const SolanaSecurityResponse = Schema.Struct({
  success: Schema.Literal(true),
  data: SolanaSecurity,
});
const EvmSecurityResponse = Schema.Struct({
  success: Schema.Literal(true),
  data: EvmSecurity,
});

type Token = TokenInspectResult["token"];
type Security = TokenInspectResult["security"];
type Fact = Security["facts"][number];
interface Birdeye {
  search: (input: MarketSearchInput) => Promise<MarketSearchResult>;
  inspect: (input: TokenInspectInput) => Promise<TokenInspectResult>;
}
interface BirdeyeQuery {
  [key: string]: string;
}
interface BirdeyeOptions {
  readonly apiKey: Redacted.Redacted;
  readonly outbound?: OutboundOptions;
  readonly now?: () => number;
}

const chainFor = (network: TradingNetwork): string => {
  const chain = Object.entries(CHAINS).find(([id]) => id === network)?.[1];
  if (chain === undefined) {
    throw new Error("Birdeye does not support this configured network.");
  }
  return chain;
};
const addressFor = (address: string, network: TradingNetwork): string => {
  const schema = network.startsWith("eip155:")
    ? EvmAddress
    : SolanaTradingAddress;
  try {
    return Schema.decodeUnknownSync(schema)(address);
  } catch {
    throw new Error(
      "Birdeye token address does not match the requested network."
    );
  }
};
const label = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const clipped = value.slice(0, 120);
  const last = clipped.codePointAt(clipped.length - 1);
  if (last !== undefined && last >= 0xd8_00 && last <= 0xdb_ff) {
    return clipped.slice(0, -1);
  }
  return clipped;
};
const seconds = (value: number | null | undefined): number | null =>
  value === null || value === undefined ? null : value * 1000;
const tokenBase = (
  item: typeof Listing.Type,
  network: TradingNetwork
): Token => ({
  address: addressFor(item.address, network),
  name: label(item.name),
  symbol: label(item.symbol),
  decimals: item.decimals ?? null,
  priceUsd: null,
  liquidityUsd: item.liquidity ?? null,
  volume24hUsd: null,
  priceChange24hPercent: null,
  lastTradeAt: null,
  listedAt: label(item.liquidityAddedAt),
  listingSource: label(item.source),
});
const snapshot = (
  network: TradingNetwork,
  observedAt: number,
  stubbed: boolean
) => ({
  v: 1 as const,
  provider: "birdeye" as const,
  network,
  observedAt,
  stubbed,
  freshness: "provider_snapshot" as const,
});
const SEARCH_LIMITATIONS = [
  "One bounded provider page; no pagination cursor is exposed.",
  "Observed time records retrieval, not the age of every provider field. Listings are discovery leads, not quality signals.",
];
const INSPECT_LIMITATIONS = [
  "Observed time records retrieval, not the age of every provider field. Amounts use Birdeye raw UI mode.",
  "Security facts are provider reports, not guarantees of safety or sellability. Null means unknown.",
  "Supply shares retain fractional units. Tax strings retain provider units; no percentage conversion is assumed.",
];
const boolFact = (key: string, value: boolean | null | undefined): Fact => ({
  key,
  value: value ?? null,
  unit: "boolean",
});
const stringFlag = (key: string, value: string | null | undefined): Fact => {
  if (value === "1") {
    return boolFact(key, true);
  }
  return boolFact(key, value === "0" ? false : null);
};
const taxFact = (key: string, value: string | null | undefined): Fact => ({
  key,
  value:
    value !== null &&
    value !== undefined &&
    /^\d+(?:\.\d+)?$/u.test(value) &&
    value.length <= 120
      ? value
      : null,
  unit: "provider_numeric_string",
});
const solanaFacts = (data: typeof SolanaSecurity.Type): readonly Fact[] => [
  boolFact("mutableMetadata", data.mutableMetadata),
  boolFact("fakeToken", data.fakeToken),
  boolFact("freezeable", data.freezeable),
  boolFact("transferFeeEnable", data.transferFeeEnable),
  boolFact("isToken2022", data.isToken2022),
  boolFact("nonTransferable", data.nonTransferable),
  {
    key: "top10HolderPercent",
    value: data.top10HolderPercent ?? null,
    unit: "supply_share",
  },
  {
    key: "top10UserPercent",
    value: data.top10UserPercent ?? null,
    unit: "supply_share",
  },
];
const evmFacts = (data: typeof EvmSecurity.Type): readonly Fact[] => [
  stringFlag("isHoneypot", data.isHoneypot),
  stringFlag("isMintable", data.isMintable),
  stringFlag("isOpenSource", data.isOpenSource),
  stringFlag("isProxy", data.isProxy),
  stringFlag("cannotBuy", data.cannotBuy),
  stringFlag("cannotSellAll", data.cannotSellAll),
  stringFlag("canTakeBackOwnership", data.canTakeBackOwnership),
  stringFlag("hiddenOwner", data.hiddenOwner),
  stringFlag("isBlacklisted", data.isBlacklisted),
  stringFlag("transferPausable", data.transferPausable),
  taxFact("buyTax", data.buyTax),
  taxFact("sellTax", data.sellTax),
];

export const liveBirdeye = (options: BirdeyeOptions): Birdeye => {
  const now = options.now ?? Date.now;
  const request = async <S extends Schema.Codec<unknown>>(
    path: string,
    chain: string,
    query: Readonly<Record<string, string>>,
    schema: S
  ): Promise<S["Type"]> => {
    const url = new URL(path, "https://public-api.birdeye.so");
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
    try {
      const response = await safeFetch(
        url.toString(),
        {
          headers: {
            "X-API-KEY": Redacted.value(options.apiKey),
            "x-chain": chain,
          },
        },
        { ...options.outbound, maxRedirects: 0 }
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Provider HTTP error");
      }
      const bytes = await boundedBytes(response, BODY_LIMIT);
      return Schema.decodeUnknownSync(schema)(
        JSON.parse(new TextDecoder().decode(bytes))
      );
    } catch {
      // Provider errors may echo request headers. Neither bodies nor causes escape.
      throw new Error("Birdeye request failed or returned invalid data.");
    }
  };
  const security = async (
    chain: string,
    address: string
  ): Promise<Security> => {
    try {
      if (chain === "solana") {
        const result = await request(
          "/defi/token_security",
          chain,
          { address },
          SolanaSecurityResponse
        );
        return { status: "reported", facts: solanaFacts(result.data) };
      }
      const result = await request(
        "/defi/token_security",
        chain,
        { address },
        EvmSecurityResponse
      );
      return { status: "reported", facts: evmFacts(result.data) };
    } catch {
      return { status: "unavailable", facts: [] };
    }
  };
  return {
    search: async (input) => {
      const checked = Schema.decodeUnknownSync(MarketSearchInput)(input);
      const chain = chainFor(checked.network);
      let tokens: Token[];
      if (checked.query === null) {
        const result = await request(
          "/defi/v2/tokens/new_listing",
          chain,
          {
            limit: String(checked.limit),
          },
          ListingResponse
        );
        tokens = result.data.items.map((item) =>
          tokenBase(item, checked.network)
        );
      } else {
        const result = await request(
          "/defi/v3/search",
          chain,
          {
            chain,
            keyword: checked.query,
            target: "token",
            search_mode: "fuzzy",
            search_by: "combination",
            sort_by: "volume_24h_usd",
            sort_type: "desc",
            offset: "0",
            limit: String(checked.limit),
            ui_amount_mode: "raw",
          },
          SearchResponse
        );
        tokens = result.data.items.flatMap((group) => {
          if (group.type === "market") {
            return [];
          }
          return group.result.map((item) => {
            if (item.network !== chain) {
              throw new Error(
                "Birdeye returned a token on a different network."
              );
            }
            return {
              ...tokenBase(item, checked.network),
              priceUsd: item.price ?? null,
              volume24hUsd: item.volume_24h_usd ?? null,
              priceChange24hPercent: item.price_change_24h_percent ?? null,
              lastTradeAt: seconds(item.last_trade_unix_time),
            };
          });
        });
      }
      return Schema.decodeUnknownSync(MarketSearchResult)({
        ...snapshot(checked.network, now(), false),
        operation: "market_search",
        mode: checked.query === null ? "new_listings" : "search",
        query: checked.query,
        tokens: tokens.slice(0, checked.limit),
        truncated: tokens.length > checked.limit,
        cursor: null,
        limitations: SEARCH_LIMITATIONS,
      });
    },
    inspect: async (input) => {
      const checked = Schema.decodeUnknownSync(TokenInspectInput)(input);
      const chain = chainFor(checked.network);
      addressFor(checked.address, checked.network);
      const query: BirdeyeQuery = {
        address: checked.address,
        ui_amount_mode: "raw",
      };
      if (["solana", "base", "ethereum", "bsc"].includes(chain)) {
        query["frames"] = "24h";
      }
      const result = await request(
        "/defi/token_overview",
        chain,
        query,
        OverviewResponse
      );
      const item = result.data;
      const matches =
        chain === "solana"
          ? item.address === checked.address
          : item.address.toLowerCase() === checked.address.toLowerCase();
      if (!matches) {
        throw new Error("Birdeye returned a different token address.");
      }
      const token: Token = {
        ...tokenBase(item, checked.network),
        priceUsd: item.price ?? null,
        volume24hUsd: item.v24hUSD ?? null,
        priceChange24hPercent: item.priceChange24hPercent ?? null,
        lastTradeAt: seconds(item.lastTradeUnixTime),
      };
      const facts = await security(chain, checked.address);
      return Schema.decodeUnknownSync(TokenInspectResult)({
        ...snapshot(checked.network, now(), false),
        operation: "token_inspect",
        token,
        security: facts,
        limitations: INSPECT_LIMITATIONS,
      });
    },
  };
};

export const stubBirdeye = (): Birdeye => ({
  search: async (input) => {
    await Promise.resolve();
    const checked = Schema.decodeUnknownSync(MarketSearchInput)(input);
    chainFor(checked.network);
    return Schema.decodeUnknownSync(MarketSearchResult)({
      ...snapshot(checked.network, Date.now(), true),
      operation: "market_search",
      mode: checked.query === null ? "new_listings" : "search",
      query: checked.query,
      tokens: [],
      truncated: false,
      cursor: null,
      limitations: ["Birdeye is stubbed. No market data was requested."],
    });
  },
  inspect: async (input) => {
    await Promise.resolve();
    const checked = Schema.decodeUnknownSync(TokenInspectInput)(input);
    chainFor(checked.network);
    return Schema.decodeUnknownSync(TokenInspectResult)({
      ...snapshot(checked.network, Date.now(), true),
      operation: "token_inspect",
      token: tokenBase(
        { address: checked.address, name: "Stub token" },
        checked.network
      ),
      security: { status: "unavailable", facts: [] },
      limitations: [
        "Birdeye is stubbed. No market or security data was requested.",
      ],
    });
  },
});
