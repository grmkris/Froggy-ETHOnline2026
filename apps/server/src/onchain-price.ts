import {
  EvmAddress,
  PriceObservation,
  ResolvedPriceSource,
  priceRatioDecimal,
  priceDecimalRatio,
} from "@froggy/domain";
import type {
  OnchainPriceNetwork,
  PriceAsset,
  PriceOracleFeed,
  PriceQuoteCurrency,
  PriceRatio,
} from "@froggy/domain";
import { Schema } from "effect";
import {
  createPublicClient,
  custom,
  getAddress,
  isHex,
  keccak256,
  parseAbi,
  zeroAddress,
} from "viem";
import type { Address, Hex } from "viem";

import {
  officialPriceOracleCatalog,
  PRICE_NETWORKS,
} from "./onchain-price-registry";
import type {
  OracleCatalogEntry,
  PriceOracleCatalog,
} from "./onchain-price-registry";
import { PONS_ABI, PONS_DEPLOYMENTS, ponsPoolId } from "./trading/pons";
import type { PonsPool } from "./trading/pons";
import { preflightRpcRead } from "./trading/rpc";
import type { TradingRpc } from "./trading/rpc";

export interface PriceBlock {
  readonly number: number;
  readonly hash: string;
  /** Milliseconds, from the sealed stream block header. */
  readonly timestamp: number;
}
interface PricePoolCandidate {
  readonly protocol: "uniswap_v2" | "uniswap_v3" | "uniswap_v4" | "aerodrome";
  readonly contract: string;
  readonly poolKey?: PonsPool;
}
interface ResolvePriceInput {
  readonly network: OnchainPriceNetwork;
  readonly token: PriceAsset;
  readonly quoteCurrency?: PriceQuoteCurrency;
  readonly block: PriceBlock;
  readonly candidates?: readonly PricePoolCandidate[];
}
export interface PriceResolver {
  readonly resolve: (input: ResolvePriceInput) => Promise<ResolvedPriceSource>;
  readonly read: (
    source: ResolvedPriceSource,
    block: PriceBlock
  ) => Promise<PriceObservation>;
  readonly streamSubscriptions: (source: ResolvedPriceSource) => readonly {
    readonly key: string;
    readonly contract: string;
    readonly poolId: string | null;
  }[];
}
export interface PriceResolverDependencies {
  readonly rpc: TradingRpc;
  readonly now: () => number;
  readonly getBlockHash: (
    network: OnchainPriceNetwork,
    number: number
  ) => Promise<string>;
  readonly oracleCatalog?: PriceOracleCatalog;
  /** An indexer supplies candidates only; every returned pool is verified at the sealed block. */
  readonly discoverPools?: (
    input: ResolvePriceInput
  ) => Promise<readonly PricePoolCandidate[]>;
}

class PriceSourceUnavailableError extends Error {
  readonly stubbed: boolean;
  constructor(reason: string, stubbed = false) {
    super(reason);
    this.name = "PriceSourceUnavailableError";
    this.stubbed = stubbed;
  }
}
const providerFailure = (error: Error): PriceSourceUnavailableError => {
  if (error instanceof PriceSourceUnavailableError) {
    return error;
  }
  if (error.cause instanceof Error) {
    return providerFailure(error.cause);
  }
  return new PriceSourceUnavailableError(
    "The price provider could not verify a bounded response at the sealed block."
  );
};
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
const address = (value: string): EvmAddress =>
  Schema.decodeUnknownSync(EvmAddress)(value.toLowerCase());
const same = (left: string, right: string): boolean =>
  left.toLowerCase() === right.toLowerCase();
const fail: (reason: string) => never = (reason) => {
  throw new PriceSourceUnavailableError(reason);
};
const hash = (value: string): Hex => {
  if (!isHex(value) || value.length !== 66) {
    fail("The pool identifier is invalid.");
  }
  return value;
};
const Q96 = 2n ** 96n;
const boundedDecimals = (value: number): number =>
  value >= 0 && value <= 36
    ? value
    : fail("Token decimals are outside the supported range.");
const ten = (value: number): bigint => 10n ** BigInt(boundedDecimals(value));
const missingSequencer =
  "No official sequencer uptime feed is published for this network; alerts require a fresh, hash-matched sealed block.";
type PoolSource = Extract<ResolvedPriceSource, { kind: "pool" }>;

