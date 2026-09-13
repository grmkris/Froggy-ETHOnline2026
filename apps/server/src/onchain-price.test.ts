import { describe, expect, test } from "bun:test";

import {
  EvmAddress,
  ResolvedPriceSource,
  matchesPriceThreshold,
} from "@froggy/domain";
import type { OnchainPriceNetwork } from "@froggy/domain";
import { Schema } from "effect";
import {
  decodeFunctionData,
  encodeAbiParameters,
  isHex,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
} from "viem";
import type { Hex } from "viem";

import { createPriceResolver, stubPriceResolver } from "./onchain-price";
import type { PriceBlock } from "./onchain-price";
import { PRICE_NETWORKS } from "./onchain-price-registry";
import type { PriceOracleCatalog } from "./onchain-price-registry";
import { ponsPoolId } from "./trading/pons";
import type { TradingRpc } from "./trading/rpc";

// Synthetic contracts are fixture data, never live deployment candidates.
const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const ORACLE = "0x3333333333333333333333333333333333333333";
const AGGREGATOR = "0x4444444444444444444444444444444444444444";
const SEQUENCER = "0x5555555555555555555555555555555555555555";
const HASH = `0x${"ab".repeat(32)}`;
const BLOCK: PriceBlock = {
  number: 42,
  hash: HASH,
  timestamp: Date.parse("2026-09-14T15:00:00Z"),
};
const address = Schema.decodeUnknownSync(EvmAddress);
const ABI = parseAbi([
  "function aggregator() view returns(address)",
  "function decimals() view returns(uint8)",
  "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)",
  "function oraclePaused() view returns(bool)",
  "function token0() view returns(address)",
  "function token1() view returns(address)",
  "function factory() view returns(address)",
  "function fee() view returns(uint24)",
  "function tickSpacing() view returns(int24)",
  "function stable() view returns(bool)",
  "function getPair(address,address) view returns(address)",
  "function getPool(address,address,uint24) view returns(address)",
  "function getPool(address,address,bool) view returns(address)",
  "function getReserves() view returns(uint112,uint112,uint32)",
  "function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns(uint128)",
  "function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)",
  "function getLiquidity(bytes32) view returns(uint128)",
]);
const uint = (value: bigint): Hex =>
  encodeAbiParameters(parseAbiParameters("uint256"), [value]);
const addr = (value: string): Hex => {
  if (!isHex(value)) {
    throw new Error("Invalid fixture address");
  }
  return encodeAbiParameters(parseAbiParameters("address"), [value]);
};
const same = (left: string, right: string): boolean =>
  left.toLowerCase() === right.toLowerCase();
