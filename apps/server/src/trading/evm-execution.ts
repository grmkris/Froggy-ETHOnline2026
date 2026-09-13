import { minimumTradeOutput } from "@froggy/domain";
import type {
  Trade,
  TradeAssetAmount,
  TradeInput,
  TradeSimulation,
  TradeStep,
} from "@froggy/domain";
import type { RawTradeSubmission } from "@froggy/wallet";
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
import { chainIdOf } from "./networks";
import { assertNativeFeeBudget } from "./rollup-fees";
import { tenderlySimulation } from "./tenderly";
import type { TenderlyOptions } from "./tenderly";

export interface EvmExecutionOptions {
  readonly client: TradeEvmClient;
  readonly tenderly: TenderlyOptions;
  readonly confirmations: number;
  readonly sponsored?: boolean;
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
  const flatSteps = steps.flatMap((step) =>
    step.payload.kind === "evm_calls"
      ? step.payload.calls.map((payload) => ({ ...step, payload }))
      : [step]
  );
  const transactions = flatSteps.map((step) => {
    if (step.payload.kind !== "evm") {
      throw new Error("trade.payload: expected EVM transaction.");
    }
    return step.payload;
  });
  const results = await tenderlySimulation(options.tenderly, {
    sponsored: options.sponsored === true,
    network: input.network,
    wallet: input.wallet,
    blockNumber: Number(blockNumber),
    transactions,
    assets,
  });
  validateSimulation(input, minimum, flatSteps, results, phase);
  let offset = 0;
  return steps.map((step) => {
    const count =
      step.payload.kind === "evm_calls" ? step.payload.calls.length : 1;
    const group = results.slice(offset, offset + count);
    offset += count;
    const last = group.at(-1);
    if (last === undefined) {
      throw new Error("trade.simulation: incomplete batch.");
    }
    return {
      ...last,
      gasUnits: group
        .reduce((sum, result) => sum + BigInt(result.gasUnits), 0n)
        .toString(),
    };
  });
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
  (signer: TradeSigner): RawTradeSubmission => ({
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
      const spent = trade.steps.reduce(
        (sum, entry) =>
          sum +
          (entry.actualNativeFee === null ? 0n : BigInt(entry.actualNativeFee)),
        0n
      );
      const remaining = trade.steps.flatMap((entry) =>
        entry.actualNativeFee === null && entry.payload.kind === "evm"
          ? [entry.payload]
          : []
      );
      await assertNativeFeeBudget({
        client: options.client,
        network: trade.input.network,
        wallet: trade.input.wallet,
        payloads: remaining,
        maxNativeFee: trade.input.maxNativeFee,
        spent,
      });
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
