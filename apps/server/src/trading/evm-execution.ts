import { minimumTradeOutput } from "@froggy/domain";
import type {
  Trade,
  TradeAssetAmount,
  TradeInput,
  TradeSimulation,
  TradeStep,
} from "@froggy/domain";
import type { TradeSubmission } from "@froggy/wallet";
import type { TransactionReceipt } from "viem";
import { getAddress, isHex } from "viem";

import type { TradeSigner } from "./coordinator";
import {
  assertTradeNetwork,
  checkTradeBeforeSigning,
  confirmedTradeReceipt,
  tradeTokenBalance,
} from "./evm-chain";
import type { TradeEvmClient } from "./evm-chain";
import { verifySignedTradeTransaction } from "./evm-signed";
import { chainIdOf, PONS_NETWORK } from "./networks";
import { tenderlySimulation } from "./tenderly";
import type { TenderlyOptions } from "./tenderly";
import { uniswapExecutionNetwork } from "./uniswap-transactions";

export interface EvmExecutionOptions {
  readonly client: TradeEvmClient;
  readonly tenderly: TenderlyOptions;
  readonly confirmations: number;
  readonly now: () => number;
  readonly settlementValues?: (
    trade: Trade,
    step: TradeStep,
    receipt: TransactionReceipt
  ) => { readonly output: string | null; readonly actualInput?: string };
}

const validateSimulation = (
  input: TradeInput,
  minimum: string,
  steps: readonly TradeStep[],
  results: readonly TradeSimulation[],
  phase: "standard" | "curve" | "graduated"
): void => {
  if (results.length !== steps.length) {
    throw new Error("trade.simulation: missing step results.");
  }
  for (const [index, step] of steps.entries()) {
    const result = results[index];
    if (
      result?.status !== "passed" ||
      result.stubbed ||
      step.payload.kind !== "evm" ||
      BigInt(result.gasUnits) > BigInt(step.payload.gasLimit)
    ) {
      throw new Error(
        "trade.simulation: a transaction reverted or exceeded its gas bound."
      );
    }
  }
  const changes = results.at(-1)?.assetChanges;
  const spent = changes?.find(
    (entry) => entry.asset.toLowerCase() === input.tokenIn.toLowerCase()
  );
  const received = changes?.find(
    (entry) => entry.asset.toLowerCase() === input.tokenOut.toLowerCase()
  );
  const actualInput =
    spent === undefined ? 0n : BigInt(spent.before) - BigInt(spent.after);
  const partial = input.venue === "pons" && phase === "curve";
  if (
    spent === undefined ||
    received === undefined ||
    actualInput <= 0n ||
    (partial
      ? actualInput > BigInt(input.amount)
      : actualInput !== BigInt(input.amount)) ||
    BigInt(received.after) - BigInt(received.before) <
      minimumTradeOutput(
        { input, phase, minimumOutput: minimum },
        actualInput.toString()
      )
  ) {
    throw new Error(
      "trade.simulation: token changes do not match the approved input and minimum output."
    );
  }
};

export const simulateEvmTrade = async (
  options: EvmExecutionOptions,
  input: TradeInput,
  steps: readonly TradeStep[],
  minimum: string,
  phase: "standard" | "curve" | "graduated" = "standard"
) => {
  const blockNumber = await options.client.getBlockNumber({ cacheTime: 0 });
  if (blockNumber > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("trade.block: block exceeds the simulator range.");
  }
  const tokens = [input.tokenIn, input.tokenOut];
  const assets = await Promise.all(
    tokens.map(async (address) => {
      const balance = await tradeTokenBalance(
        options.client,
        address,
        input.wallet,
        blockNumber
      );
      return { address, balance: balance.toString() };
    })
  );
  const transactions = steps.map((step) => {
    if (step.payload.kind !== "evm") {
      throw new Error("trade.payload: expected EVM transaction.");
    }
    return step.payload;
  });
  const results = await tenderlySimulation(options.tenderly, {
    network: input.network,
    wallet: input.wallet,
    blockNumber: Number(blockNumber),
    transactions,
    assets,
  });
  validateSimulation(input, minimum, steps, results, phase);
  return results;
};

export const evmTradeBalances =
  (options: EvmExecutionOptions) =>
  async (
    input: TradeInput
  ): Promise<{
    readonly balances: readonly TradeAssetAmount[];
    readonly observedAt: number;
  }> => {
    await assertTradeNetwork(options.client, input.network);
    const blockNumber = await options.client.getBlockNumber({ cacheTime: 0 });
    const [token, native] = await Promise.all([
      tradeTokenBalance(
        options.client,
        input.tokenIn,
        input.wallet,
        blockNumber
      ),
      options.client.getBalance({
        address: getAddress(input.wallet),
        blockNumber,
      }),
    ]);
    return {
      balances: [
        { asset: input.tokenIn, units: token.toString() },
        { asset: "native", units: native.toString() },
      ],
      observedAt: options.now(),
    };
  };

export const evmTradeSubmission =
  (options: EvmExecutionOptions) =>
  (signer: TradeSigner): TradeSubmission => ({
    sign: async (trade, step) => {
      if (
        signer?.kind !== "evm" ||
        signer.signer.address.toLowerCase() !==
          trade.input.wallet.toLowerCase() ||
        step.payload.kind !== "evm"
      ) {
        throw new Error(
          "trade.signer: the approved wallet signer is unavailable."
        );
      }
      if (
        !uniswapExecutionNetwork(trade.input.network) &&
        !(trade.input.venue === "pons" && trade.input.network === PONS_NETWORK)
      ) {
        throw new Error(
          "trade.fee_bound: this network has fees outside the signed transaction cap; execution is unavailable."
        );
      }
      await checkTradeBeforeSigning(options.client, trade, step);
      const { payload } = step;
      const chainId = chainIdOf(trade.input.network);
      if (chainId === null) {
        throw new Error("trade.signature: invalid EVM transaction encoding.");
      }
      const signed = await signer.signer.signTransaction({
        chainId,
        to: payload.to,
        data: payload.data,
        value: BigInt(payload.value),
        gasLimit: BigInt(payload.gasLimit),
        maxFeePerGas: BigInt(payload.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(payload.maxPriorityFeePerGas),
        nonce: payload.nonce,
      });
      return await verifySignedTradeTransaction(trade.input, payload, signed);
    },
    broadcast: async (trade, step) => {
      if (
        step.signedPayload === null ||
        step.payload.kind !== "evm" ||
        !isHex(step.signedPayload)
      ) {
        throw new Error("trade.signature: saved transaction missing.");
      }
      const checked = await verifySignedTradeTransaction(
        trade.input,
        step.payload,
        step.signedPayload
      );
      if (checked.transactionId !== step.transactionId) {
        throw new Error(
          "trade.signature: stored transaction identity mismatch."
        );
      }
      await assertTradeNetwork(options.client, trade.input.network);
      const returned = await options.client.sendRawTransaction({
        serializedTransaction: step.signedPayload,
      });
      if (returned.toLowerCase() !== checked.transactionId.toLowerCase()) {
        throw new Error(
          "trade.submission_unknown: RPC returned a different transaction identity."
        );
      }
    },
    reconcile: async (trade, step) =>
      await confirmedTradeReceipt(
        options.client,
        trade,
        step,
        options.confirmations,
        options.now(),
        options.settlementValues
      ),
  });
