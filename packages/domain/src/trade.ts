import { Schema } from "effect";

import { AgentConnectionId } from "./agent-invocation";
import {
  ApprovalId,
  LaunchEventId,
  LaunchWatchId,
  ReceiptId,
  TradeId,
  TradeRuleId,
  TradeStepId,
} from "./id";
import type { TokenResearchFacts } from "./token-research";
import { TradeResearchPolicy, tradeResearchRefusal } from "./token-research";
import {
  sameTradingAddress,
  TradingAddress,
  TradingNetwork,
  TradingUnits,
} from "./trading";

const Time = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Text = Schema.String.check(Schema.isMaxLength(500));
const Fingerprint = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const PositiveUnits = TradingUnits.check(
  Schema.makeFilter((value) => BigInt(value) > 0n, {
    message: "Amount must be positive.",
  })
);

export const TradeVenue = Schema.Literals([
  "uniswap",
  "jupiter",
  "enso",
  "pons",
  "pump",
]);
export type TradeVenue = typeof TradeVenue.Type;
export const TradeAction = Schema.Literals([
  "swap",
  "deposit",
  "withdraw",
  "claim",
  "withdraw_swap",
  "claim_swap",
]);
export type TradeAction = typeof TradeAction.Type;

const TradeAsset = Schema.Union([Schema.Literal("native"), TradingAddress]);

export const TradeInput = Schema.Struct({
  network: TradingNetwork,
  venue: TradeVenue,
  action: TradeAction,
  wallet: TradingAddress,
  tokenIn: TradeAsset,
  tokenOut: TradeAsset,
  amount: PositiveUnits,
  position: Schema.NullOr(TradingAddress),
  slippageBps: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 5000 })
  ),
  maxNativeFee: PositiveUnits,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type TradeInput = typeof TradeInput.Type;

/** Native fees and token principal are reserved independently. */
export const TradeAssetAmount = Schema.Struct({
  asset: TradeAsset,
  units: TradingUnits,
});
export type TradeAssetAmount = typeof TradeAssetAmount.Type;

const EvmTradePayload = Schema.Struct({
  kind: Schema.Literal("evm"),
  to: TradingAddress,
  data: Schema.String.check(
    Schema.isPattern(/^0x(?:[a-fA-F0-9]{2})*$/u),
    Schema.isMaxLength(64_002)
  ),
  value: TradingUnits,
  gasLimit: PositiveUnits,
  maxFeePerGas: PositiveUnits,
  maxPriorityFeePerGas: TradingUnits,
  nonce: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export const TradePayload = Schema.Union([
  EvmTradePayload,
  Schema.Struct({
    kind: Schema.Literal("evm_calls"),
    feePayer: Schema.Literal("app"),
    calls: Schema.Array(EvmTradePayload).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(8),
      Schema.makeFilter((calls) => JSON.stringify(calls).length <= 64_000)
    ),
  }),
  Schema.Struct({
    kind: Schema.Literal("solana"),
    transaction: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(4096)
    ),
    nativeFeeLimit: TradingUnits,
    lastValidBlockHeight: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    requestId: Schema.NullOr(Schema.String.check(Schema.isMaxLength(128))),
  }),
  Schema.Struct({
    kind: Schema.Literal("permit"),
    typedData: Schema.Json.check(
      Schema.makeFilter((value) => JSON.stringify(value).length <= 12_000)
    ),
  }),
]);
export type TradePayload = typeof TradePayload.Type;

export const TradeSimulation = Schema.Struct({
  status: Schema.Literals(["passed", "failed", "unavailable"]),
  provider: Schema.Literals(["tenderly", "quicknode", "fixture"]),
  observedAt: Time,
  block: Schema.String.check(Schema.isMaxLength(128)),
  gasUnits: TradingUnits,
  assetChanges: Schema.Array(
    Schema.Struct({
      asset: TradeAssetAmount.fields.asset,
      before: TradingUnits,
      after: TradingUnits,
    })
  ).check(Schema.isMaxLength(32)),
  error: Schema.NullOr(Text),
  stubbed: Schema.Boolean,
});
export type TradeSimulation = typeof TradeSimulation.Type;

