import type { TradeInput } from "@froggy/domain";
import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseAbi,
  parseAbiParameters,
} from "viem";
import type { Address } from "viem";

import { assertTradeNetwork } from "./evm-chain";
import type { TradeEvmClient } from "./evm-chain";
import { PONS_NETWORK } from "./networks";

// Addresses: Pons official README, Robinhood token registry, Uniswap deployment feed.
// Runtime hashes observed at Robinhood block 58375958; see docs/evidence/PONS_DEPLOYMENTS.md.
export const PONS_DEPLOYMENTS = {
  factory: {
    address: getAddress("0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e"),
    hash: "0x89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84",
  },
  hook: {
    address: getAddress("0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044"),
    hash: "0xc21b1e6c1b45403e81a581f22ed6d9c747997af1cfdac1b1dc9f4b1d346a10db",
  },
  deployer: {
    address: getAddress("0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42"),
    hash: "0xeade22566c766377f6adfb99534f2772251efad9568642c0704a7051418e624c",
  },
  manager: {
    address: getAddress("0x8366a39CC670B4001A1121B8F6A443A643e40951"),
    hash: "0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626",
  },
  state: {
    address: getAddress("0xF3334192D15450CdD385c8B70e03f9A6bD9E673b"),
    hash: "0x7d9c591e0956fd89d98feb4ffcfe8bf1f7a62bd485edd979fa21d104b49878a6",
  },
  quoter: {
    address: getAddress("0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94"),
    hash: "0xd707b1da8cb165e5ea35a3b4450d971eb562ec171e23492aa117036b78a868f6",
  },
  router: {
    address: getAddress("0x06AfBA43Fd06227fA663b0DAecF536f6EaA6bf99"),
    hash: "0xbe8e8191bb42d843c2e948a5a55772eaab864ce01e54dcd47c9d089170b302d5",
  },
  permit: {
    address: getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
    hash: "0x5208783f52488f7d3493e5e38311ab707c1d75457fe472a19b0b4d57d66a7fca",
  },
  quote: {
    address: getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
    hash: "0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6",
  },
} as const;

export const PONS_ABI = parseAbi([
  "struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }",
  "function getLaunchedToken(address) view returns (LaunchedToken)",
  "function memeHook() view returns(address)",
  "function launchDeployer() view returns(address)",
  "function poolManager() view returns(address)",
  "function factory() view returns(address)",
  "function token() view returns(address)",
  "function pairToken() view returns(address)",
  "function decimals() view returns(uint8)",
  "function getReserves() view returns(uint256,uint256)",
  "function realQuoteReserve() view returns(uint256)",
  "function sellableTokens() view returns(uint256)",
  "function readyToGraduate() view returns(bool)",
  "function graduated() view returns(bool)",
  "function feeBps() view returns(uint256)",
  "function creatorTaxBps() view returns(uint256)",
  "function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)",
  "function getLiquidity(bytes32) view returns(uint128)",
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteParams) returns(uint256,uint256)",
  "function buy(uint256 quoteIn,uint256 minTokensOut,address recipient) payable returns(uint256)",
  "function sell(uint256 tokensIn,uint256 minQuoteOut,address recipient) returns(uint256)",
  "event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)",
  "event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)",
]);

export interface PonsPool {
  readonly currency0: Address;
  readonly currency1: Address;
  readonly fee: number;
  readonly tickSpacing: number;
  readonly hooks: Address;
}
export interface PonsSnapshot {
  readonly block: bigint;
  readonly quoteLiquidity: bigint;
  readonly token: Address;
  readonly curve: Address;
  readonly buy: boolean;
  readonly phase: "curve" | "graduated";
  readonly pool: PonsPool;
  readonly quoteReserve: bigint;
  readonly tokenReserve: bigint;
  readonly realQuoteReserve: bigint;
  readonly sellableTokens: bigint;
  readonly feeBps: bigint;
  readonly creatorTaxBps: bigint;
}

export const ponsToken = (input: TradeInput) => {
  const quote = PONS_DEPLOYMENTS.quote.address.toLowerCase();
  const buy = input.tokenIn.toLowerCase() === quote;
  if (
    input.network !== PONS_NETWORK ||
    input.venue !== "pons" ||
    input.action !== "swap" ||
    input.position !== null ||
    (!buy && input.tokenOut.toLowerCase() !== quote) ||
    input.tokenIn.toLowerCase() === input.tokenOut.toLowerCase() ||
    BigInt(input.amount) >= 2n ** 127n
  ) {
    throw new Error(
      "trade.pons_route: choose a USDG/Pons V2 token swap on Robinhood with no position address."
    );
  }
  return { token: getAddress(buy ? input.tokenOut : input.tokenIn), buy };
};