const RpcRequest = Schema.Struct({
  method: Schema.String,
  params: Schema.Array(Schema.Json),
});
const clientFor = (
  deps: PriceResolverDependencies,
  network: OnchainPriceNetwork,
  limit: number,
  spendShared?: () => void
) => {
  let calls = 0;
  const deadline = deps.now() + 45_000;
  return createPublicClient({
    transport: custom(
      {
        request: async (request) => {
          const { method, params } =
            Schema.decodeUnknownSync(RpcRequest)(request);
          calls += 1;
          spendShared?.();
          if (calls > limit || deps.now() > deadline) {
            fail("The bounded price read budget was exhausted.");
          }
          const result = await deps.rpc.read(
            preflightRpcRead({ network, call: { method, params } })
          );
          if (result.stubbed) {
            throw new PriceSourceUnavailableError(
              "The price provider is in stub mode.",
              true
            );
          }
          if (result.network !== network || result.method !== method) {
            fail("The price provider returned a mismatched response.");
          }
          return result.result;
        },
      },
      { retryCount: 0 }
    ),
  });
};
type PriceClient = ReturnType<typeof clientFor>;

const verifiedHeader = async (
  deps: PriceResolverDependencies,
  network: OnchainPriceNetwork,
  block: PriceBlock
): Promise<void> => {
  if (
    !Number.isSafeInteger(block.number) ||
    block.number < 0 ||
    !Number.isSafeInteger(block.timestamp) ||
    block.timestamp <= 0 ||
    !/^0x[0-9a-fA-F]{64}$/u.test(block.hash)
  ) {
    fail("The sealed price block header is invalid.");
  }
  if (!same(await deps.getBlockHash(network, block.number), block.hash)) {
    fail("The RPC block does not match the sealed stream block.");
  }
};
const verifyFreshBlock = (
  deps: PriceResolverDependencies,
  block: PriceBlock
): void => {
  const age = deps.now() - block.timestamp;
  if (age < -10_000 || age > 120_000) {
    fail(
      "A fresh sealed block is required while sequencer coverage is unavailable."
    );
  }
};
const stockMarketClosed = (timestamp: number): boolean => {
  // Chainlink's Robinhood equity feeds cover US equities 24/5. The regular weekly
  // close is still not a live quote; holiday closures are additionally bounded by heartbeat.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const day = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return (
    day === "Sat" ||
    (day === "Fri" && hour >= 20) ||
    (day === "Sun" && hour < 20)
  );
};
const readOracle = async (
  client: PriceClient,
  deps: PriceResolverDependencies,
  feed: PriceOracleFeed,
  block: PriceBlock
): Promise<PriceRatio> => {
  const at = { abi: ABI, blockNumber: BigInt(block.number) } as const;
  const [aggregator, decimals, round] = await Promise.all([
    client.readContract({
      ...at,
      address: getAddress(feed.proxy),
      functionName: "aggregator",
    }),
    client.readContract({
      ...at,
      address: getAddress(feed.proxy),
      functionName: "decimals",
    }),
    client.readContract({
      ...at,
      address: getAddress(feed.proxy),
      functionName: "latestRoundData",
    }),
  ]);
  if (!same(aggregator, feed.aggregator) || decimals !== feed.decimals) {
    fail("The pinned oracle identity changed; resolve this alert again.");
  }
  const [roundId, answer, , updatedAt, answeredInRound] = round;
  const seconds = BigInt(Math.floor(block.timestamp / 1000));
  if (
    answer <= 0n ||
    updatedAt <= 0n ||
    updatedAt > seconds ||
    seconds - updatedAt > BigInt(feed.heartbeatSeconds) ||
    answeredInRound < roundId
  ) {
    fail("The USD oracle is stale or returned an invalid round.");
  }
  if (feed.stockToken !== null) {
    if (stockMarketClosed(block.timestamp)) {
      fail(
        "The stock market is closed; the last equity quote is not a live price."
      );
    }
    if (
      await client.readContract({
        ...at,
        address: getAddress(feed.stockToken),
        functionName: "oraclePaused",
      })
    ) {
      fail("The issuer has paused this stock token oracle.");
    }
  }
  if (feed.sequencer === null) {
    verifyFreshBlock(deps, block);
  } else {
    const [, status, startedAt] = await client.readContract({
      ...at,
      address: getAddress(feed.sequencer),
      functionName: "latestRoundData",
    });
    if (
      status !== 0n ||
      startedAt <= 0n ||
      startedAt > seconds ||
      seconds - startedAt <= 3600n
    ) {
      fail(
        "The sequencer is unavailable or still in its recovery grace period."
      );
    }
  }
  // The issuer-selected feed is already adjusted by the stock-token multiplier.
  return { numerator: answer, denominator: ten(feed.decimals) };
};
const resolveOracle = async (
  client: PriceClient,
  entry: OracleCatalogEntry,
  block: PriceBlock
): Promise<PriceOracleFeed> => {
  const [aggregator, decimals] = await Promise.all([
    client.readContract({
      address: getAddress(entry.proxy),
      abi: ABI,
      functionName: "aggregator",
      blockNumber: BigInt(block.number),
    }),
    client.readContract({
      address: getAddress(entry.proxy),
      abi: ABI,
      functionName: "decimals",
      blockNumber: BigInt(block.number),
    }),
  ]);
  if (same(aggregator, zeroAddress) || decimals !== entry.expectedDecimals) {
    fail("The official oracle identity or decimals could not be verified.");
  }
  // A verified source may wait for reopening, unpausing, or a fresh round. Those
  // conditions are checked on every observation before a threshold can match.
  return {
    proxy: entry.proxy,
    aggregator: address(aggregator),
    decimals: boundedDecimals(decimals),
    heartbeatSeconds: entry.heartbeatSeconds,
    sequencer: entry.sequencer,
    stockToken: entry.stockToken,
  };
};