export const TradeStepStatus = Schema.Literals([
  "prepared",
  "awaiting_approval",
  "signing",
  "signed",
  "submitted",
  "confirmed",
  "failed",
  "uncertain",
  "cancelled",
]);
export type TradeStepStatus = typeof TradeStepStatus.Type;
export const TradeStep = Schema.Struct({
  id: TradeStepId,
  kind: Schema.Literals([
    "approve",
    "permit",
    "swap",
    "deposit",
    "withdraw",
    "claim",
  ]),
  description: Text,
  payload: TradePayload,
  fingerprint: Fingerprint,
  expiresAt: Time,
  simulation: TradeSimulation,
  status: TradeStepStatus,
  approvalId: ApprovalId,
  authorizedAt: Schema.NullOr(Time),
  ruleId: Schema.NullOr(TradeRuleId),
  transactionId: Schema.NullOr(Schema.String.check(Schema.isMaxLength(128))),
  /** Server-only recovery material. Never returned in a task or tool result. */
  signedPayload: Schema.NullOr(Schema.String.check(Schema.isMaxLength(70_000))),
  managed: Schema.optionalKey(
    Schema.Struct({
      walletId: Schema.String.check(Schema.isMaxLength(128)),
      request: Schema.Json.check(
        Schema.makeFilter((value) => JSON.stringify(value).length <= 70_000)
      ),
      authorizationSignature: Schema.String.check(Schema.isMaxLength(4096)),
      idempotencyKey: Schema.String.check(Schema.isMaxLength(128)),
      expiresAt: Time,
      providerTransactionId: Schema.NullOr(
        Schema.String.check(Schema.isMaxLength(128))
      ),
      userOperationHash: Schema.NullOr(
        Schema.String.check(Schema.isMaxLength(128))
      ),
    })
  ),
  submittedAt: Schema.NullOr(Time),
  confirmedAt: Schema.NullOr(Time),
  actualNativeFee: Schema.NullOr(TradingUnits),
  /** EntryPoint gas cost covered by the app, excluding provider billing adjustments. */
  sponsoredNativeFee: Schema.optionalKey(TradingUnits),
  error: Schema.NullOr(Text),
});
export type TradeStep = typeof TradeStep.Type;

export const TradeStatus = Schema.Literals([
  "preparing",
  "awaiting_approval",
  "executing",
  "completed",
  "partial",
  "declined",
  "cancelled",
  "expired",
  "failed",
  "uncertain",
]);
export type TradeStatus = typeof TradeStatus.Type;
export const TradeEvent = Schema.Struct({
  id: ReceiptId,
  at: Time,
  stepId: Schema.NullOr(TradeStepId),
  outcome: Schema.Literals([
    "prepared",
    "allowed",
    "denied",
    "signed",
    "submitted",
    "confirmed",
    "failed",
    "uncertain",
    "cancelled",
  ]),
  reason: Text,
  transactionId: Schema.NullOr(Schema.String.check(Schema.isMaxLength(128))),
});
export type TradeEvent = typeof TradeEvent.Type;

export const Trade = Schema.Struct({
  v: Schema.Literal(1),
  id: TradeId,
  idempotencyKey: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128)
  ),
  connectionId: Schema.NullOr(AgentConnectionId),
  sourceTradeId: Schema.optionalKey(TradeId),
  automationRuleId: Schema.optionalKey(TradeRuleId),
  launchEventId: Schema.optionalKey(LaunchEventId),
  exitOfTradeId: Schema.optionalKey(TradeId),
  exitReason: Schema.optionalKey(
    Schema.Literals(["time", "take_profit", "stop_loss", "liquidity"])
  ),
  createdAt: Time,
  updatedAt: Time,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  input: TradeInput,
  inputFingerprint: Fingerprint,
  status: TradeStatus,
  expectedOutput: Schema.NullOr(TradingUnits),
  minimumOutput: Schema.NullOr(TradingUnits),
  actualOutput: Schema.NullOr(TradingUnits),
  actualInput: Schema.optionalKey(TradingUnits),
  phase: Schema.NullOr(Schema.Literals(["curve", "graduated", "standard"])),
  steps: Schema.Array(TradeStep).check(Schema.isMaxLength(8)),
  reservations: Schema.Array(TradeAssetAmount).check(Schema.isMaxLength(3)),
  reservationState: Schema.Literals(["none", "held", "released"]),
  receiptId: ReceiptId,
  events: Schema.Array(TradeEvent).check(Schema.isMaxLength(256)),
  error: Schema.NullOr(Text),
  limitations: Schema.Array(Text).check(Schema.isMaxLength(12)),
  stubbed: Schema.Boolean,
});
export type Trade = typeof Trade.Type;

