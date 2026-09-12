import type { TradeInput, TradePayload } from "@froggy/domain";
import type { SwapQuoteResult } from "@froggy/protocol";
import {
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  parseAbi,
  parseAbiParameters,
} from "viem";
import type { Hex } from "viem";

import { PONS_NETWORK } from "./networks";
import { uniswapQuoteAsset } from "./uniswap";

type RouterVersion = "2.0" | "2.1.1";

interface UniswapDeployment {
  readonly router: string;
  readonly factory: string;
  /** Encoding of V3_SWAP_EXACT_IN; must match the pinned router bytecode. */
  readonly routerVersion: RouterVersion;
}

// Primary deployment tables:
// - Ethereum / Base / Sepolia: Uniswap/docs v3-{ethereum,base}-deployments (2026-09-08).
// - Robinhood: https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments
//   and https://developers.uniswap.org/docs/trading/swapping-api/supported-chains (UR 2.1.1 only).
//   Bytecode confirmed live on rpc.mainnet.chain.robinhood.com on 2026-09-12.
const DEPLOYMENTS = new Map<string, UniswapDeployment>([
  [
    "eip155:1",
    {
      router: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      routerVersion: "2.0",
    },
  ],
  [
    "eip155:8453",
    {
      router: "0x6fF5693b99212Da76ad316178A184AB56D299b43",
      factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
      routerVersion: "2.0",
    },
  ],
  [
    "eip155:11155111",
    {
      router: "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b",
      factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
      routerVersion: "2.0",
    },
  ],
  [
    "eip155:84532",
    {
      router: "0x492E6456D9528771018DeB9E87ef7750EF184104",
      factory: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
      routerVersion: "2.0",
    },
  ],
  [
    PONS_NETWORK,
    {
      router: getAddress("0x8876789976decbfcbbbe364623c63652db8c0904"),
      factory: getAddress("0x1f7d7550b1b028f7571e69a784071f0205fd2efa"),
      routerVersion: "2.1.1",
    },
  ],
]);
export const UNISWAP_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const uniswapDeployment = (network: string) =>
  DEPLOYMENTS.get(network) ?? null;

/** True when a reviewed Uniswap deployment is pinned for this network. */
export const uniswapExecutionNetwork = (network: string): boolean =>
  uniswapDeployment(network) !== null;

