import { ApprovalId, TradeStep, TradeStepId } from "@froggy/domain";
import type { TokenResearchFacts, Trade, TradeInput } from "@froggy/domain";
import { SwapQuoteInput } from "@froggy/protocol";
import type { PrivyExecution } from "@froggy/wallet";
import { Schema } from "effect";
import { getAddress, parseAbi } from "viem";

import type { TradeSigner } from "./coordinator";
import { assertTradeNetwork, tradeAllowance } from "./evm-chain";
import type { TradeEvmClient } from "./evm-chain";
import type { EvmExecutionOptions } from "./evm-execution";
import {
  evmTradeBalances,
  evmTradeSubmission,
  simulateEvmTrade,
} from "./evm-execution";
import { stubGoPlus } from "./goplus";
import { managedTradeSubmission } from "./privy-execution";
import { liveTokenResearch } from "./research";
import { assertNativeFeeBudget } from "./rollup-fees";
import type { UniswapQuotes } from "./uniswap";
import {
  buildUniswapTransactions,
  UNISWAP_PERMIT2,
  uniswapDeployment,
  uniswapExecutionNetwork,
} from "./uniswap-transactions";
import type { BuiltUniswap } from "./uniswap-transactions";
import { launchVenuesFor } from "./venues";

const FACTORY = parseAbi([
  "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address)",
]);
const hash = (value: string) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");

interface UniswapExecutionOptions extends EvmExecutionOptions {
  readonly quotes: UniswapQuotes;
  readonly privy?: PrivyExecution | undefined;
}

const checkPools = async (
  client: TradeEvmClient,
  input: TradeInput,
  built: BuiltUniswap,
  blockNumber: bigint
): Promise<void> => {
  const deployment = uniswapDeployment(input.network);
  if (deployment === null) {
    throw new Error("trade.deployment: no reviewed deployment.");
  }
  const contracts = [deployment.router, deployment.factory, UNISWAP_PERMIT2];
  await Promise.all(
    contracts.map(async (address) => {
      const code = await client.getCode({
        address: getAddress(address),
        blockNumber,
      });
      if (code === undefined || code === "0x") {
        throw new Error(
          "trade.deployment: reviewed contract is missing on this network."
        );
      }
    })
  );
  await Promise.all(
    built.pools.map(async (pool) => {
      if (pool.protocol !== "v3" || pool.feeTier === null) {
        throw new Error("trade.pool: unsupported pool.");
      }
      const registered = await client.readContract({
        address: getAddress(deployment.factory),
        abi: FACTORY,
        functionName: "getPool",
        args: [
          getAddress(pool.tokenIn),
          getAddress(pool.tokenOut),
          Number(pool.feeTier),
        ],
        blockNumber,
      });
      if (registered.toLowerCase() !== pool.pool.toLowerCase()) {
        throw new Error(
          "trade.pool: quote pool is not registered by the reviewed factory."
        );
      }
    })
  );
};

/**
 * Concentration research for rule gates: the acquired token's holders are
 * reconstructed from Transfer logs on the route's own RPC. Launcher venues
 * add exclusions and a launch block; GoPlus stays out so the screen can never
 * feed a signing decision.
 */
const uniswapResearch = (options: UniswapExecutionOptions) => {
  const reader = liveTokenResearch({
    clientFor: () => options.client,
    venuesFor: (network) => launchVenuesFor(network, options.client),
    goplus: stubGoPlus(),
    now: options.now,
  });
  return async (input: TradeInput): Promise<TokenResearchFacts> => {
    if (input.tokenOut === "native") {
      throw new Error(
        "trade.research_venue: research applies to the token being acquired; a native output has no holders."
      );
    }
    return await reader.research({
      network: input.network,
      address: input.tokenOut,
      cohortWindowBlocks: 600,
      holderPageBudget: 5,
      topHolderCount: 10,
    });
  };
};

