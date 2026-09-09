import { ApprovalId, TradeStep, TradeStepId } from "@froggy/domain";
import type { Trade, TradeInput } from "@froggy/domain";
import { SwapQuoteInput } from "@froggy/protocol";
import { Schema } from "effect";
import { getAddress, parseAbi } from "viem";

import { assertTradeNetwork, tradeAllowance } from "./evm-chain";
import type { TradeEvmClient } from "./evm-chain";
import type { EvmExecutionOptions } from "./evm-execution";
import {
  evmTradeBalances,
  evmTradeSubmission,
  simulateEvmTrade,
} from "./evm-execution";
import type { UniswapQuotes } from "./uniswap";
import {
  buildUniswapTransactions,
  UNISWAP_PERMIT2,
  uniswapDeployment,
  uniswapExecutionNetwork,
} from "./uniswap-transactions";
import type { BuiltUniswap } from "./uniswap-transactions";

const FACTORY = parseAbi([
  "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address)",
]);
const hash = (value: string) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");

interface UniswapExecutionOptions extends EvmExecutionOptions {
  readonly quotes: UniswapQuotes;
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

export const uniswapExecution = (options: UniswapExecutionOptions) => ({
  prepare: async (input: TradeInput) => {
    if (!uniswapExecutionNetwork(input.network)) {
      throw new Error(
        "trade.fee_bound: this network has fees outside the signed transaction cap; execution is unavailable."
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
      tradeAllowance(
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
    await checkPools(options.client, input, built, blockNumber);
    const steps = built.transactions.map((transaction) =>
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
  submission: evmTradeSubmission(options),
});
