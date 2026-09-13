import { ApprovalId, TradeStepId } from "@froggy/domain";
import type { TradeInput, TradeStep } from "@froggy/domain";
import type { PrivyExecution } from "@froggy/wallet";
import { getAddress, encodeFunctionData, erc20Abi } from "viem";

import { bridgeDeposit, CARD_BRIDGE } from "./card-bridge";
import type { CardBridgeQuotes } from "./card-bridge";
import type { TradeBackend } from "./coordinator";
import { assertTradeNetwork } from "./evm-chain";
import { evmTradeBalances, simulateEvmTrade } from "./evm-execution";
import type { EvmExecutionOptions } from "./evm-execution";
import { managedTradeSubmission } from "./privy-execution";

export const cardBridgeExecution = (
  options: EvmExecutionOptions & {
    readonly quotes: CardBridgeQuotes;
    readonly privy: PrivyExecution;
  }
): TradeBackend => ({
  stubbed: false,
  prepare: async (input: TradeInput) => {
    await assertTradeNetwork(options.client, input.network);
    const [built, block, nonce, fees, code] = await Promise.all([
      options.quotes.quote(input),
      options.client.getBlockNumber({ cacheTime: 0 }),
      options.client.getTransactionCount({
        address: getAddress(input.wallet),
        blockTag: "pending",
      }),
      options.client.estimateFeesPerGas(),
      options.client.getCode({ address: CARD_BRIDGE.sourcePool }),
    ]);
    if (code === undefined || code === "0x") {
      throw new Error(
        "trade.bridge_deployment: verified Across pool is missing."
      );
    }
    const payload = {
      kind: "evm_calls" as const,
      feePayer: "app" as const,
      calls: built.calls.map((call, index) => ({
        ...call,
        kind: "evm" as const,
        nonce: nonce + index,
        gasLimit: "300000",
        maxFeePerGas: fees.maxFeePerGas.toString(),
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
      })),
    };
    const step: TradeStep = {
      id: TradeStepId.generate(),
      kind: "bridge",
      description:
        "Fund the saved Linea address with USDC through Across. Froggy pays Base gas. Source confirmation is separate from Linea arrival.",
      payload,
      fingerprint: new Bun.CryptoHasher("sha256")
        .update(JSON.stringify({ input, payload }))
        .digest("hex"),
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
        observedAt: options.now(),
        block: block.toString(),
        gasUnits: "0",
        assetChanges: [],
        error: null,
        stubbed: false,
      },
    };
    const results = await simulateEvmTrade(
      options,
      input,
      [step],
      built.minimumOutput
    );
    return {
      steps: [{ ...step, simulation: results[0] ?? step.simulation }],
      expectedOutput: built.expectedOutput,
      minimumOutput: built.minimumOutput,
    };
  },
  simulate: async (trade) => {
    for (const step of trade.steps) {
      if (
        step.payload.kind !== "evm_calls" ||
        step.payload.calls.length !== 2
      ) {
        throw new Error("trade.bridge_calls: invalid approved batch.");
      }
      const [approval, deposit] = step.payload.calls;
      if (
        approval === undefined ||
        deposit === undefined ||
        approval.to.toLowerCase() !== CARD_BRIDGE.inputToken.toLowerCase() ||
        deposit.to.toLowerCase() !== CARD_BRIDGE.sourcePool.toLowerCase() ||
        step.payload.calls.some((call) => call.value !== "0") ||
        approval.data.toLowerCase() !==
          encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [CARD_BRIDGE.sourcePool, BigInt(trade.input.amount)],
          }).toLowerCase()
      ) {
        throw new Error("trade.bridge_calls: missing deposit.");
      }
      bridgeDeposit(trade.input, deposit.data);
    }
    return await simulateEvmTrade(
      options,
      trade.input,
      trade.steps,
      trade.minimumOutput ?? "0"
    );
  },
  balances: evmTradeBalances(options),
  submission: (signer) =>
    managedTradeSubmission(options, options.privy, signer),
});