const fixture = (
  options: {
    network?: OnchainPriceNetwork;
    protocol?: "uniswap_v2" | "uniswap_v3" | "uniswap_v4" | "aerodrome";
    oracle?: boolean;
    stock?: boolean;
    block?: PriceBlock;
  } = {}
) => {
  const network = options.network ?? "eip155:8453";
  const block = options.block ?? BLOCK;
  const config = PRICE_NETWORKS[network];
  const protocol = options.protocol ?? "uniswap_v2";
  const state = {
    price: 123_456_789n,
    updatedAt: BigInt(block.timestamp / 1000) - 10n,
    paused: false,
    sequencerStatus: 0n,
    sequencerStartedAt: BigInt(block.timestamp / 1000) - 7200n,
    aggregator: AGGREGATOR,
    hash: HASH,
    stubbed: false,
    depth: 20_000n * 10n ** 6n,
    factory: config.uniswapV2,
    stable: false,
    sqrt: 2n ** 96n / 1_000_000n,
    liquidity: 2n * 10n ** 16n,
  };
  const calls: { method: string; block: string | undefined; fn: string }[] = [];
  const rpc: TradingRpc = {
    read: async (input) => {
      let result: Hex = "0x";
      let fn: string = input.call.method;
      let tag: string | undefined;
      if (input.call.method === "eth_call") {
        const [call, at] = input.call.params;
        tag = at;
        if (!isHex(call.data)) {
          throw new Error("Invalid fixture call");
        }
        const decoded = decodeFunctionData({ abi: ABI, data: call.data });
        fn = decoded.functionName;
        const { to } = call;
        const responses: Record<typeof decoded.functionName, () => Hex> = {
          decimals: () => {
            if (same(to, config.stable)) {
              return uint(6n);
            }
            if (same(to, ORACLE)) {
              return uint(8n);
            }
            return uint(18n);
          },
          aggregator: () => addr(state.aggregator),
          latestRoundData: () =>
            encodeAbiParameters(
              parseAbiParameters("uint80,int256,uint256,uint256,uint80"),
              same(to, SEQUENCER)
                ? [
                    1n,
                    state.sequencerStatus,
                    state.sequencerStartedAt,
                    state.updatedAt,
                    1n,
                  ]
                : [1n, state.price, state.updatedAt, state.updatedAt, 1n]
            ),
          oraclePaused: () => uint(state.paused ? 1n : 0n),
          token0: () => addr(TOKEN),
          token1: () => addr(config.stable),
          factory: () => {
            if (protocol === "uniswap_v3") {
              return addr(config.uniswapV3);
            }
            if (protocol === "aerodrome") {
              return addr(config.aerodrome ?? zeroAddress);
            }
            return addr(state.factory);
          },
          fee: () => uint(3000n),
          tickSpacing: () => uint(60n),
          stable: () => uint(state.stable ? 1n : 0n),
          getPair: () =>
            addr(
              protocol === "uniswap_v2" &&
                decoded.functionName === "getPair" &&
                decoded.args.some((token) => same(token, config.stable))
                ? POOL
                : zeroAddress
            ),
          getPool: () => {
            if (decoded.functionName !== "getPool") {
              throw new Error("Unexpected fixture function");
            }
            const [token0, token1, fee] = decoded.args;
            const eligible =
              (protocol === "uniswap_v3" && fee === 3000) ||
              (protocol === "aerodrome" && fee === false);
            return addr(
              eligible &&
                (same(token0, config.stable) || same(token1, config.stable))
                ? POOL
                : zeroAddress
            );
          },
          getReserves: () =>
            encodeAbiParameters(parseAbiParameters("uint112,uint112,uint32"), [
              10_000n * 10n ** 18n,
              state.depth,
              0,
            ]),
          slot0: () =>
            encodeAbiParameters(
              parseAbiParameters(
                "uint160,int24,uint16,uint16,uint16,uint8,bool"
              ),
              [state.sqrt, 0, 0, 0, 0, 0, true]
            ),
          liquidity: () => uint(state.liquidity),
          getSlot0: () =>
            encodeAbiParameters(
              parseAbiParameters("uint160,int24,uint24,uint24"),
              [protocol === "uniswap_v4" ? state.sqrt : 0n, 0, 0, 0]
            ),
          getLiquidity: () =>
            uint(protocol === "uniswap_v4" ? state.liquidity : 0n),
        };
        result = responses[decoded.functionName]();
      } else if (input.call.method === "eth_getCode") {
        result = "0x6000";
        [, tag] = input.call.params;
      } else {
        throw new Error("Unexpected fixture RPC method");
      }
      calls.push({ method: input.call.method, block: tag, fn });
      return await Promise.resolve({
        v: 1,
        operation: "rpc_read",
        provider: "quicknode",
        stubbed: state.stubbed,
        observedAt: block.timestamp,
        network,
        method: input.call.method,
        result,
        context: {
          blockNumber: "0x2a",
          blockHash: null,
          slot: null,
          commitment: null,
        },
        limitations: [],
      });
    },
  };
  const catalog: PriceOracleCatalog = {
    find: async (_network, token) =>
      await Promise.resolve(
        options.oracle === true
          ? [
              {
                network,
                token,
                proxy: address(ORACLE),
                heartbeatSeconds: 1200,
                expectedDecimals: 8,
                sequencer:
                  network === "eip155:8453" ? address(SEQUENCER) : null,
                stockToken: options.stock === true ? address(TOKEN) : null,
                label: "Fixture USD oracle",
              },
            ]
          : []
      ),
  };
  let now = block.timestamp + 1000;
  const resolver = createPriceResolver({
    rpc,
    now: () => now,
    getBlockHash: async () => await Promise.resolve(state.hash),
    oracleCatalog: catalog,
  });
  return {
    resolver,
    state,
    calls,
    block,
    network,
    setNow: (value: number) => {
      now = value;
    },
  };
};

