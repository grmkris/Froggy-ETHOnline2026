import { describe, expect, it } from "bun:test";

import { Schema } from "effect";

import { TradeRuleId } from "./id";
import { TokenResearchFacts, TradeResearchPolicy } from "./token-research";
import { TradeInput, TradeRule, tradeRuleRefusal } from "./trade";

const wallet = `0x${"1".repeat(40)}`;
const tokenIn = `0x${"2".repeat(40)}`;
const tokenOut = `0x${"3".repeat(40)}`;
const factory = `0x${"4".repeat(40)}`;
const trade = Schema.decodeUnknownSync(TradeInput)({
  network: "eip155:8453",
  venue: "uniswap",
  action: "swap",
  wallet,
  tokenIn,
  tokenOut,
  amount: "100",
  position: null,
  slippageBps: 50,
  maxNativeFee: "10",
});
const rule = Schema.decodeUnknownSync(TradeRule)({
  v: 1,
  id: TradeRuleId.generate(),
  label: "A bounded trading rule",
  createdAt: 1,
  expiresAt: 10_000,
  revokedAt: null,
  network: trade.network,
  wallet,
  venues: ["uniswap"],
  actions: ["swap"],
  inputAsset: tokenIn,
  outputAssets: [tokenOut],
  launchFactory: null,
  maxInputPerTrade: "100",
  maxTotalInput: "300",
  maxNativeFeePerTrade: "10",
  maxTotalNativeFee: "30",
  maxSlippageBps: 50,
  maxTrades: 3,
  maxOpenPositions: 2,
});
const context = {
  rule,
  trade,
  now: 10,
  frozen: false,
  usage: { input: 0n, nativeFee: 0n, trades: 0, openPositions: 0 },
  verifiedFactory: null,
};

describe("human trading rules", () => {
  it("checks a freeze before every other refusal", () => {
    expect(
      tradeRuleRefusal({ ...context, frozen: true, now: 100_000 })
    ).toContain("trade.frozen");
  });

  it("never treats a revoked or expired rule as fresh authority", () => {
    expect(tradeRuleRefusal({ ...context, now: rule.expiresAt })).toContain(
      "trade.rule_inactive"
    );
    expect(
      tradeRuleRefusal({ ...context, rule: { ...rule, revokedAt: 2 } })
    ).toContain("trade.rule_inactive");
  });

  it("includes in-flight reservations in cumulative principal and gas limits", () => {
    expect(tradeRuleRefusal(context)).toBeNull();
    expect(
      tradeRuleRefusal({ ...context, usage: { ...context.usage, input: 201n } })
    ).toContain("trade.capital");
    expect(
      tradeRuleRefusal({
        ...context,
        usage: { ...context.usage, nativeFee: 21n },
      })
    ).toContain("trade.gas");
    expect(
      tradeRuleRefusal({
        ...context,
        usage: { ...context.usage, input: 200n, nativeFee: 20n },
      })
    ).toBeNull();
  });

  it("requires verified factory membership for future tokens", () => {
    const future = {
      ...context,
      rule: {
        ...rule,
        outputAssets: [],
        launchFactory: Schema.decodeUnknownSync(TradeRule.fields.launchFactory)(
          factory
        ),
      },
    };
    expect(tradeRuleRefusal(future)).toContain("trade.output_asset");
    expect(tradeRuleRefusal({ ...future, verifiedFactory: wallet })).toContain(
      "trade.output_asset"
    );
    expect(
      tradeRuleRefusal({ ...future, verifiedFactory: factory })
    ).toBeNull();
  });

  it("refuses route changes, excess slippage and filled position capacity", () => {
    expect(
      tradeRuleRefusal({ ...context, trade: { ...trade, network: "eip155:1" } })
    ).toContain("trade.wallet");
    expect(
      tradeRuleRefusal({ ...context, trade: { ...trade, venue: "enso" } })
    ).toContain("trade.action");
    expect(
      tradeRuleRefusal({ ...context, trade: { ...trade, slippageBps: 51 } })
    ).toContain("trade.slippage");
    expect(
      tradeRuleRefusal({
        ...context,
        usage: { ...context.usage, openPositions: 2 },
      })
    ).toContain("trade.positions");
  });
});

it("treats EVM checksums as one authority identity", () => {
  const lower = `0x${"ab".repeat(20)}`;
  const upper = `0x${"AB".repeat(20)}`;
  expect(
    tradeRuleRefusal({
      ...context,
      trade: { ...trade, wallet: upper, tokenIn: upper, tokenOut: upper },
      rule: {
        ...rule,
        wallet: lower,
        inputAsset: lower,
        outputAssets: [lower],
      },
    })
  ).toBeNull();
});

it("fails closed on a research policy when facts are absent", () => {
  const research = Schema.decodeUnknownSync(TradeResearchPolicy)({
    requireTemplateMatch: true,
    forbidLaunchInsiders: false,
    insiderWindowBlocks: 100,
    maxTopHoldersBps: null,
    topHolderCount: 10,
  });
  const gated = { ...rule, research };
  expect(
    tradeRuleRefusal({ ...context, rule: gated, research: null })
  ).toContain("trade.research_missing");
  const facts = Schema.decodeUnknownSync(TokenResearchFacts)({
    v: 1,
    network: trade.network,
    address: tokenOut,
    block: "1",
    blockHash: `0x${"1".repeat(64)}`,
    observedAt: context.now,
    launcher: {
      status: "observed",
      launcher: "unknown",
      factory: null,
      deployer: null,
      feeRecipient: null,
      curveOrPool: null,
      poolId: null,
      phase: null,
      registrationBlock: null,
      note: null,
    },
    template: {
      status: "observed",
      matches: true,
      hash: `0x${"2".repeat(64)}`,
      venue: "pons",
      note: null,
    },
    cohort: {
      status: "not_applicable",
      basis: "none",
      launchBlock: null,
      launchTransaction: null,
      windowBlocks: 0,
      sameBlockBuyers: [],
      insiderBuyers: [],
      earlySellers: [],
      buyerCount: 0,
      sellerCount: 0,
      note: null,
    },
    holders: {
      status: "not_applicable",
      basis: "none",
      block: null,
      holdersCounted: 0,
      topHolderCount: 0,
      topShareBps: null,
      denominator: "none",
      denominatorUnits: null,
      exclusions: [],
      supplyReconciled: false,
      coverage: "none",
      transfersRead: 0,
      pageBudget: 0,
      note: null,
    },
    screen: {
      status: "unavailable",
      isHoneypot: null,
      isMintable: null,
      isProxy: null,
      transferPausable: null,
      isBlacklisted: null,
      canTakeBackOwnership: null,
      ownerPercent: null,
      note: null,
    },
    stubbed: false,
  });
  expect(
    tradeRuleRefusal({ ...context, rule: gated, research: facts })
  ).toBeNull();
});