const poolKeyFor = (source: PoolSource): PonsPool => ({
  currency0: getAddress(source.pool.token0),
  currency1: getAddress(source.pool.token1),
  fee: source.pool.fee,
  tickSpacing: source.pool.tickSpacing,
  hooks: getAddress(source.pool.hook),
});
const verifyPons = async (
  client: PriceClient,
  network: OnchainPriceNetwork,
  token: Address,
  key: PonsPool,
  block: PriceBlock
): Promise<void> => {
  if (
    network !== "eip155:4663" ||
    !same(key.hooks, PONS_DEPLOYMENTS.hook.address)
  ) {
    fail("This pool hook has no reviewed price adapter.");
  }
  const at = { blockNumber: BigInt(block.number) } as const;
  const [factoryCode, hookCode, launched] = await Promise.all([
    client.getCode({ ...at, address: PONS_DEPLOYMENTS.factory.address }),
    client.getCode({ ...at, address: PONS_DEPLOYMENTS.hook.address }),
    client.readContract({
      ...at,
      address: PONS_DEPLOYMENTS.factory.address,
      abi: PONS_ABI,
      functionName: "getLaunchedToken",
      args: [token],
    }),
  ]);
  if (
    factoryCode === undefined ||
    hookCode === undefined ||
    keccak256(factoryCode) !== PONS_DEPLOYMENTS.factory.hash ||
    keccak256(hookCode) !== PONS_DEPLOYMENTS.hook.hash
  ) {
    fail("The pinned Pons deployment code changed.");
  }
  const pair = same(key.currency0, token) ? key.currency1 : key.currency0;
  if (
    !launched.exists ||
    launched.phase !== 2 ||
    !same(launched.token, token) ||
    !same(launched.pairToken, pair) ||
    key.fee !== launched.poolFee ||
    key.tickSpacing !== launched.tickSpacing
  ) {
    fail("This Pons token does not have a verified graduated pool.");
  }
};
const quoteFor = (
  network: OnchainPriceNetwork,
  token: string
): "USDC" | "USDG" | "ETH" | null => {
  const config = PRICE_NETWORKS[network];
  if (same(token, config.stable)) {
    return config.stableSymbol;
  }
  if (same(token, config.wrappedNative) || same(token, zeroAddress)) {
    return "ETH";
  }
  return null;
};
const factoryFor = (
  network: OnchainPriceNetwork,
  protocol: PricePoolCandidate["protocol"]
): Address | null => {
  const config = PRICE_NETWORKS[network];
  if (protocol === "uniswap_v2") {
    return config.uniswapV2;
  }
  if (protocol === "uniswap_v3") {
    return config.uniswapV3;
  }
  return config.aerodrome;
};
const tokenForPool = (
  network: OnchainPriceNetwork,
  token: PriceAsset,
  key?: PonsPool
): Address => {
  if (token !== "native") {
    return getAddress(token);
  }
  if (
    key &&
    (same(key.currency0, zeroAddress) || same(key.currency1, zeroAddress))
  ) {
    return zeroAddress;
  }
  return PRICE_NETWORKS[network].wrappedNative;
};
const verifyV4 = async (
  client: PriceClient,
  source: PoolSource,
  block: PriceBlock
): Promise<void> => {
  const { pool, network } = source;
  const config = PRICE_NETWORKS[network];
  if (
    !same(pool.contract, config.poolManager) ||
    pool.stateView === null ||
    !same(pool.stateView, config.stateView) ||
    pool.poolId === null ||
    !same(pool.poolId, ponsPoolId(poolKeyFor(source)))
  ) {
    fail("The v4 pool key or official deployment does not match.");
  }
  if (!same(pool.hook, zeroAddress)) {
    await verifyPons(
      client,
      network,
      tokenForPool(network, source.token, poolKeyFor(source)),
      poolKeyFor(source),
      block
    );
  }
};
const verifyPool = async (
  client: PriceClient,
  source: PoolSource,
  block: PriceBlock
): Promise<void> => {
  const { pool, network } = source;
  const at = { abi: ABI, blockNumber: BigInt(block.number) } as const;
  if (pool.protocol === "uniswap_v4") {
    await verifyV4(client, source, block);
    return;
  }
  const expectedFactory = factoryFor(network, pool.protocol);
  if (
    expectedFactory === null ||
    pool.factory === null ||
    !same(pool.factory, expectedFactory)
  ) {
    fail("The pool is not from an approved factory on this network.");
  }
  const [factory, token0, token1] = await Promise.all([
    client.readContract({
      ...at,
      address: getAddress(pool.contract),
      functionName: "factory",
    }),
    client.readContract({
      ...at,
      address: getAddress(pool.contract),
      functionName: "token0",
    }),
    client.readContract({
      ...at,
      address: getAddress(pool.contract),
      functionName: "token1",
    }),
  ]);
  if (
    !same(factory, expectedFactory) ||
    !same(token0, pool.token0) ||
    !same(token1, pool.token1)
  ) {
    fail("The pinned pool identity changed.");
  }
  let registered: Address;
  if (pool.protocol === "uniswap_v3") {
    const [fee, spacing] = await Promise.all([
      client.readContract({
        ...at,
        address: getAddress(pool.contract),
        functionName: "fee",
      }),
      client.readContract({
        ...at,
        address: getAddress(pool.contract),
        functionName: "tickSpacing",
      }),
    ]);
    if (fee !== pool.fee || spacing !== pool.tickSpacing) {
      fail("The pinned pool parameters changed.");
    }
    registered = await client.readContract({
      ...at,
      address: factory,
      functionName: "getPool",
      args: [token0, token1, fee],
    });
  } else if (pool.protocol === "aerodrome") {
    if (
      await client.readContract({
        ...at,
        address: getAddress(pool.contract),
        functionName: "stable",
      })
    ) {
      fail("Aerodrome stable pools require a separate price adapter.");
    }
    registered = await client.readContract({
      ...at,
      address: factory,
      functionName: "getPool",
      args: [token0, token1, false],
    });
  } else {
    registered = await client.readContract({
      ...at,
      address: factory,
      functionName: "getPair",
      args: [token0, token1],
    });
  }
  if (!same(registered, pool.contract)) {
    fail("The approved factory did not register this pool.");
  }
};
const validatePoolSource = (source: PoolSource): void => {
  const { pool } = source;
  const target = tokenForPool(source.network, source.token, poolKeyFor(source));
  const opposite = same(pool.token0, target) ? pool.token1 : pool.token0;
  if (
    (!same(pool.token0, target) && !same(pool.token1, target)) ||
    !same(pool.quoteToken, opposite) ||
    quoteFor(source.network, pool.quoteToken) !== pool.quoteSymbol ||
    (source.conversion === null && source.quoteCurrency !== pool.quoteSymbol) ||
    (source.conversion !== null && source.quoteCurrency !== "USD")
  ) {
    fail("The pinned pool's token or quote currency is inconsistent.");
  }
};
const readPool = async (
  client: PriceClient,
  source: PoolSource,
  block: PriceBlock
): Promise<{ ratio: PriceRatio; depth: PriceRatio }> => {
  validatePoolSource(source);
  const { pool } = source;
  await verifyPool(client, source, block);
  const at = { abi: ABI, blockNumber: BigInt(block.number) } as const;
  const targetIs0 = !same(pool.quoteToken, pool.token0);
  let numerator: bigint;
  let denominator: bigint;
  let quoteDepth: bigint;
  if (pool.protocol === "uniswap_v2" || pool.protocol === "aerodrome") {
    const [reserve0, reserve1] = await client.readContract({
      ...at,
      address: getAddress(pool.contract),
      functionName: "getReserves",
    });
    numerator = targetIs0 ? reserve1 : reserve0;
    denominator = targetIs0 ? reserve0 : reserve1;
    quoteDepth = numerator;
  } else {
    let state: readonly [bigint, ...(bigint | number | boolean)[]];
    let liquidity: bigint;
    if (pool.protocol === "uniswap_v4") {
      if (pool.stateView === null || pool.poolId === null) {
        fail("The v4 source has no state view or pool key.");
      }
      [state, liquidity] = await Promise.all([
        client.readContract({
          ...at,
          address: getAddress(pool.stateView),
          functionName: "getSlot0",
          args: [hash(pool.poolId)],
        }),
        client.readContract({
          ...at,
          address: getAddress(pool.stateView),
          functionName: "getLiquidity",
          args: [hash(pool.poolId)],
        }),
      ]);
    } else {
      [state, liquidity] = await Promise.all([
        client.readContract({
          ...at,
          address: getAddress(pool.contract),
          functionName: "slot0",
        }),
        client.readContract({
          ...at,
          address: getAddress(pool.contract),
          functionName: "liquidity",
        }),
      ]);
    }
    const [sqrt] = state;
    if (sqrt <= 0n || liquidity <= 0n) {
      fail("The pool has no active liquidity.");
    }
    numerator = targetIs0 ? sqrt * sqrt : Q96 * Q96;
    denominator = targetIs0 ? Q96 * Q96 : sqrt * sqrt;
    // Concentrated-pool active equivalent quote depth, not total pool TVL.
    quoteDepth = targetIs0
      ? (liquidity * sqrt) / Q96
      : (liquidity * Q96) / sqrt;
  }
  const floor =
    BigInt(pool.quoteSymbol === "ETH" ? 5 : 10_000) * ten(pool.quoteDecimals);
  if (numerator <= 0n || denominator <= 0n || quoteDepth < floor) {
    fail(
      "The pool is below the required 10,000 stable units or 5 ETH of active quote depth."
    );
  }
  return {
    ratio: {
      numerator: numerator * ten(pool.tokenDecimals),
      denominator: denominator * ten(pool.quoteDecimals),
    },
    depth: { numerator: quoteDepth, denominator: floor },
  };
};

