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

// Primary deployment tables, retrieved 2026-09-08 from Uniswap/docs:
// content/protocols/v3/deployments/v3-{base,ethereum}-deployments.mdx.
const DEPLOYMENTS = new Map([
  [
    "eip155:1",
    {
      router: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    },
  ],
  [
    "eip155:8453",
    {
      router: "0x6fF5693b99212Da76ad316178A184AB56D299b43",
      factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    },
  ],
  [
    "eip155:11155111",
    {
      router: "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b",
      factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
    },
  ],
  [
    "eip155:84532",
    {
      router: "0x492E6456D9528771018DeB9E87ef7750EF184104",
      factory: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    },
  ],
]);
export const UNISWAP_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export const uniswapDeployment = (network: string) =>
  DEPLOYMENTS.get(network) ?? null;

// Rollup data/operator fees are outside an EIP-1559 execution fee cap.
export const uniswapExecutionNetwork = (network: string): boolean =>
  network === "eip155:1" || network === "eip155:11155111";

const TOKEN = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
]);
const PERMIT = parseAbi([
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
const ROUTER = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
const SWAP = parseAbiParameters(
  "address recipient,uint256 amountIn,uint256 amountOutMin,bytes path,bool payerIsUser"
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
  let token = input.tokenIn.toLowerCase();
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
  if (token !== input.tokenOut.toLowerCase()) {
    throw new Error(
      "trade.route: the path does not reach the requested output token."
    );
  }
  const bytes: Hex = `0x${path}`;
  return { bytes, pools: route };
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
    description: string
  ): void => {
    transactions.push({
      kind,
      description,
      payload: {
        kind: "evm",
        to,
        data,
        value: "0",
        gasLimit: gas.toString(),
        maxFeePerGas: context.maxFeePerGas.toString(),
        maxPriorityFeePerGas: context.priorityFeePerGas.toString(),
        nonce: context.nonce + transactions.length,
      },
    });
  };
  const token = getAddress(input.tokenIn);
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
  const encoded = encodeAbiParameters(SWAP, [
    getAddress(input.wallet),
    BigInt(input.amount),
    minimum,
    path.bytes,
    true,
  ]);
  append(
    "swap",
    deployment.router,
    encodeFunctionData({
      abi: ROUTER,
      functionName: "execute",
      args: ["0x00", [encoded], deadline],
    }),
    1_000_000n,
    "Swap the exact input through a verified V3 path into this wallet."
  );
  return {
    transactions,
    expectedOutput: quote.output.expectedAmount,
    minimumOutput: minimum.toString(),
    expiresAt,
    pools: path.pools,
  };
};
