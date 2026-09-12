import { ApprovalId, TradeStep, TradeStepId } from "@froggy/domain";
import type {
  TokenResearchFacts,
  Trade,
  TradeInput,
  TradeStep as Step,
} from "@froggy/domain";
import { Schema } from "effect";
import { getAddress } from "viem";

import type { TradeBackend } from "./coordinator";
import { tradeAllowance } from "./evm-chain";
import {
  evmTradeBalances,
  evmTradeSubmission,
  simulateEvmTrade,
} from "./evm-execution";
import type { EvmExecutionOptions } from "./evm-execution";
import { stubGoPlus } from "./goplus";
import {
  PONS_DEPLOYMENTS,
  ponsToken,
  quotePons,
  readPonsSnapshot,
} from "./pons";
import { ponsSettlementValues } from "./pons-receipt";
import { buildPonsTransactions, validatePonsStep } from "./pons-transactions";
import { liveTokenResearch } from "./research";
import { ponsLaunchVenue } from "./venues";

export const ponsExecution = (
  configuration: EvmExecutionOptions
): TradeBackend => {
  const options = { ...configuration, settlementValues: ponsSettlementValues };
  const validate = async (trade: Trade, steps: readonly Step[]) => {
    const state = await readPonsSnapshot(
      options.client,
      trade.input,
      options.now
    );
    for (const step of steps) {
      validatePonsStep(trade, step, state);
    }
    return state;
  };
  const researchReader = liveTokenResearch({
    clientFor: () => options.client,
    venuesFor: () => [ponsLaunchVenue(options.client)],
    goplus: stubGoPlus(),
    now: options.now,
  });
  return {
    stubbed: false,
    observe: async (input) => {
      const state = await readPonsSnapshot(options.client, input, options.now);
      const expectedOutput = await quotePons(options.client, input, state);
      return {
        factory: PONS_DEPLOYMENTS.factory.address,
        expectedOutput: expectedOutput.toString(),
        quoteLiquidity: state.quoteLiquidity.toString(),
        observedAt: options.now(),
      };
    },
    research: async (input: TradeInput): Promise<TokenResearchFacts> => {
      const { token } = ponsToken(input);
      return await researchReader.research({
        network: input.network,
        address: token,
        cohortWindowBlocks: 600,
        holderPageBudget: 5,
        topHolderCount: 10,
      });
    },
    prepare: async (input) => {
      const state = await readPonsSnapshot(options.client, input, options.now);
      const [expectedOutput, nonce, fees, tokenAllowance] = await Promise.all([
        quotePons(options.client, input, state),
        options.client.getTransactionCount({
          address: getAddress(input.wallet),
          blockTag: "pending",
        }),
        options.client.estimateFeesPerGas(),
        tradeAllowance(
          options.client,
          input.tokenIn,
          input.wallet,
          state.phase === "curve"
            ? state.curve
            : PONS_DEPLOYMENTS.permit.address,
          state.block
        ),
      ]);
      const now = options.now();
      const built = buildPonsTransactions(input, state, {
        expectedOutput,
        nonce,
        tokenAllowance,
        now,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      const steps = built.transactions.map((transaction) =>
        Schema.decodeUnknownSync(TradeStep)({
          ...transaction,
          id: TradeStepId.generate(),
          fingerprint: new Bun.CryptoHasher("sha256")
            .update(JSON.stringify({ input, payload: transaction.payload }))
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
            observedAt: now,
            block: state.block.toString(),
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
        built.minimumOutput,
        built.phase
      );
      return {
        steps: steps.map((step, index) => ({
          ...step,
          simulation: results[index] ?? step.simulation,
        })),
        expectedOutput: built.expectedOutput,
        minimumOutput: built.minimumOutput,
        phase: built.phase,
      };
    },
    simulate: async (trade) => {
      const steps = trade.steps.filter(
        (step) =>
          step.status === "prepared" || step.status === "awaiting_approval"
      );
      const state = await validate(trade, steps);
      return await simulateEvmTrade(
        options,
        trade.input,
        steps,
        trade.minimumOutput ?? "0",
        state.phase
      );
    },
    balances: evmTradeBalances(options),
    submission: (signer) => {
      const submission = evmTradeSubmission(options)(signer);
      return {
        ...submission,
        sign: async (trade, step) => {
          await validate(trade, [step]);
          return await submission.sign(trade, step);
        },
      };
    },
  };
};