/** Quote-asset returns exclude native transaction fees. Checks are bounded by the purchased watch. */
export const TradeExitPolicy = Schema.Struct({
  maxHoldMinutes: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 60 })
  ),
  takeProfitBps: Schema.NullOr(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000 }))
  ),
  stopLossBps: Schema.NullOr(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9999 }))
  ),
  minimumQuoteLiquidity: Schema.NullOr(TradingUnits),
  maxAttempts: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 })),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type TradeExitPolicy = typeof TradeExitPolicy.Type;

/** Only the authenticated person may create or revoke this rule. */
export const TradeRule = Schema.Struct({
  v: Schema.Literal(1),
  id: TradeRuleId,
  label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
  createdAt: Time,
  expiresAt: Time,
  revokedAt: Schema.NullOr(Time),
  network: TradingNetwork,
  wallet: TradingAddress,
  venues: Schema.Array(TradeVenue).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(5)
  ),
  actions: Schema.Array(TradeAction).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(6)
  ),
  inputAsset: TradeAsset,
  outputAssets: Schema.Array(TradeAsset).check(Schema.isMaxLength(32)),
  /** An empty token list requires a verified factory/program membership proof. */
  launchFactory: Schema.NullOr(TradingAddress),
  watchId: Schema.optionalKey(LaunchWatchId),
  exits: Schema.optionalKey(TradeExitPolicy),
  /** Fail-closed research predicates; absent means no research gate. */
  research: Schema.optionalKey(TradeResearchPolicy),
  maxInputPerTrade: PositiveUnits,
  maxTotalInput: PositiveUnits,
  maxNativeFeePerTrade: PositiveUnits,
  maxTotalNativeFee: PositiveUnits,
  maxSlippageBps: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 5000 })
  ),
  maxTrades: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  maxOpenPositions: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 20 })
  ),
});
export type TradeRule = typeof TradeRule.Type;

export interface TradeRuleUsage {
  readonly input: bigint;
  readonly nativeFee: bigint;
  readonly trades: number;
  readonly openPositions: number;
}

const tradeOutputAssetRefusal = (input: {
  readonly rule: TradeRule;
  readonly trade: TradeInput;
  readonly verifiedFactory: string | null;
}): string | null => {
  const { rule, trade } = input;
  const authorizedOutput = rule.outputAssets.some((asset) =>
    sameTradingAddress(trade.network, asset, trade.tokenOut)
  );
  if (authorizedOutput) {
    return null;
  }
  const verifiedLaunch =
    rule.launchFactory !== null &&
    input.verifiedFactory !== null &&
    sameTradingAddress(
      trade.network,
      input.verifiedFactory,
      rule.launchFactory
    );
  if (verifiedLaunch) {
    return null;
  }
  return "trade.output_asset: no authorized token or verified launch factory.";
};

const tradeUsageCapRefusal = (input: {
  readonly rule: TradeRule;
  readonly trade: TradeInput;
  readonly usage: TradeRuleUsage;
}): string | null => {
  const { rule, trade, usage } = input;
  if (
    BigInt(trade.amount) > BigInt(rule.maxInputPerTrade) ||
    usage.input + BigInt(trade.amount) > BigInt(rule.maxTotalInput)
  ) {
    return "trade.capital: the principal limit would be exceeded.";
  }
  if (
    BigInt(trade.maxNativeFee) > BigInt(rule.maxNativeFeePerTrade) ||
    usage.nativeFee + BigInt(trade.maxNativeFee) >
      BigInt(rule.maxTotalNativeFee)
  ) {
    return "trade.gas: the native fee limit would be exceeded.";
  }
  if (trade.slippageBps > rule.maxSlippageBps) {
    return "trade.slippage: the slippage limit would be exceeded.";
  }
  if (
    usage.trades >= rule.maxTrades ||
    usage.openPositions >= rule.maxOpenPositions
  ) {
    return "trade.positions: the trade or open-position limit would be exceeded.";
  }
  return null;
};