const sourceFromCandidate = async (
  client: PriceClient,
  input: ResolvePriceInput,
  candidate: PricePoolCandidate
): Promise<PoolSource> => {
  const config = PRICE_NETWORKS[input.network];
  const contract = address(candidate.contract);
  const at = { abi: ABI, blockNumber: BigInt(input.block.number) } as const;
  let token0: Address;
  let token1: Address;
  let fee = 0;
  let tickSpacing = 0;
  let hook: Address = zeroAddress;
  let factory: EvmAddress | null = null;
  let poolId: string | null = null;
  let stateView: EvmAddress | null = null;
  if (candidate.protocol === "uniswap_v4") {
    const key = candidate.poolKey;
    if (!key || !same(contract, config.poolManager)) {
      fail(
        "A v4 candidate requires its complete pool key and official PoolManager."
      );
    }
    token0 = getAddress(key.currency0);
    token1 = getAddress(key.currency1);
    ({ fee, tickSpacing } = key);
    hook = getAddress(key.hooks);
    poolId = ponsPoolId(key);
    stateView = address(config.stateView);
  } else {
    [token0, token1] = await Promise.all([
      client.readContract({
        ...at,
        address: getAddress(contract),
        functionName: "token0",
      }),
      client.readContract({
        ...at,
        address: getAddress(contract),
        functionName: "token1",
      }),
    ]);
    const expected = factoryFor(input.network, candidate.protocol);
    if (expected === null) {
      fail("This pool protocol is unavailable on the selected network.");
    }
    factory = address(expected);
    if (candidate.protocol === "uniswap_v3") {
      [fee, tickSpacing] = await Promise.all([
        client.readContract({
          ...at,
          address: getAddress(contract),
          functionName: "fee",
        }),
        client.readContract({
          ...at,
          address: getAddress(contract),
          functionName: "tickSpacing",
        }),
      ]);
    }
  }
  const target = tokenForPool(input.network, input.token, candidate.poolKey);
  if (
    BigInt(token0) >= BigInt(token1) ||
    (!same(token0, target) && !same(token1, target))
  ) {
    fail("The pool does not contain the requested token.");
  }
  const quoteToken = same(token0, target) ? token1 : token0;
  const quoteSymbol = quoteFor(input.network, quoteToken);
  if (!quoteSymbol) {
    fail(
      "The pool quote asset is not canonical USDC, USDG, or ETH on this network."
    );
  }
  if (
    input.quoteCurrency !== undefined &&
    input.quoteCurrency !== "USD" &&
    input.quoteCurrency !== quoteSymbol
  ) {
    fail("This pool uses a different quote currency than requested.");
  }
  const [tokenDecimals, quoteDecimals] = await Promise.all(
    [target, quoteToken].map(async (token) =>
      same(token, zeroAddress)
        ? 18
        : boundedDecimals(
            await client.readContract({
              ...at,
              address: token,
              functionName: "decimals",
            })
          )
    )
  );
  if (tokenDecimals === undefined || quoteDecimals === undefined) {
    fail("The pool token decimals are unavailable.");
  }
  const decoded = Schema.decodeUnknownSync(ResolvedPriceSource)({
    v: 1,
    key: `${input.network}:${poolId ?? contract}:${quoteSymbol}`,
    network: input.network,
    token: input.token,
    quoteCurrency: quoteSymbol,
    label: `${candidate.protocol} ${quoteSymbol} spot price`,
    basis: "per_token",
    limitations: [
      "Pool spot prices can move within a block; the liquidity floor does not guarantee execution at this price.",
      ...(input.network === "eip155:4663" ? [missingSequencer] : []),
    ],
    kind: "pool",
    pool: {
      protocol: candidate.protocol,
      contract,
      factory,
      poolId,
      token0: address(token0),
      token1: address(token1),
      tokenDecimals,
      quoteToken: address(quoteToken),
      quoteDecimals,
      quoteSymbol,
      fee,
      tickSpacing,
      hook: address(hook),
      stateView,
    },
    conversion: null,
  });
  if (decoded.kind !== "pool") {
    fail("Expected a pool source.");
  }
  return decoded;
};
const factoryCandidates = async (
  client: PriceClient,
  input: ResolvePriceInput
): Promise<readonly PricePoolCandidate[]> => {
  const config = PRICE_NETWORKS[input.network];
  const token = tokenForPool(input.network, input.token);
  const at = { abi: ABI, blockNumber: BigInt(input.block.number) } as const;
  const result: PricePoolCandidate[] = [];
  const lookups: Promise<void>[] = [];
  const add = async (
    protocol: PricePoolCandidate["protocol"],
    lookup: Promise<Address>
  ): Promise<void> => {
    try {
      const contract = await lookup;
      if (!same(contract, zeroAddress)) {
        result.push({ protocol, contract });
      }
    } catch {
      /* A missing pair is not evidence of a price. */
    }
  };
  for (const quote of [config.stable, config.wrappedNative]) {
    if (same(token, quote)) {
      continue;
    }
    lookups.push(
      add(
        "uniswap_v2",
        client.readContract({
          ...at,
          address: config.uniswapV2,
          functionName: "getPair",
          args: [token, quote],
        })
      )
    );
    for (const fee of [100, 500, 3000, 10_000]) {
      lookups.push(
        add(
          "uniswap_v3",
          client.readContract({
            ...at,
            address: config.uniswapV3,
            functionName: "getPool",
            args: [token, quote, fee],
          })
        )
      );
    }
    if (config.aerodrome !== null) {
      lookups.push(
        add(
          "aerodrome",
          client.readContract({
            ...at,
            address: config.aerodrome,
            functionName: "getPool",
            args: [token, quote, false],
          })
        )
      );
    }
  }
  await Promise.all(lookups);
  const nativeToken = input.token === "native" ? zeroAddress : token;
  // These are bounded candidate keys, not claims that a v4 pool exists. Arbitrary
  // fee/spacing combinations require an indexer-provided complete key.
  for (const quote of [config.stable, zeroAddress]) {
    if (same(nativeToken, quote)) {
      continue;
    }
    for (const [fee, tickSpacing] of [
      [100, 1],
      [500, 10],
      [3000, 60],
      [10_000, 200],
    ] as const) {
      const sorted = BigInt(nativeToken) < BigInt(quote);
      result.push({
        protocol: "uniswap_v4",
        contract: config.poolManager,
        poolKey: {
          currency0: sorted ? nativeToken : quote,
          currency1: sorted ? quote : nativeToken,
          fee,
          tickSpacing,
          hooks: zeroAddress,
        },
      });
    }
  }
  if (input.network === "eip155:4663" && input.token !== "native") {
    // InstantLaunchStrategy v3.2.0 uses this fixed hookless ETH key. The initialized
    // pool is independently checked, so no unbounded launch-log scan is needed.
    result.push({
      protocol: "uniswap_v4",
      contract: config.poolManager,
      poolKey: {
        currency0: zeroAddress,
        currency1: token,
        fee: 2500,
        tickSpacing: 25,
        hooks: zeroAddress,
      },
    });
    try {
      const launched = await client.readContract({
        blockNumber: BigInt(input.block.number),
        abi: PONS_ABI,
        address: PONS_DEPLOYMENTS.factory.address,
        functionName: "getLaunchedToken",
        args: [token],
      });
      if (
        launched.exists &&
        launched.phase === 2 &&
        same(launched.token, token)
      ) {
        const sorted = BigInt(token) < BigInt(launched.pairToken);
        result.push({
          protocol: "uniswap_v4",
          contract: config.poolManager,
          poolKey: {
            currency0: sorted ? token : launched.pairToken,
            currency1: sorted ? launched.pairToken : token,
            fee: launched.poolFee,
            tickSpacing: launched.tickSpacing,
            hooks: PONS_DEPLOYMENTS.hook.address,
          },
        });
      }
    } catch {
      /* Discovery does not interpret a curve or unavailable registration as a pool. */
    }
  }
  return result;
};
const selectPool = async (
  client: PriceClient,
  input: ResolvePriceInput,
  candidates: readonly PricePoolCandidate[]
): Promise<{ source: PoolSource; depth: PriceRatio } | null> => {
  const seen = new Set<string>();
  const pending = candidates.slice(0, 40).filter((candidate) => {
    try {
      const identity = `${candidate.protocol}:${candidate.contract.toLowerCase()}:${candidate.poolKey ? ponsPoolId(candidate.poolKey) : ""}`;
      if (seen.has(identity)) {
        return false;
      }
      seen.add(identity);
      return true;
    } catch {
      return false;
    }
  });
  const verified: { source: PoolSource; depth: PriceRatio }[] = [];
  const work = async (): Promise<void> => {
    const candidate = pending.shift();
    if (!candidate) {
      return;
    }
    try {
      const source = await sourceFromCandidate(client, input, candidate);
      const { depth } = await readPool(client, source, input.block);
      verified.push({ source, depth });
    } catch {
      /* An unverified or shallow candidate is not a price source. */
    }
    await work();
  };
  await Promise.all([work(), work(), work(), work()]);
  verified.sort((left, right) => {
    const difference =
      right.depth.numerator * left.depth.denominator -
      left.depth.numerator * right.depth.denominator;
    if (difference !== 0n) {
      return difference > 0n ? 1 : -1;
    }
    return left.source.key.localeCompare(right.source.key);
  });
  return verified[0] ?? null;
};
const observation = (
  source: ResolvedPriceSource,
  block: PriceBlock,
  ratio: PriceRatio | null,
  error?: PriceSourceUnavailableError
): PriceObservation =>
  Schema.decodeUnknownSync(PriceObservation)({
    v: 1,
    sourceKey: source.key,
    network: source.network,
    blockNumber: block.number,
    blockHash: block.hash,
    blockTime: block.timestamp,
    status: ratio ? "available" : "unavailable",
    price: ratio ? priceRatioDecimal(ratio) : null,
    numerator: ratio?.numerator.toString() ?? null,
    denominator: ratio?.denominator.toString() ?? null,
    reason: ratio
      ? null
      : (error?.message ??
        "The price provider could not verify a bounded response at the sealed block."),
    stubbed: error instanceof PriceSourceUnavailableError && error.stubbed,
  });
