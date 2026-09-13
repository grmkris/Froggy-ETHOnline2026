import { EvmAddress } from "@froggy/domain";
import type { OnchainPriceNetwork, PriceAsset } from "@froggy/domain";
import { Schema } from "effect";
import { getAddress } from "viem";

import { boundedBytes } from "./outbound";

// Uniswap deployments.json; Circle USDC contracts; Robinhood canonical contracts.
export const PRICE_NETWORKS = {
  "eip155:8453": {
    uniswapV2: getAddress("0x8909dc15e40173ff4699343b6eb8132c65e18ec6"),
    uniswapV3: getAddress("0x33128a8fc17869897dce68ed026d694621f6fdfd"),
    poolManager: getAddress("0x498581ff718922c3f8e6a244956af099b2652b2b"),
    stateView: getAddress("0xa3c0c9b65bad0b08107aa264b0f3db444b867a71"),
    aerodrome: getAddress("0x420dd381b31aef6683db6b902084cb0ffece40da"),
    wrappedNative: getAddress("0x4200000000000000000000000000000000000006"),
    stable: getAddress("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"),
    stableSymbol: "USDC",
    catalog:
      "https://reference-data-directory.vercel.app/feeds-ethereum-mainnet-base-1.json",
  },
  "eip155:4663": {
    uniswapV2: getAddress("0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f"),
    uniswapV3: getAddress("0x1f7d7550b1b028f7571e69a784071f0205fd2efa"),
    poolManager: getAddress("0x8366a39cc670b4001a1121b8f6a443a643e40951"),
    stateView: getAddress("0xf3334192d15450cdd385c8b70e03f9a6bd9e673b"),
    aerodrome: null,
    wrappedNative: getAddress("0x0bd7d308f8e1639fab988df18a8011f41eacad73"),
    stable: getAddress("0x5fc5360d0400a0fd4f2af552add042d716f1d168"),
    stableSymbol: "USDG",
    catalog:
      "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json",
  },
} as const;

export interface OracleCatalogEntry {
  readonly network: OnchainPriceNetwork;
  readonly token: PriceAsset;
  readonly proxy: EvmAddress;
  readonly heartbeatSeconds: number;
  readonly expectedDecimals: number;
  readonly sequencer: EvmAddress | null;
  readonly stockToken: EvmAddress | null;
  readonly label: string;
}
export interface PriceOracleCatalog {
  readonly find: (
    network: OnchainPriceNetwork,
    token: PriceAsset
  ) => Promise<readonly OracleCatalogEntry[]>;
}
const address = (value: string): EvmAddress =>
  Schema.decodeUnknownSync(EvmAddress)(value.toLowerCase());
const Feed = Schema.Struct({
  name: Schema.String.check(Schema.isMaxLength(160)),
  path: Schema.String.check(Schema.isMaxLength(160)),
  proxyAddress: Schema.optionalKey(Schema.NullOr(EvmAddress)),
  secondaryProxyAddress: Schema.optionalKey(Schema.NullOr(EvmAddress)),
  heartbeat: Schema.optionalKey(Schema.Int),
  decimals: Schema.optionalKey(Schema.Int),
  docs: Schema.optionalKey(
    Schema.Struct({
      hidden: Schema.optionalKey(Schema.Boolean),
      assetClass: Schema.optionalKey(Schema.String),
      baseAsset: Schema.optionalKey(Schema.String),
      quoteAsset: Schema.optionalKey(Schema.String),
      productTypeCode: Schema.optionalKey(Schema.String),
      attributeType: Schema.optionalKey(Schema.String),
    })
  ),
});
const Feeds = Schema.Array(Feed).check(Schema.isMaxLength(1000));
const Assets = Schema.Struct({
  assets: Schema.Array(
    Schema.Struct({
      tokenSymbol: Schema.String.check(Schema.isMaxLength(32)),
      deployments: Schema.Array(
        Schema.Struct({ contractAddress: EvmAddress, chainId: Schema.Int })
      ).check(Schema.isMaxLength(20)),
    })
  ).check(Schema.isMaxLength(1000)),
});