const TOKEN = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
]);
const PERMIT = parseAbi([
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
const ROUTER = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
const SWAP_V20 = parseAbiParameters(
  "address recipient,uint256 amountIn,uint256 amountOutMin,bytes path,bool payerIsUser"
);
// UR 2.1.1 appends minHopPriceX36; empty disables per-hop checks.
// https://github.com/Uniswap/universal-router/releases/tag/2.1.1
const SWAP_V211 = parseAbiParameters(
  "address recipient,uint256 amountIn,uint256 amountOutMin,bytes path,bool payerIsUser,uint256[] minHopPriceX36"
);

export interface UniswapTransactionContext {
  readonly nonce: number;
  readonly maxFeePerGas: bigint;
  readonly priorityFeePerGas: bigint;
  readonly tokenAllowance: bigint;
  readonly now: number;
}

export interface BuiltUniswap {
  readonly transactions: readonly {
    readonly kind: "approve" | "swap";
    readonly description: string;
    readonly payload: Extract<TradePayload, { kind: "evm" }>;
  }[];
  readonly expectedOutput: string;
  readonly minimumOutput: string;
  readonly expiresAt: number;
  readonly pools: SwapQuoteResult["route"][number];
}

const pathFor = (input: TradeInput, quote: SwapQuoteResult) => {
  const [route] = quote.route;
  if (
    quote.route.length !== 1 ||
    route === undefined ||
    route.length === 0 ||
    route.length > 4 ||
    quote.feeOutputs.length !== 0 ||
    quote.stubbed
  ) {
    throw new Error(
      "trade.route: execution requires one live, fee-free V3 path with at most four pools."
    );
  }
  let token = uniswapQuoteAsset(input.network, input.tokenIn).toLowerCase();
  let path = token.slice(2);
  for (const pool of route) {
    if (
      pool.protocol !== "v3" ||
      pool.tokenIn.toLowerCase() !== token ||
      pool.feeTier === null ||
      !/^\d{1,6}$/u.test(pool.feeTier) ||
      Number(pool.feeTier) > 1_000_000
    ) {
      throw new Error(
        "trade.route: the proposed path is not a continuous V3 route."
      );
    }
    token = getAddress(pool.tokenOut).toLowerCase();
    path += BigInt(pool.feeTier).toString(16).padStart(6, "0") + token.slice(2);
  }
  if (
    token !== uniswapQuoteAsset(input.network, input.tokenOut).toLowerCase()
  ) {
    throw new Error(
      "trade.route: the path does not reach the requested output token."
    );
  }
  const bytes: Hex = `0x${path}`;
  return { bytes, pools: route };
};

const encodeExactIn = (
  version: RouterVersion,
  recipient: string,
  amountIn: bigint,
  amountOutMin: bigint,
  path: Hex,
  payerIsUser: boolean
): Hex => {
  if (version === "2.1.1") {
    return encodeAbiParameters(SWAP_V211, [
      getAddress(recipient),
      amountIn,
      amountOutMin,
      path,
      payerIsUser,
      [],
    ]);
  }
  return encodeAbiParameters(SWAP_V20, [
    getAddress(recipient),
    amountIn,
    amountOutMin,
    path,
    payerIsUser,
  ]);
};

/** Constructs one known router command; upstream transaction calldata is never signed. */
export const buildUniswapTransactions = (
  input: TradeInput,
  quote: SwapQuoteResult,
  context: UniswapTransactionContext
): BuiltUniswap => {
  const deployment = uniswapDeployment(input.network);
  if (
    deployment === null ||
    input.venue !== "uniswap" ||
    input.action !== "swap"
  ) {
    throw new Error(
      "trade.network: no reviewed Uniswap deployment for this action."
    );
  }
  if (
    quote.network !== input.network ||
    quote.input.wallet.toLowerCase() !== input.wallet.toLowerCase() ||
    quote.input.tokenIn.toLowerCase() !== input.tokenIn.toLowerCase() ||
    quote.input.tokenOut.toLowerCase() !== input.tokenOut.toLowerCase() ||
    quote.input.amount !== input.amount ||
    quote.input.slippageBps !== input.slippageBps ||
    quote.refreshAfter <= context.now
  ) {
    throw new Error(
      "trade.quote: quote identity or freshness differs from the requested trade."
    );
  }
  if (BigInt(input.amount) >= 2n ** 160n) {
    throw new Error("trade.amount: input exceeds the Permit2 allowance range.");
  }
  const path = pathFor(input, quote);
  const minimum =
    (BigInt(quote.output.expectedAmount) * BigInt(10_000 - input.slippageBps)) /
    10_000n;
  if (minimum === 0n) {
    throw new Error("trade.output: a nonzero minimum output is required.");
  }
  const expiresAt = context.now + 5 * 60_000;
  const deadline = BigInt(Math.floor(expiresAt / 1000));
  const transactions: BuiltUniswap["transactions"][number][] = [];
  const append = (
    kind: "approve" | "swap",
    to: string,
    data: Hex,
    gas: bigint,
    description: string,
    value = "0"
  ): void => {
    transactions.push({
      kind,
      description,
      payload: {
        kind: "evm",
        to,
        data,
        value,
        gasLimit: gas.toString(),
        maxFeePerGas: context.maxFeePerGas.toString(),
        maxPriorityFeePerGas: context.priorityFeePerGas.toString(),
        nonce: context.nonce + transactions.length,
      },
    });
  };
  const token = getAddress(uniswapQuoteAsset(input.network, input.tokenIn));
  if (input.tokenIn !== "native") {
    if (context.tokenAllowance < BigInt(input.amount)) {
      if (context.tokenAllowance !== 0n) {
        append(
          "approve",
          token,
          encodeFunctionData({
            abi: TOKEN,
            functionName: "approve",
            args: [UNISWAP_PERMIT2, 0n],
          }),
          100_000n,
          "Reset the existing token allowance before setting an exact amount."
        );
      }
      append(
        "approve",
        token,
        encodeFunctionData({
          abi: TOKEN,
          functionName: "approve",
          args: [UNISWAP_PERMIT2, BigInt(input.amount)],
        }),
        100_000n,
        "Approve exactly the requested input amount to the reviewed Permit2 contract."
      );
    }
    append(
      "approve",
      UNISWAP_PERMIT2,
      encodeFunctionData({
        abi: PERMIT,
        functionName: "approve",
        args: [
          token,
          getAddress(deployment.router),
          BigInt(input.amount),
          Number(deadline),
        ],
      }),
      100_000n,
      "Give the reviewed router an exact, five-minute Permit2 allowance."
    );
  }
  const encoded = encodeExactIn(
    deployment.routerVersion,
    input.tokenOut === "native" ? deployment.router : input.wallet,
    BigInt(input.amount),
    minimum,
    path.bytes,
    input.tokenIn !== "native"
  );
  const inputs: Hex[] = [encoded];
  let commands: Hex = "0x00";
  const payment = parseAbiParameters("address recipient,uint256 amount");
  if (input.tokenIn === "native") {
    commands = "0x0b00";
    inputs.unshift(
      encodeAbiParameters(payment, [
        getAddress(deployment.router),
        BigInt(input.amount),
      ])
    );
  }
  if (input.tokenOut === "native") {
    commands = "0x000c";
    inputs.push(
      encodeAbiParameters(payment, [getAddress(input.wallet), minimum])
    );
  }
  append(
    "swap",
    deployment.router,
    encodeFunctionData({
      abi: ROUTER,
      functionName: "execute",
      args: [commands, inputs, deadline],
    }),
    1_000_000n,
    "Swap the exact input through a verified V3 path into this wallet.",
    input.tokenIn === "native" ? input.amount : "0"
  );
  return {
    transactions,
    expectedOutput: quote.output.expectedAmount,
    minimumOutput: minimum.toString(),
    expiresAt,
    pools: path.pools,
  };
};