const subscriptionsFor = (
  source: ResolvedPriceSource
): ReturnType<PriceResolver["streamSubscriptions"]> => {
  const contracts: { key: string; contract: string; poolId: string | null }[] =
    [];
  const push = (
    contract: string | null,
    poolId: string | null = null
  ): void => {
    if (
      contract !== null &&
      !contracts.some(
        (entry) => same(entry.contract, contract) && entry.poolId === poolId
      )
    ) {
      contracts.push({ key: source.key, contract, poolId });
    }
  };
  const oracle = (feed: PriceOracleFeed): void => {
    push(feed.proxy);
    push(feed.aggregator);
    push(feed.sequencer);
    push(feed.stockToken);
  };
  if (source.kind === "oracle") {
    oracle(source.oracle);
  } else {
    push(source.pool.contract, source.pool.poolId);
    if (!same(source.pool.hook, zeroAddress)) {
      push(source.pool.hook);
      push(PONS_DEPLOYMENTS.factory.address);
    }
    if (source.conversion) {
      oracle(source.conversion);
    }
  }
  return contracts;
};

export const createPriceResolver = (
  deps: PriceResolverDependencies
): PriceResolver => {
  const catalog =
    deps.oracleCatalog ?? officialPriceOracleCatalog({ now: deps.now });
  const budgets = new Map<string, number>();
  const spendBlock = (
    network: OnchainPriceNetwork,
    block: PriceBlock
  ): void => {
    const key = `${network}:${block.number}:${block.hash.toLowerCase()}`;
    const used = (budgets.get(key) ?? 0) + 1;
    if (used > 200) {
      fail("The shared price read budget for this sealed block was exhausted.");
    }
    budgets.set(key, used);
    if (budgets.size > 64) {
      const oldest = budgets.keys().next().value;
      if (oldest !== undefined) {
        budgets.delete(oldest);
      }
    }
  };
  const readSource = async (
    rawSource: ResolvedPriceSource,
    block: PriceBlock,
    shared: boolean
  ): Promise<PriceObservation> => {
    const source = Schema.decodeUnknownSync(ResolvedPriceSource)(rawSource);
    try {
      const spend = shared
        ? () => {
            spendBlock(source.network, block);
          }
        : undefined;
      spend?.();
      await verifiedHeader(deps, source.network, block);
      const client = clientFor(deps, source.network, 40, spend);
      let ratio: PriceRatio;
      if (source.kind === "oracle") {
        ratio = await readOracle(client, deps, source.oracle, block);
      } else {
        if (source.network === "eip155:4663") {
          verifyFreshBlock(deps, block);
        }
        ({ ratio } = await readPool(client, source, block));
        if (source.conversion) {
          const conversion = await readOracle(
            client,
            deps,
            source.conversion,
            block
          );
          ratio = {
            numerator: ratio.numerator * conversion.numerator,
            denominator: ratio.denominator * conversion.denominator,
          };
        }
      }
      spend?.();
      await verifiedHeader(deps, source.network, block);
      return observation(source, block, ratio);
    } catch (error) {
      return observation(
        source,
        block,
        null,
        error instanceof Error ? providerFailure(error) : undefined
      );
    }
  };
  return {
    read: async (source, block) => await readSource(source, block, true),
    streamSubscriptions: subscriptionsFor,
    resolve: async (input) => {
      await verifiedHeader(deps, input.network, input.block);
      const client = clientFor(deps, input.network, 320);
      let oracleFailure: PriceSourceUnavailableError | null = null;
      const findFeed = async (
        token: PriceAsset
      ): Promise<{ feed: PriceOracleFeed; label: string } | null> => {
        let entries: readonly OracleCatalogEntry[];
        try {
          const { find: lookup } = catalog;
          entries = await lookup(input.network, token);
        } catch {
          return null;
        }
        const resolved = await Promise.all(
          entries.slice(0, 3).map(async (entry) => {
            if (entry.network !== input.network || !same(entry.token, token)) {
              return null;
            }
            try {
              return {
                feed: await resolveOracle(client, entry, input.block),
                label: entry.label,
              };
            } catch (error) {
              if (error instanceof PriceSourceUnavailableError) {
                oracleFailure = error;
              }
              return null;
            }
          })
        );
        return resolved.find((result) => result !== null) ?? null;
      };
      if (input.quoteCurrency === undefined || input.quoteCurrency === "USD") {
        const found = await findFeed(input.token);
        if (found) {
          const source = Schema.decodeUnknownSync(ResolvedPriceSource)({
            v: 1,
            key: `${input.network}:${input.token.toLowerCase()}:oracle:${found.feed.proxy}`,
            network: input.network,
            token: input.token,
            quoteCurrency: "USD",
            label: found.label,
            basis: "per_token",
            limitations: [
              ...(found.feed.sequencer === null ? [missingSequencer] : []),
              ...(found.feed.stockToken === null
                ? []
                : [
                    "Price is USD per token, already adjusted by the issuer multiplier; stock feeds follow market hours.",
                  ]),
            ],
            kind: "oracle",
            oracle: found.feed,
          });
          await verifiedHeader(deps, input.network, input.block);
          return source;
        }
      }
      const external = deps.discoverPools
        ? await deps.discoverPools(input).catch(() => [])
        : [];
      const candidates = [
        ...(input.candidates ?? []).slice(0, 10),
        ...external.slice(0, 10),
        ...(await factoryCandidates(client, input)),
      ];
      const best = await selectPool(client, input, candidates);
      if (!best) {
        throw (
          oracleFailure ??
          new PriceSourceUnavailableError(
            "No verified direct quote pool meets the liquidity floor. Nonstandard v4 keys require an indexer candidate; Pons curves and unreviewed hooks are unsupported."
          )
        );
      }
      let { source } = best;
      if (input.quoteCurrency === undefined || input.quoteCurrency === "USD") {
        const conversionToken =
          source.pool.quoteSymbol === "ETH" ? "native" : source.pool.quoteToken;
        const conversion = await findFeed(conversionToken);
        if (conversion) {
          source = {
            ...source,
            key: `${source.key}:USD:${conversion.feed.proxy}`,
            quoteCurrency: "USD",
            conversion: conversion.feed,
            limitations:
              source.limitations.includes(missingSequencer) ||
              conversion.feed.sequencer !== null
                ? source.limitations
                : [...source.limitations, missingSequencer],
          };
        } else if (input.quoteCurrency === "USD") {
          throw (
            oracleFailure ??
            new PriceSourceUnavailableError(
              "A fresh official USD conversion is unavailable. Choose the pool's explicit USDC, USDG, or ETH quote units."
            )
          );
        }
      }
      const decoded = Schema.decodeUnknownSync(ResolvedPriceSource)(source);
      await verifiedHeader(deps, input.network, input.block);
      return decoded;
    },
  };
};