const verifyDeployments = async (
  client: TradeEvmClient,
  blockNumber: bigint
): Promise<void> => {
  await Promise.all(
    Object.values(PONS_DEPLOYMENTS).map(async (deployment) => {
      const code = await client.getCode({
        address: deployment.address,
        blockNumber,
      });
      if (code === undefined || keccak256(code) !== deployment.hash) {
        throw new Error(
          "trade.deployment: a reviewed Pons dependency changed or is missing."
        );
      }
    })
  );
  const [hook, deployer, manager] = await Promise.all([
    client.readContract({
      address: PONS_DEPLOYMENTS.factory.address,
      abi: PONS_ABI,
      functionName: "memeHook",
      blockNumber,
    }),
    client.readContract({
      address: PONS_DEPLOYMENTS.factory.address,
      abi: PONS_ABI,
      functionName: "launchDeployer",
      blockNumber,
    }),
    client.readContract({
      address: PONS_DEPLOYMENTS.factory.address,
      abi: PONS_ABI,
      functionName: "poolManager",
      blockNumber,
    }),
  ]);
  if (
    hook.toLowerCase() !== PONS_DEPLOYMENTS.hook.address.toLowerCase() ||
    deployer.toLowerCase() !==
      PONS_DEPLOYMENTS.deployer.address.toLowerCase() ||
    manager.toLowerCase() !== PONS_DEPLOYMENTS.manager.address.toLowerCase()
  ) {
    throw new Error(
      "trade.deployment: the Pons factory dependency bindings changed."
    );
  }
};

const curveState = async (
  client: TradeEvmClient,
  curve: Address,
  blockNumber: bigint
) => {
  const common = { address: curve, abi: PONS_ABI, blockNumber } as const;
  const [
    reserves,
    realQuoteReserve,
    sellableTokens,
    feeBps,
    creatorTaxBps,
    ready,
    graduated,
  ] = await Promise.all([
    client.readContract({ ...common, functionName: "getReserves" }),
    client.readContract({ ...common, functionName: "realQuoteReserve" }),
    client.readContract({ ...common, functionName: "sellableTokens" }),
    client.readContract({ ...common, functionName: "feeBps" }),
    client.readContract({ ...common, functionName: "creatorTaxBps" }),
    client.readContract({ ...common, functionName: "readyToGraduate" }),
    client.readContract({ ...common, functionName: "graduated" }),
  ]);
  if (
    ready ||
    graduated ||
    feeBps + creatorTaxBps >= 10_000n ||
    reserves[0] === 0n ||
    reserves[1] === 0n ||
    sellableTokens === 0n
  ) {
    throw new Error(
      "trade.phase: the curve is closed or awaiting graduation; no exit is assumed available."
    );
  }
  return {
    quoteReserve: reserves[0],
    tokenReserve: reserves[1],
    realQuoteReserve,
    sellableTokens,
    feeBps,
    creatorTaxBps,
  };
};

export const ponsPoolId = (pool: PonsPool) =>
  keccak256(
    encodeAbiParameters(
      parseAbiParameters("address,address,uint24,int24,address"),
      [pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks]
    )
  );

const verifyAsset = async (
  client: TradeEvmClient,
  token: Address,
  curve: Address,
  blockNumber: bigint
): Promise<void> => {
  const [factory, pair, curveToken, decimals, quoteDecimals] =
    await Promise.all([
      client.readContract({
        address: curve,
        abi: PONS_ABI,
        functionName: "factory",
        blockNumber,
      }),
      client.readContract({
        address: curve,
        abi: PONS_ABI,
        functionName: "pairToken",
        blockNumber,
      }),
      client.readContract({
        address: curve,
        abi: PONS_ABI,
        functionName: "token",
        blockNumber,
      }),
      client.readContract({
        address: token,
        abi: PONS_ABI,
        functionName: "decimals",
        blockNumber,
      }),
      client.readContract({
        address: PONS_DEPLOYMENTS.quote.address,
        abi: PONS_ABI,
        functionName: "decimals",
        blockNumber,
      }),
    ]);
  if (
    factory.toLowerCase() !== PONS_DEPLOYMENTS.factory.address.toLowerCase() ||
    pair.toLowerCase() !== PONS_DEPLOYMENTS.quote.address.toLowerCase() ||
    curveToken.toLowerCase() !== token.toLowerCase() ||
    decimals !== 18 ||
    quoteDecimals !== 6
  ) {
    throw new Error(
      "trade.membership: token, curve, factory or quote units do not match."
    );
  }
};

