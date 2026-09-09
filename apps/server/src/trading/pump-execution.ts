import { ApprovalId, TradeStep, TradeStepId } from "@froggy/domain";
import type {
  Trade,
  TradeAssetAmount,
  TradeInput,
  TradePayload,
} from "@froggy/domain";
import { Schema } from "effect";

import type { OutboundOptions } from "../outbound";
import type { TradeBackend } from "./coordinator";
import { WRAPPED_SOL } from "./jupiter";
import { pumpOrder } from "./pump";
import { pumpSettlement } from "./pump-receipt";
import {
  assessPumpTransaction,
  pumpWalletBalance,
  refreshPumpLifetime,
} from "./pump-simulation";
import { pumpAccount, pumpSnapshot, PUMP_PROGRAMS } from "./pump-state";
import type { SolanaTradeRpc } from "./solana-chain";
import {
  decodeSolanaTrade,
  signSolanaTrade,
  SOLANA_PROGRAMS,
  solanaAssociatedAccount,
  solanaMintProgram,
  solanaTokenAccount,
  verifySignedSolanaTrade,
} from "./solana-transactions";

type Payload = Extract<TradePayload, { kind: "solana" }>;
const payloadOf = (step: TradeStep): Payload => {
  if (step.payload.kind !== "solana") {
    throw new Error("trade.payload: expected a native Solana transaction.");
  }
  return step.payload;
};
const phaseOf = (trade: Trade): "curve" | "graduated" => {
  if (trade.phase !== "curve" && trade.phase !== "graduated") {
    throw new Error(
      "trade.phase: the immutable native launch phase is missing."
    );
  }
  return trade.phase;
};

export const pumpExecution = (options: {
  readonly rpc: SolanaTradeRpc;
  readonly outbound?: OutboundOptions;
  readonly now: () => number;
}): TradeBackend => {
  const assess = async (trade: Trade, step: TradeStep) => {
    const payload = payloadOf(step);
    return await assessPumpTransaction({
      rpc: options.rpc,
      input: trade.input,
      transaction: payload.transaction,
      lastValidBlockHeight: payload.lastValidBlockHeight,
      minimumOutput: trade.minimumOutput ?? "0",
      phase: phaseOf(trade),
      maximumFee: payload.nativeFeeLimit,
      now: options.now,
    });
  };
  return {
    stubbed: false,
    observe: async (input) => {
      const order = await pumpOrder(input, options.outbound);
      const snapshot = await pumpSnapshot(
        options.rpc,
        input,
        order.transaction
      );
      if (snapshot.state.phase !== order.phase) {
        throw new Error(
          "trade.phase: native launch phase changed during observation."
        );
      }
      const { pool } = snapshot.state;
      const liquidity =
        pool === null
          ? Buffer.from(
              pumpAccount(snapshot.accounts, snapshot.state.curve)?.data[0] ??
                "",
              "base64"
            ).readBigUInt64LE(32)
          : solanaTokenAccount(
              pumpAccount(snapshot.accounts, pool.quoteAccount),
              pool.address,
              WRAPPED_SOL,
              SOLANA_PROGRAMS.token
            );
      return {
        factory: PUMP_PROGRAMS.curve,
        expectedOutput: order.expectedOutput,
        quoteLiquidity: liquidity.toString(),
        observedAt: options.now(),
      };
    },
    prepare: async (input) => {
      const order = await pumpOrder(input, options.outbound);
      const fresh = await refreshPumpLifetime(
        options.rpc,
        input,
        order.transaction
      );
      const result = await assessPumpTransaction({
        rpc: options.rpc,
        input,
        ...fresh,
        minimumOutput: order.minimumOutput,
        phase: order.phase,
        now: options.now,
      });
      const payload: Payload = {
        kind: "solana",
        ...fresh,
        nativeFeeLimit: result.nativeFeeLimit,
        requestId: null,
      };
      const step = Schema.decodeUnknownSync(TradeStep)({
        id: TradeStepId.generate(),
        kind: "swap",
        description: `Native Pump ${result.phase === "curve" ? "bonding curve" : "graduated pool"} swap. Input is a maximum allocation; unused native input stays in this wallet.`,
        payload,
        fingerprint: new Bun.CryptoHasher("sha256")
          .update(JSON.stringify({ input, payload }))
          .digest("hex"),
        expiresAt: options.now() + 60_000,
        simulation: result.simulation,
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
      });
      return {
        steps: [step],
        expectedOutput: order.expectedOutput,
        minimumOutput: order.minimumOutput,
        phase: result.phase,
      };
    },
    simulate: async (trade) =>
      await Promise.all(
        trade.steps
          .filter((step) =>
            ["prepared", "awaiting_approval"].includes(step.status)
          )
          .map(async (step) => {
            const result = await assess(trade, step);
            return result.simulation;
          })
      ),
    balances: async (input: TradeInput) => {
      await options.rpc.assertNetwork(input.network);
      if (input.tokenIn === "native") {
        const snapshot = await options.rpc.accounts([input.wallet]);
        return {
          balances: [
            {
              asset: "native" as const,
              units: pumpWalletBalance(snapshot.value[0] ?? null).toString(),
            },
          ],
          observedAt: options.now(),
        };
      }
      const mint = await options.rpc.accounts([input.tokenIn]);
      const program = solanaMintProgram(mint.value[0] ?? null);
      const tokenAccount = await solanaAssociatedAccount(
        input.wallet,
        input.tokenIn,
        program
      );
      const snapshot = await options.rpc.accounts(
        [input.wallet, tokenAccount],
        mint.context.slot
      );
      const balances: TradeAssetAmount[] = [
        {
          asset: "native",
          units: pumpWalletBalance(snapshot.value[0] ?? null).toString(),
        },
        {
          asset: input.tokenIn,
          units: solanaTokenAccount(
            snapshot.value[1] ?? null,
            input.wallet,
            input.tokenIn,
            program
          ).toString(),
        },
      ];
      return { balances, observedAt: options.now() };
    },
    submission: (signer) => ({
      sign: async (trade, step) => {
        if (
          signer?.kind !== "solana" ||
          signer.signer.address !== trade.input.wallet
        ) {
          throw new Error(
            "trade.signer: the approved native wallet signer is unavailable."
          );
        }
        await assess(trade, step);
        return await signSolanaTrade(signer.signer, payloadOf(step));
      },
      broadcast: async (trade, step) => {
        const payload = payloadOf(step);
        if (step.signedPayload === null || step.transactionId === null) {
          throw new Error(
            "trade.identity: signed native transaction identity is missing."
          );
        }
        const checked = await verifySignedSolanaTrade(
          trade.input.wallet,
          payload.transaction,
          step.signedPayload
        );
        if (checked.transactionId !== step.transactionId) {
          throw new Error("trade.identity: saved native signature changed.");
        }
        await options.rpc.assertNetwork(trade.input.network);
        await options.rpc.validity(
          decodeSolanaTrade(payload.transaction, trade.input.wallet).compiled
            .lifetimeToken,
          payload.lastValidBlockHeight
        );
        await options.rpc.send(step.signedPayload, step.transactionId);
      },
      reconcile: async (trade, step) =>
        await pumpSettlement(options.rpc, trade, step, options.now),
    }),
  };
};