/** Explicit local-demo adapter; neither resolution nor observation calls a provider. */
export const stubPriceResolver = (options: {
  readonly now: () => number;
  readonly price?: string;
}): PriceResolver => {
  const ratio = priceDecimalRatio(options.price ?? "1");
  return {
    resolve: async (input) =>
      await Promise.resolve(
        Schema.decodeUnknownSync(ResolvedPriceSource)({
          v: 1,
          key: `stub:${input.network}:${input.token.toLowerCase()}:${input.quoteCurrency ?? "USD"}`,
          network: input.network,
          token: input.token,
          quoteCurrency: input.quoteCurrency ?? "USD",
          label: "Demo token price",
          basis: "per_token",
          limitations: ["Demo price; no live oracle or pool was read."],
          kind: "oracle",
          oracle: {
            proxy: zeroAddress,
            aggregator: zeroAddress,
            decimals: 18,
            heartbeatSeconds: 1200,
            sequencer: null,
            stockToken: null,
          },
        })
      ),
    read: async (source, block) => {
      if (!source.key.startsWith("stub:") || !source.label.startsWith("Demo")) {
        return await Promise.resolve(
          observation(
            source,
            block,
            null,
            new PriceSourceUnavailableError(
              "This source does not belong to the demo price adapter.",
              true
            )
          )
        );
      }
      return await Promise.resolve({
        ...observation(source, block, ratio),
        stubbed: true,
      });
    },
    streamSubscriptions: () => [],
  };
};
