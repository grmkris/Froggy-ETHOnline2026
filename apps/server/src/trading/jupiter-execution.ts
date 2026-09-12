import { ApprovalId, TradeStep, TradeStepId } from "@froggy/domain";
import type {
  Trade,
  TradeAssetAmount,
  TradeInput,
  TradePayload,
} from "@froggy/domain";
import type { RawTradeSubmission } from "@froggy/wallet";
import { Schema } from "effect";

import type { TradeBackend, TradeSigner } from "./coordinator";
import { jupiterMint, jupiterOrders } from "./jupiter";
import type { JupiterOptions } from "./jupiter";
import { assessJupiterTransaction } from "./jupiter-simulation";
import type { SolanaTradeReceipt, SolanaTradeRpc } from "./solana-chain";
import {
  decodeSolanaTrade,
  signSolanaTrade,
  SOLANA_PROGRAMS,
  solanaAssociatedAccount,
  solanaTokenAccount,
  verifySignedSolanaTrade,
} from "./solana-transactions";

type Payload = Extract<TradePayload, { kind: "solana" }>;
const payloadOf = (step: TradeStep): Payload => {
  if (step.payload.kind !== "solana") {
    throw new Error("trade.payload: expected a Solana transaction.");
  }
  return step.payload;
};
const tokenChange = (
  receipt: SolanaTradeReceipt,
  owner: string,
  mint: string
): bigint => {
  const sum = (
    balances: SolanaTradeReceipt["meta"]["preTokenBalances"]
  ): bigint =>
    balances
      .filter((balance) => balance.owner === owner && balance.mint === mint)
      .reduce(
        (total, balance) => total + BigInt(balance.uiTokenAmount.amount),
        0n
      );
  return (
    sum(receipt.meta.postTokenBalances) - sum(receipt.meta.preTokenBalances)
  );
};

const wrappedLamports = async (
  receipt: SolanaTradeReceipt,
  input: TradeInput,
  payload: Payload
): Promise<bigint> => {
  if (input.tokenIn !== "native" && input.tokenOut !== "native") {
    return 0n;
  }
  const wrapped = await solanaAssociatedAccount(
    input.wallet,
    jupiterMint("native")
  );
  const decoded = decodeSolanaTrade(payload.transaction, input.wallet);
  const accounts = [
    ...decoded.compiled.staticAccounts,
    ...(receipt.meta.loadedAddresses?.writable ?? []),
    ...(receipt.meta.loadedAddresses?.readonly ?? []),
  ];
  const index = accounts.indexOf(wrapped);
  const before = receipt.meta.preBalances[index];
  if (
    before === undefined ||
    receipt.meta.postBalances[index] !== 0 ||
    accounts.length !== receipt.meta.preBalances.length
  ) {
    throw new Error(
      "trade.receipt: wrapped SOL account rent accounting is incomplete."
    );
  }
  return BigInt(before);
};

const settlement = async (
  rpc: SolanaTradeRpc,
  trade: Trade,
  step: TradeStep,
  now: () => number
) => {
  const payload = payloadOf(step);
  if (step.transactionId === null || step.signedPayload === null) {
    throw new Error(
      "trade.identity: no persisted Solana transaction identity."
    );
  }
  await rpc.assertNetwork(trade.input.network);
  const receipt = await rpc.receipt(step.transactionId);
  if (receipt === null) {
    return { state: "pending" as const };
  }
  const checked = await verifySignedSolanaTrade(
    trade.input.wallet,
    payload.transaction,
    receipt.transaction[0]
  );
  if (
    checked.transactionId !== step.transactionId ||
    receipt.transaction[0] !== step.signedPayload
  ) {
    throw new Error(
      "trade.receipt: finalized Solana transaction differs from the saved signature."
    );
  }
  const [before] = receipt.meta.preBalances;
  const [after] = receipt.meta.postBalances;
  if (before === undefined || after === undefined) {
    throw new Error("trade.receipt: Solana fee-payer balances are missing.");
  }
  const fee = BigInt(receipt.meta.fee);
  if (receipt.meta.err !== null) {
    return {
      state: "reverted" as const,
      nativeFee: fee.toString(),
      output: null,
      at: now(),
    };
  }
  const { input } = trade;
  const nativeDelta = BigInt(after) - BigInt(before);
  const wrappedBefore = await wrappedLamports(receipt, input, payload);
  const output =
    input.tokenOut === "native"
      ? nativeDelta + fee - wrappedBefore
      : tokenChange(receipt, input.wallet, input.tokenOut);
  if (
    input.tokenIn !== "native" &&
    tokenChange(receipt, input.wallet, input.tokenIn) !== -BigInt(input.amount)
  ) {
    throw new Error(
      "trade.receipt: finalized input consumption differs from the approved principal."
    );
  }
  const nativeCost =
    input.tokenOut === "native"
      ? fee
      : -nativeDelta -
        (input.tokenIn === "native" ? BigInt(input.amount) : 0n) +
        wrappedBefore;
  if (nativeCost < 0n || output < 0n) {
    throw new Error(
      "trade.receipt: final native or token accounting is incomplete."
    );
  }
  return {
    state: "confirmed" as const,
    nativeFee: nativeCost.toString(),
    output: output.toString(),
    at: now(),
  };
};