describe("sealed-block oracle observations", () => {
  test("uses per-token oracle values, pins all dependencies, and never reads latest", async () => {
    const f = fixture({ network: "eip155:4663", oracle: true, stock: true });
    const source = await f.resolver.resolve({
      network: f.network,
      token: address(TOKEN),
      block: f.block,
    });
    const result = await f.resolver.read(source, f.block);
    expect(result.price).toBe("1.23456789");
    expect(source.basis).toBe("per_token");
    expect(source.limitations.join(" ")).toContain("sequencer");
    expect(
      f.resolver.streamSubscriptions(source).map((entry) => entry.contract)
    ).toEqual([ORACLE, AGGREGATOR, TOKEN]);
    expect(f.calls.every((call) => call.block === "0x2a")).toBe(true);
    f.state.paused = true;
    const observed1 = await f.resolver.read(source, f.block);
    expect(observed1.reason).toContain("paused");
    f.state.paused = false;
    f.state.aggregator = POOL;
    const observed2 = await f.resolver.read(source, f.block);
    expect(observed2.reason).toContain("identity changed");
  });
  test("refuses stale or future oracle rounds and sequencer outages or grace periods", async () => {
    const f = fixture({ oracle: true });
    const source = await f.resolver.resolve({
      network: f.network,
      token: "native",
      block: f.block,
    });
    f.state.updatedAt -= 1300n;
    const observed3 = await f.resolver.read(source, f.block);
    expect(observed3.status).toBe("unavailable");
    f.state.updatedAt = BigInt(f.block.timestamp / 1000) + 1n;
    const observed4 = await f.resolver.read(source, f.block);
    expect(observed4.status).toBe("unavailable");
    f.state.updatedAt = BigInt(f.block.timestamp / 1000) - 1n;
    f.state.sequencerStatus = 1n;
    const observed5 = await f.resolver.read(source, f.block);
    expect(observed5.reason).toContain("sequencer");
    f.state.sequencerStatus = 0n;
    f.state.sequencerStartedAt = BigInt(f.block.timestamp / 1000) - 30n;
    const observed6 = await f.resolver.read(source, f.block);
    expect(observed6.status).toBe("unavailable");
  });
  test("missing sequencer coverage requires a fresh block and RPC hash agreement", async () => {
    const f = fixture({ network: "eip155:4663", oracle: true });
    const source = await f.resolver.resolve({
      network: f.network,
      token: "native",
      block: f.block,
    });
    f.setNow(f.block.timestamp + 121_000);
    const observed7 = await f.resolver.read(source, f.block);
    expect(observed7.reason).toContain("fresh sealed block");
    f.setNow(f.block.timestamp + 1000);
    f.state.hash = `0x${"cd".repeat(32)}`;
    const observed8 = await f.resolver.read(source, f.block);
    expect(observed8.reason).toContain("does not match");
  });
  test("stock quotes are unavailable during the regular weekly market closure", async () => {
    const f = fixture({
      network: "eip155:4663",
      oracle: true,
      stock: true,
      block: { ...BLOCK, timestamp: Date.parse("2026-09-13T12:00:00Z") },
    });
    const source = await f.resolver.resolve({
      network: f.network,
      token: address(TOKEN),
      quoteCurrency: "USD",
      block: f.block,
    });
    const result = await f.resolver.read(source, f.block);
    expect(result.status).toBe("unavailable");
    expect(result.reason).toContain("market is closed");
  });
});

