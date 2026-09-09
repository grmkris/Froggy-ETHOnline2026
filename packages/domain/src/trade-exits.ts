import type { Trade, TradeRule, TradeRuleUsage } from "./trade";
import { sameTradingAddress } from "./trading";

export const tradeExitTrigger = (
  rule: TradeRule,
  entry: Trade,
  observation: {
    readonly now: number;
    readonly expectedOutput: string;
    readonly heldOutput?: string;
    readonly quoteLiquidity: string;
  }
): NonNullable<Trade["exitReason"]> | null => {
  const { exits } = rule;
  if (
    exits === undefined ||
    entry.status !== "completed" ||
    entry.actualOutput === null
  ) {
    return null;
  }
  const acquired = BigInt(entry.actualOutput);
  if (acquired <= 0n) {
    return null;
  }
  const held = BigInt(observation.heldOutput ?? entry.actualOutput);
  const principal = BigInt(entry.actualInput ?? entry.input.amount) * held;
  const output = BigInt(observation.expectedOutput) * acquired;
  if (observation.now >= entry.updatedAt + exits.maxHoldMinutes * 60_000) {
    return "time";
  }
  if (
    exits.minimumQuoteLiquidity !== null &&
    BigInt(observation.quoteLiquidity) < BigInt(exits.minimumQuoteLiquidity)
  ) {
    return "liquidity";
  }
  if (
    exits.stopLossBps !== null &&
    output * 10_000n <= principal * BigInt(10_000 - exits.stopLossBps)
  ) {
    return "stop_loss";
  }
  if (
    exits.takeProfitBps !== null &&
    output * 10_000n >= principal * BigInt(10_000 + exits.takeProfitBps)
  ) {
    return "take_profit";
  }
  return null;
};

const exitAssetRefusal = (
  rule: TradeRule,
  exit: Trade["input"],
  entry: Trade["input"]
): string | null => {
  const same = (left: string, right: string) =>
    sameTradingAddress(rule.network, left, right);
  if (
    exit.network !== rule.network ||
    entry.network !== rule.network ||
    !same(exit.wallet, rule.wallet) ||
    !same(entry.wallet, rule.wallet) ||
    exit.venue !== entry.venue ||
    !rule.venues.includes(exit.venue) ||
    !same(exit.tokenIn, entry.tokenOut) ||
    !same(exit.tokenOut, rule.inputAsset) ||
    !same(entry.tokenIn, rule.inputAsset)
  ) {
    return "trade.exit_assets: exit must return the acquired token to the rule's quote asset in the same wallet and venue.";
  }
  return null;
};

const exitFeeRefusal = (
  rule: TradeRule,
  trade: Trade,
  usage: TradeRuleUsage
): string | null => {
  if (
    BigInt(trade.input.maxNativeFee) > BigInt(rule.maxNativeFeePerTrade) ||
    usage.nativeFee + BigInt(trade.input.maxNativeFee) >
      BigInt(rule.maxTotalNativeFee)
  ) {
    return "trade.gas: the native fee limit would be exceeded.";
  }
  return trade.input.slippageBps > rule.maxSlippageBps
    ? "trade.slippage: the slippage limit would be exceeded."
    : null;
};

/** Exit authority covers only confirmed units acquired under the same rule. */
export const tradeExitRefusal = (input: {
  readonly rule: TradeRule;
  readonly trade: Trade;
  readonly entry: Trade | undefined;
  readonly now: number;
  readonly usage: TradeRuleUsage;
  readonly allocated: bigint;
  readonly attempts: number;
}): string | null => {
  const { rule, trade, entry, usage } = input;
  if (
    rule.revokedAt !== null ||
    rule.expiresAt <= input.now ||
    rule.exits === undefined
  ) {
    return "trade.rule_inactive: no active human-issued exit authority.";
  }
  if (
    entry === undefined ||
    entry.status !== "completed" ||
    entry.actualOutput === null ||
    entry.exitOfTradeId !== undefined ||
    !entry.steps.some((step) => step.ruleId === rule.id)
  ) {
    return "trade.exit_source: the rule has no confirmed acquisition to exit.";
  }
  if (
    trade.automationRuleId !== rule.id ||
    trade.exitOfTradeId !== entry.id ||
    trade.exitReason === undefined ||
    trade.input.action !== "swap" ||
    entry.input.action !== "swap" ||
    trade.sourceTradeId !== undefined ||
    trade.stubbed !== entry.stubbed
  ) {
    return "trade.exit_identity: exit and acquisition authority do not match.";
  }
  const assetRefusal = exitAssetRefusal(rule, trade.input, entry.input);
  if (assetRefusal !== null) {
    return assetRefusal;
  }
  if (
    input.allocated + BigInt(trade.input.amount) >
    BigInt(entry.actualOutput)
  ) {
    return "trade.exit_capital: exit exceeds the unallocated confirmed acquisition.";
  }
  if (input.attempts >= rule.exits.maxAttempts) {
    return "trade.exit_attempts: the human-approved exit attempt limit is exhausted.";
  }
  return exitFeeRefusal(rule, trade, usage);
};