/** URLs are pinned by Chainlink's official src/features/data/chains.ts. */
export const officialPriceOracleCatalog = (options: {
  readonly now: () => number;
  readonly fetch?: typeof fetch;
}): PriceOracleCatalog => {
  const request = options.fetch ?? fetch;
  const cache = new Map<string, { at: number; value: string }>();
  const text = async (url: string): Promise<string> => {
    const cached = cache.get(url);
    if (cached && options.now() - cached.at < 600_000) {
      return cached.value;
    }
    const response = await request(url, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error("Official price catalog is unavailable.");
    }
    const value = new TextDecoder().decode(
      await boundedBytes(response, 2_000_000)
    );
    cache.set(url, { at: options.now(), value });
    return value;
  };
  const identify = async (
    network: OnchainPriceNetwork,
    token: PriceAsset
  ): Promise<{ symbol: string | null; stockToken: EvmAddress | null }> => {
    const config = PRICE_NETWORKS[network];
    let symbol: string | null = null;
    let stockToken: EvmAddress | null = null;
    if (
      token === "native" ||
      token.toLowerCase() === config.wrappedNative.toLowerCase()
    ) {
      symbol = "ETH";
    } else if (token.toLowerCase() === config.stable.toLowerCase()) {
      symbol = config.stableSymbol;
    } else if (network === "eip155:4663") {
      const assets = Schema.decodeUnknownSync(Assets)(
        JSON.parse(await text("https://api.robinhood.com/rhj/assets"))
      );
      const asset = assets.assets.find((entry) =>
        entry.deployments.some(
          (deployment) =>
            deployment.chainId === 4663 &&
            deployment.contractAddress.toLowerCase() === token.toLowerCase()
        )
      );
      if (asset) {
        symbol = asset.tokenSymbol;
        stockToken = address(token);
      }
    }
    return { symbol, stockToken };
  };
  return {
    find: async (network, token) => {
      const config = PRICE_NETWORKS[network];
      const feeds = Schema.decodeUnknownSync(Feeds)(
        JSON.parse(await text(config.catalog))
      );
      const sequencer =
        feeds.find(
          (feed) => feed.docs?.attributeType === "l2_sequencer_uptime_status"
        )?.proxyAddress ?? null;
      const { symbol, stockToken } = await identify(network, token);
      if (symbol === null) {
        return [];
      }
      const matches = feeds.filter(
        (feed) =>
          feed.docs?.hidden !== true &&
          feed.docs?.quoteAsset === "USD" &&
          feed.docs?.baseAsset === symbol &&
          (stockToken === null
            ? feed.docs.assetClass === "Crypto" &&
              feed.name === `${symbol} / USD`
            : feed.docs.productTypeCode === "primaryTokenizedPrice" &&
              feed.name === `Robinhood ${symbol} / USD`)
      );
      matches.sort(
        (left, right) =>
          Number(right.path === `${symbol.toLowerCase()}-usd`) -
          Number(left.path === `${symbol.toLowerCase()}-usd`)
      );
      const result: OracleCatalogEntry[] = [];
      for (const feed of matches) {
        if (
          feed.heartbeat === undefined ||
          feed.heartbeat <= 0 ||
          feed.heartbeat > 172_800 ||
          feed.decimals === undefined ||
          feed.decimals < 0 ||
          feed.decimals > 36
        ) {
          continue;
        }
        for (const proxy of [feed.secondaryProxyAddress, feed.proxyAddress]) {
          if (
            !proxy ||
            result.some(
              (entry) => entry.proxy.toLowerCase() === proxy.toLowerCase()
            )
          ) {
            continue;
          }
          result.push({
            network,
            token,
            proxy: address(proxy),
            heartbeatSeconds: feed.heartbeat,
            expectedDecimals: feed.decimals,
            sequencer: sequencer === null ? null : address(sequencer),
            stockToken,
            label: `${symbol}/USD oracle`,
          });
          if (result.length === 3) {
            return result;
          }
        }
      }
      return result;
    },
  };
};