export const readPonsSnapshot = async (
  client: TradeEvmClient,
  input: TradeInput,
  now: () => number
): Promise<PonsSnapshot> => {
  const { token, buy } = ponsToken(input);
  await assertTradeNetwork(client, input.network);
  const block = await client.getBlock();
  if (
    block.hash === null ||
    Number(block.timestamp) * 1000 > now() ||
    now() - Number(block.timestamp) * 1000 > 30_000
  ) {
    throw new Error("trade.snapshot: the Pons chain head is stale or invalid.");
  }
  await verifyDeployments(client, block.number);
  const record = await client.readContract({
    address: PONS_DEPLOYMENTS.factory.address,
    abi: PONS_ABI,
    functionName: "getLaunchedToken",
    args: [token],
    blockNumber: block.number,
  });
  if (
    !record.exists ||
    record.token.toLowerCase() !== token.toLowerCase() ||
    record.pairToken.toLowerCase() !==
      PONS_DEPLOYMENTS.quote.address.toLowerCase() ||
    ![0, 2].includes(record.phase) ||
    record.poolFee !== 0 ||
    record.tickSpacing <= 0
  ) {
    throw new Error(
      "trade.membership: no supported Pons V2 USDG launch in a tradable phase."
    );
  }
  await verifyAsset(client, token, record.curve, block.number);
  const quote = PONS_DEPLOYMENTS.quote.address;
  const pool: PonsPool = {
    currency0: token.toLowerCase() < quote.toLowerCase() ? token : quote,
    currency1: token.toLowerCase() < quote.toLowerCase() ? quote : token,
    fee: record.poolFee,
    tickSpacing: record.tickSpacing,
    hooks: PONS_DEPLOYMENTS.hook.address,
  };
  const phase = record.phase === 0 ? "curve" : "graduated";
  let state = {
    quoteReserve: 0n,
    tokenReserve: 0n,
    realQuoteReserve: 0n,
    sellableTokens: 0n,
    feeBps: 0n,
    creatorTaxBps: 0n,
  };
  let quoteLiquidity = 0n;
  if (phase === "curve") {
    state = await curveState(client, record.curve, block.number);
    quoteLiquidity = state.realQuoteReserve;
  } else {
    const id = ponsPoolId(pool);
    const [slot, liquidity] = await Promise.all([
      client.readContract({
        address: PONS_DEPLOYMENTS.state.address,
        abi: PONS_ABI,
        functionName: "getSlot0",
        args: [id],
        blockNumber: block.number,
      }),
      client.readContract({
        address: PONS_DEPLOYMENTS.state.address,
        abi: PONS_ABI,
        functionName: "getLiquidity",
        args: [id],
        blockNumber: block.number,
      }),
    ]);
    if (slot[0] === 0n || liquidity === 0n) {
      throw new Error(
        "trade.liquidity: the graduated Pons pool has no active liquidity."
      );
    }
    // Active-liquidity equivalent reserves, in USDG units; this is not total pool TVL.
    quoteLiquidity =
      pool.currency0.toLowerCase() === quote.toLowerCase()
        ? (liquidity * 2n ** 96n) / slot[0]
        : (liquidity * slot[0]) / 2n ** 96n;
  }
  const after = await client.getBlock({ blockNumber: block.number });
  if (
    after.hash !== block.hash ||
    now() - Number(after.timestamp) * 1000 > 30_000
  ) {
    throw new Error("trade.snapshot: the Pons observation was reorganized.");
  }
  return {
    ...state,
    block: block.number,
    quoteLiquidity,
    token,
    curve: record.curve,
    buy,
    phase,
    pool,
  };
};

export const ponsCurveQuote = (state: PonsSnapshot, amount: bigint): bigint => {
  if (amount <= 0n || state.feeBps + state.creatorTaxBps >= 10_000n) {
    throw new Error("trade.quote: invalid curve amount or fee.");
  }
  if (state.buy) {
    const net =
      amount -
      (amount * state.feeBps) / 10_000n -
      (amount * state.creatorTaxBps) / 10_000n;
    const output = (net * state.tokenReserve) / (state.quoteReserve + net);
    if (output > state.sellableTokens) {
      throw new Error(
        "trade.partial_quote: this buy would cross graduation. Choose a smaller allocation or wait for the pool."
      );
    }
    if (output === 0n) {
      throw new Error("trade.liquidity: the curve quote rounds to zero.");
    }
    return output;
  }
  const gross = (amount * state.quoteReserve) / (state.tokenReserve + amount);
  if (gross > state.realQuoteReserve) {
    throw new Error(
      "trade.liquidity: the curve cannot cover the requested exit."
    );
  }
  const output =
    gross -
    (gross * state.feeBps) / 10_000n -
    (gross * state.creatorTaxBps) / 10_000n;
  if (output === 0n) {
    throw new Error("trade.liquidity: the curve quote rounds to zero.");
  }
  return output;
};

export const quotePons = async (
  client: TradeEvmClient,
  input: TradeInput,
  state: PonsSnapshot
): Promise<bigint> => {
  if (state.phase === "curve") {
    return ponsCurveQuote(state, BigInt(input.amount));
  }
  const result = await client.simulateContract({
    address: PONS_DEPLOYMENTS.quoter.address,
    abi: PONS_ABI,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: state.pool,
        zeroForOne:
          state.pool.currency0.toLowerCase() === input.tokenIn.toLowerCase(),
        exactAmount: BigInt(input.amount),
        hookData: "0x",
      },
    ],
    blockNumber: state.block,
  });
  if (result.result[0] === 0n || result.result[0] >= 2n ** 128n) {
    throw new Error(
      "trade.liquidity: no bounded graduated Pons quote is available."
    );
  }
  return result.result[0];
};