describe("verified DEX price observations", () => {
  test("v2 prices account for differing decimals and reject shallow reserves or a changed factory", async () => {
    const f = fixture();
    const source = await f.resolver.resolve({
      network: f.network,
      token: address(TOKEN),
      quoteCurrency: "USDC",
      block: f.block,
    });
    expect(source.kind).toBe("pool");
    const observed9 = await f.resolver.read(source, f.block);
    expect(observed9.price).toBe("2");
    f.state.depth = 9999n * 10n ** 6n;
    const observed10 = await f.resolver.read(source, f.block);
    expect(observed10.reason).toContain("active quote depth");
    f.state.depth = 20_000n * 10n ** 6n;
    f.state.factory = zeroAddress;
    const observed11 = await f.resolver.read(source, f.block);
    expect(observed11.reason).toContain("identity changed");
  });
  test("v3 uses exact square-root price math and active quote depth", async () => {
    const f = fixture({ protocol: "uniswap_v3" });
    const source = await f.resolver.resolve({
      network: f.network,
      token: address(TOKEN),
      quoteCurrency: "USDC",
      block: f.block,
    });
    const result = await f.resolver.read(source, f.block);
    expect(result.status).toBe("available");
    expect(matchesPriceThreshold(result, "below", "1")).toBe(true);
    expect(matchesPriceThreshold(result, "above", "0.999999999999999999")).toBe(
      true
    );
    f.state.liquidity = 1n;
    const observed12 = await f.resolver.read(source, f.block);
    expect(observed12.status).toBe("unavailable");
  });
  test("v4 validates its full pool key and rejects arbitrary hooks", async () => {
    const f = fixture({ protocol: "uniswap_v4" });
    const source = await f.resolver.resolve({
      network: f.network,
      token: address(TOKEN),
      quoteCurrency: "USDC",
      block: f.block,
    });
    expect(source.kind).toBe("pool");
    if (source.kind !== "pool") {
      throw new Error("Expected pool fixture");
    }
    expect(source.pool.protocol).toBe("uniswap_v4");
    const key = {
      currency0: TOKEN,
      currency1: PRICE_NETWORKS[f.network].stable,
      fee: source.pool.fee,
      tickSpacing: source.pool.tickSpacing,
      hooks: ORACLE,
    } as const;
    const changed = Schema.decodeUnknownSync(ResolvedPriceSource)({
      ...source,
      pool: { ...source.pool, hook: ORACLE, poolId: ponsPoolId(key) },
    });
    const observed13 = await f.resolver.read(changed, f.block);
    expect(observed13.reason).toContain("no reviewed price adapter");
  });
  test("Aerodrome supports volatile pools and refuses stable-curve pricing", async () => {
    const f = fixture({ protocol: "aerodrome" });
    const source = await f.resolver.resolve({
      network: f.network,
      token: address(TOKEN),
      quoteCurrency: "USDC",
      block: f.block,
    });
    const observed14 = await f.resolver.read(source, f.block);
    expect(observed14.price).toBe("2");
    f.state.stable = true;
    const observed15 = await f.resolver.read(source, f.block);
    expect(observed15.reason).toContain("stable pools");
  });
  test("all watches share a 200-call sealed-block budget and recover on another block", async () => {
    const f = fixture({ oracle: true });
    const source = await f.resolver.resolve({
      network: f.network,
      token: "native",
      block: f.block,
    });
    const results = await Promise.all(
      Array.from(
        { length: 45 },
        async () => await f.resolver.read(source, f.block)
      )
    );
    expect(
      results.some(
        (result) => result.reason?.includes("shared price read budget") === true
      )
    ).toBe(true);
    const observed16 = await f.resolver.read(source, {
      ...f.block,
      number: 43,
    });
    expect(observed16.status).toBe("available");
  });
});

test("demo price sources remain explicitly stubbed on both networks", async () => {
  const resolver = stubPriceResolver({
    now: () => BLOCK.timestamp,
    price: "0.125",
  });
  const sources = await Promise.all(
    (["eip155:8453", "eip155:4663"] as const).map(
      async (network) =>
        await resolver.resolve({ network, token: "native", block: BLOCK })
    )
  );
  const observations = await Promise.all(
    sources.map(async (source) => await resolver.read(source, BLOCK))
  );
  expect(sources.every((source) => source.label.startsWith("Demo"))).toBe(true);
  expect(
    observations.every((sample) => sample.stubbed && sample.price === "0.125")
  ).toBe(true);
  const [first] = observations;
  if (!first) {
    throw new Error("Missing demo observation");
  }
  expect(matchesPriceThreshold(first, "below", "0.2")).toBe(true);
});
test("a stubbed live RPC response is visible and cannot masquerade as a verified price", async () => {
  const f = fixture({ oracle: true });
  const source = await f.resolver.resolve({
    network: f.network,
    token: "native",
    block: f.block,
  });
  f.state.stubbed = true;
  const result = await f.resolver.read(source, f.block);
  expect(result.status).toBe("unavailable");
  expect(result.stubbed).toBe(true);
});