/** Pure authorization: callers supply time, durable usage and independently verified membership. */
export const tradeRuleRefusal = (input: {
  readonly rule: TradeRule;
  readonly trade: TradeInput;
  readonly now: number;
  readonly frozen: boolean;
  readonly usage: TradeRuleUsage;
  readonly verifiedFactory: string | null;
  readonly research?: TokenResearchFacts | null;
}): string | null => {
  const { rule, trade, now, usage } = input;
  if (input.frozen) {
    return "trade.frozen: the person froze this workspace.";
  }
  if (rule.revokedAt !== null || rule.expiresAt <= now) {
    return "trade.rule_inactive: the trading rule was revoked or expired.";
  }
  if (
    rule.network !== trade.network ||
    !sameTradingAddress(trade.network, rule.wallet, trade.wallet)
  ) {
    return "trade.wallet: network or wallet differs from the trading rule.";
  }
  if (
    !rule.venues.includes(trade.venue) ||
    !rule.actions.includes(trade.action)
  ) {
    return "trade.action: the venue or action is not authorized.";
  }
  if (!sameTradingAddress(trade.network, rule.inputAsset, trade.tokenIn)) {
    return "trade.input_asset: the input asset is not authorized.";
  }
  const outputRefusal = tradeOutputAssetRefusal(input);
  if (outputRefusal !== null) {
    return outputRefusal;
  }
  if (rule.research !== undefined) {
    const researchRefusal = tradeResearchRefusal({
      policy: rule.research,
      facts: input.research ?? null,
      now,
    });
    if (researchRefusal !== null) {
      return researchRefusal;
    }
  }
  return tradeUsageCapRefusal({ rule, trade, usage });
};

export const tradeFinished = (status: TradeStatus): boolean =>
  !["preparing", "awaiting_approval", "executing", "uncertain"].includes(
    status
  );

/** A later swap may reserve only confirmed, unallocated withdrawal or claim proceeds. */
export const tradeProceedsRefusal = (
  trade: Trade,
  source: Trade | undefined,
  allocated: bigint
): string | null => {
  if (trade.sourceTradeId === undefined) {
    return null;
  }
  if (
    source === undefined ||
    source.id !== trade.sourceTradeId ||
    source.status !== "completed" ||
    source.actualOutput === null ||
    !["withdraw", "claim"].includes(source.input.action)
  ) {
    return "trade.proceeds_pending: confirm a supported withdrawal or claim before using its proceeds.";
  }
  if (
    trade.input.action !== "swap" ||
    trade.input.network !== source.input.network ||
    !sameTradingAddress(
      trade.input.network,
      trade.input.wallet,
      source.input.wallet
    ) ||
    !sameTradingAddress(
      trade.input.network,
      trade.input.tokenIn,
      source.input.tokenOut
    ) ||
    trade.stubbed !== source.stubbed
  ) {
    return "trade.proceeds_identity: the proceeds must stay in the same wallet, network, asset and execution mode.";
  }
  if (BigInt(trade.input.amount) + allocated > BigInt(source.actualOutput)) {
    return "trade.proceeds_reserved: this amount exceeds the unallocated confirmed proceeds.";
  }
  return null;
};

/** Pons curve fills preserve a price bound when graduation refunds part of the maximum input. */
export const minimumTradeOutput = (
  trade: Pick<Trade, "input" | "phase" | "minimumOutput">,
  actualInput: string | undefined
): bigint => {
  const minimum = BigInt(trade.minimumOutput ?? "0");
  if (
    trade.input.venue !== "pons" ||
    trade.phase !== "curve" ||
    actualInput === undefined
  ) {
    return minimum;
  }
  const requested = BigInt(trade.input.amount);
  return (minimum * BigInt(actualInput) + requested - 1n) / requested;
};