export const uniswapExecution = (options: UniswapExecutionOptions) => ({
  research: uniswapResearch(options),
  prepare: async (input: TradeInput) => {
    if (!uniswapExecutionNetwork(input.network)) {
      throw new Error(
        "trade.network: no reviewed Uniswap deployment for this action."
      );
    }
    if (
      (input.tokenIn === "native" || input.tokenOut === "native") &&
      options.sponsored !== true
    ) {
      throw new Error(
        "trade.sponsorship: native ETH swaps require the enabled Privy app-paid Base execution path."
      );
    }
    await assertTradeNetwork(options.client, input.network);
    if (input.tokenIn.toLowerCase() === input.tokenOut.toLowerCase()) {
      throw new Error("trade.assets: input and output must differ.");
    }
    const blockNumber = await options.client.getBlockNumber({ cacheTime: 0 });
    const [quote, nonce, fees, tokenAllowance] = await Promise.all([
      options.quotes.quote(
        Schema.decodeUnknownSync(SwapQuoteInput)({
          network: input.network,
          wallet: input.wallet,
          tokenIn: input.tokenIn,
          tokenOut: input.tokenOut,
          amount: input.amount,
          slippageBps: input.slippageBps,
        })
      ),
      options.client.getTransactionCount({
        address: getAddress(input.wallet),
        blockTag: "pending",
      }),
      options.client.estimateFeesPerGas(),
      input.tokenIn === "native"
        ? Promise.resolve(0n)
        : tradeAllowance(
            options.client,
            input.tokenIn,
            input.wallet,
            UNISWAP_PERMIT2,
            blockNumber
          ),
    ]);
    const now = options.now();
    const built = buildUniswapTransactions(input, quote, {
      nonce,
      maxFeePerGas: fees.maxFeePerGas,
      priorityFeePerGas: fees.maxPriorityFeePerGas,
      tokenAllowance,
      now,
    });
    if (options.sponsored !== true) {
      await assertNativeFeeBudget({
        client: options.client,
        network: input.network,
        wallet: input.wallet,
        payloads: built.transactions.map((transaction) => transaction.payload),
        maxNativeFee: input.maxNativeFee,
      });
    }
    await checkPools(options.client, input, built, blockNumber);
    const transactions =
      options.sponsored === true
        ? [
            {
              kind: "swap" as const,
              description:
                "Approve the required token allowances and swap atomically. Froggy pays gas. Native output is delivered as ETH.",
              payload: {
                kind: "evm_calls" as const,
                feePayer: "app" as const,
                calls: built.transactions.map((entry) => entry.payload),
              },
            },
          ]
        : built.transactions;
    const steps = transactions.map((transaction) =>
      Schema.decodeUnknownSync(TradeStep)({
        ...transaction,
        id: TradeStepId.generate(),
        fingerprint: hash(
          JSON.stringify({ input, payload: transaction.payload })
        ),
        expiresAt: built.expiresAt,
        status: "awaiting_approval",
        approvalId: ApprovalId.generate(),
        authorizedAt: null,
        ruleId: null,
        transactionId: null,
        signedPayload: null,
        submittedAt: null,
        confirmedAt: null,
        actualNativeFee: null,
        error: null,
        simulation: {
          status: "unavailable",
          provider: "tenderly",
          observedAt: now,
          block: blockNumber.toString(),
          gasUnits: "0",
          assetChanges: [],
          error: null,
          stubbed: false,
        },
      })
    );
    const results = await simulateEvmTrade(
      options,
      input,
      steps,
      built.minimumOutput
    );
    return {
      steps: steps.map((step, index) => ({
        ...step,
        simulation: results[index] ?? step.simulation,
      })),
      expectedOutput: built.expectedOutput,
      minimumOutput: built.minimumOutput,
    };
  },
  simulate: async (trade: Trade) =>
    await simulateEvmTrade(
      options,
      trade.input,
      trade.steps.filter(
        (step) =>
          step.status === "prepared" || step.status === "awaiting_approval"
      ),
      trade.minimumOutput ?? "0"
    ),
  balances: evmTradeBalances(options),
  submission: (signer: TradeSigner, trade?: Trade) => {
    if (
      trade?.steps.some((step) => step.payload.kind === "evm_calls") === true
    ) {
      if (options.privy === undefined) {
        throw new Error("trade.sponsorship: managed execution is unavailable.");
      }
      return managedTradeSubmission(options, options.privy, signer);
    }
    return evmTradeSubmission(options)(signer);
  },
});
