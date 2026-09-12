import { ApprovalId, TradeStepId } from "@froggy/domain";
import type { TradeInput, TradeSimulation, TradeStep } from "@froggy/domain";
import type { RawTradeSubmission } from "@froggy/wallet";

import type { TradeBackend } from "./coordinator";
import { PONS_DEPLOYMENTS } from "./pons";
import { PUMP_PROGRAMS } from "./pump-state";

const simulation = (input: TradeInput, now: number): TradeSimulation => ({
  status: "passed",
  provider: "fixture",
  observedAt: now,
  block: "fixture",
  gasUnits: "1",
  assetChanges: [
    { asset: input.tokenIn, before: input.amount, after: "0" },
    { asset: input.tokenOut, before: "0", after: input.amount },
  ],
  error: null,
  stubbed: true,
});

const factoryFor = (venue: TradeInput["venue"]): string | null => {
  if (venue === "pons") {
    return PONS_DEPLOYMENTS.factory.address;
  }
  return venue === "pump" ? PUMP_PROGRAMS.curve : null;
};

/** Deliberately synthetic: no RPC, wallet client or live signer is reachable here. */
export const stubTradeBackend = (
  now: () => number
): TradeBackend<RawTradeSubmission> => ({
  stubbed: true,
  observe: async (input) => {
    await Promise.resolve();
    return {
      factory: factoryFor(input.venue),
      expectedOutput: input.amount,
      quoteLiquidity: "1000000000000",
      observedAt: now(),
    };
  },
  prepare: async (input) => {
    await Promise.resolve();
    const at = now();
    const step: TradeStep = {
      id: TradeStepId.generate(),
      kind: (
        {
          deposit: "deposit",
          withdraw: "withdraw",
          swap: "swap",
          claim: "claim",
          withdraw_swap: "withdraw",
          claim_swap: "claim",
        } as const
      )[input.action],
      description: `DEMO: simulated ${input.action}; no funds move.`,
      payload: input.network.startsWith("solana:")
        ? {
            kind: "solana",
            transaction: "fixture-unsigned-transaction",
            nativeFeeLimit: "1",
            lastValidBlockHeight: 1,
            requestId: "fixture-order",
          }
        : {
            kind: "evm",
            to: input.wallet,
            data: "0x",
            value: "0",
            gasLimit: "1",
            maxFeePerGas: "1",
            maxPriorityFeePerGas: "0",
            nonce: 0,
          },
      fingerprint: new Bun.CryptoHasher("sha256")
        .update(JSON.stringify(input))
        .digest("hex"),
      expiresAt: at + 5 * 60_000,
      simulation: simulation(input, at),
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
    };
    return {
      steps: [step],
      expectedOutput: input.amount,
      minimumOutput: input.amount,
      phase: ["pump", "pons"].includes(input.venue) ? "curve" : "standard",
    };
  },
  simulate: async (trade) => {
    await Promise.resolve();
    return trade.steps
      .filter(
        (step) =>
          step.status === "prepared" || step.status === "awaiting_approval"
      )
      .map(() => simulation(trade.input, now()));
  },
  balances: async (input) => {
    await Promise.resolve();
    return {
      balances:
        input.tokenIn === "native"
          ? [
              {
                asset: "native",
                units: (
                  BigInt(input.amount) + BigInt(input.maxNativeFee)
                ).toString(),
              },
            ]
          : [
              { asset: input.tokenIn, units: input.amount },
              { asset: "native", units: input.maxNativeFee },
            ],
      observedAt: now(),
    };
  },
  submission: () => ({
    sign: async (trade, step) => {
      await Promise.resolve();
      if (!trade.stubbed || !step.simulation.stubbed) {
        throw new Error(
          "trade.mode: a simulated signer cannot sign a live trade."
        );
      }
      return {
        payload: `stub:${step.id}`,
        transactionId: `stub:${trade.id}:${step.id}`,
      };
    },
    broadcast: async (trade) => {
      await Promise.resolve();
      if (!trade.stubbed) {
        throw new Error(
          "trade.mode: simulated submission requires a simulated trade."
        );
      }
    },
    reconcile: async (trade) => {
      await Promise.resolve();
      if (!trade.stubbed) {
        throw new Error(
          "trade.mode: simulated settlement requires a simulated trade."
        );
      }
      return {
        state: "confirmed",
        nativeFee: "1",
        output: trade.input.amount,
        actualInput: trade.input.amount,
        at: now(),
      };
    },
  }),
});