export const jupiterExecution = (options: {
  readonly rpc: SolanaTradeRpc;
  readonly jupiter: JupiterOptions;
  readonly now: () => number;
}): TradeBackend<RawTradeSubmission> => {
  const orders = jupiterOrders(options.jupiter);
  const assess = async (trade: Trade, step: TradeStep) => {
    const payload = payloadOf(step);
    return await assessJupiterTransaction({
      rpc: options.rpc,
      input: trade.input,
      transaction: payload.transaction,
      lastValidBlockHeight: payload.lastValidBlockHeight,
      minimumOutput: trade.minimumOutput ?? "0",
      maximumFee: payload.nativeFeeLimit,
      now: options.now,
    });
  };
  return {
    stubbed: false,
    prepare: async (input: TradeInput) => {
      const order = await orders.order(input);
      const result = await assessJupiterTransaction({
        rpc: options.rpc,
        input,
        transaction: order.transaction,
        minimumOutput: order.otherAmountThreshold,
        lastValidBlockHeight: Number(order.lastValidBlockHeight),
        now: options.now,
      });
      if (result.feeBps !== order.feeBps) {
        throw new Error(
          "trade.fees: encoded Jupiter fee differs from the order."
        );
      }
      const payload: Payload = {
        kind: "solana",
        transaction: order.transaction,
        requestId: order.requestId,
        nativeFeeLimit: result.nativeFeeLimit,
        lastValidBlockHeight: Number(order.lastValidBlockHeight),
      };
      const step = Schema.decodeUnknownSync(TradeStep)({
        id: TradeStepId.generate(),
        kind: "swap",
        description: `Swap the exact input through Jupiter Metis into this wallet. Jupiter fee: ${order.feeBps} bps in ${order.feeMint}.`,
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
        expectedOutput: order.outAmount,
        minimumOutput: order.otherAmountThreshold,
      };
    },
    simulate: async (trade) =>
      await Promise.all(
        trade.steps
          .filter(
            (step) =>
              step.status === "awaiting_approval" || step.status === "prepared"
          )
          .map(async (step) => {
            const result = await assess(trade, step);
            return result.simulation;
          })
      ),
    balances: async (input) => {
      await options.rpc.assertNetwork(input.network);
      const source = await solanaAssociatedAccount(
        input.wallet,
        jupiterMint(input.tokenIn)
      );
      const snapshot = await options.rpc.accounts([input.wallet, source]);
      const [wallet, account] = snapshot.value;
      if (
        wallet === null ||
        wallet === undefined ||
        wallet.owner !== SOLANA_PROGRAMS.system ||
        account === undefined
      ) {
        throw new Error(
          "trade.balance: the Solana wallet balance is unavailable."
        );
      }
      const balances: TradeAssetAmount[] = [
        { asset: "native", units: String(wallet.lamports) },
      ];
      if (input.tokenIn !== "native") {
        balances.push({
          asset: input.tokenIn,
          units: solanaTokenAccount(
            account,
            input.wallet,
            input.tokenIn
          ).toString(),
        });
      }
      return { balances, observedAt: options.now() };
    },
    submission: (signer: TradeSigner) => ({
      sign: async (trade, step) => {
        if (
          signer?.kind !== "solana" ||
          signer.signer.address !== trade.input.wallet
        ) {
          throw new Error(
            "trade.signer: approved Solana owner signer is unavailable."
          );
        }
        await assess(trade, step);
        return await signSolanaTrade(signer.signer, payloadOf(step));
      },
      broadcast: async (trade, step) => {
        const payload = payloadOf(step);
        if (
          step.signedPayload === null ||
          step.transactionId === null ||
          payload.requestId === null
        ) {
          throw new Error("trade.identity: signed Jupiter order is missing.");
        }
        const checked = await verifySignedSolanaTrade(
          trade.input.wallet,
          payload.transaction,
          step.signedPayload
        );
        if (checked.transactionId !== step.transactionId) {
          throw new Error("trade.identity: saved Solana signature changed.");
        }
        await options.rpc.assertNetwork(trade.input.network);
        const decoded = decodeSolanaTrade(
          payload.transaction,
          trade.input.wallet
        );
        await options.rpc.validity(
          decoded.compiled.lifetimeToken,
          payload.lastValidBlockHeight
        );
        await orders.execute({
          requestId: payload.requestId,
          transaction: step.signedPayload,
          transactionId: step.transactionId,
          lastValidBlockHeight: payload.lastValidBlockHeight,
        });
      },
      reconcile: async (trade, step) =>
        await settlement(options.rpc, trade, step, options.now),
    }),
  };
};
