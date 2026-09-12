import { describe, expect, it } from "bun:test";

import { Schema } from "effect";

import {
  RESEARCH_FRESHNESS_MS,
  TokenResearchFacts,
  TradeResearchPolicy,
  emptyTokenResearchFacts,
  tradeResearchRefusal,
} from "./token-research";

const address = `0x${"a".repeat(40)}`;
const wallet = `0x${"b".repeat(40)}`;
const now = 1_000_000;

const policy = Schema.decodeUnknownSync(TradeResearchPolicy)({
  requireTemplateMatch: true,
  forbidLaunchInsiders: true,
  insiderWindowBlocks: 600,
  maxTopHoldersBps: 4000,
  topHolderCount: 10,
});

const observedFacts = (): TokenResearchFacts =>
  Schema.decodeUnknownSync(TokenResearchFacts)({
    v: 1,
    network: "eip155:4663",
    address,
    block: "1000",
    blockHash: `0x${"c".repeat(64)}`,
    observedAt: now,
    launcher: {
      status: "observed",
      launcher: "pons",
      factory: wallet,
      deployer: wallet,
      feeRecipient: wallet,
      curveOrPool: address,
      phase: "curve",
      registrationBlock: "900",
      note: null,
    },
    template: {
      status: "observed",
      matches: true,
      hash: `0x${"d".repeat(64)}`,
      venue: "pons",
      note: null,
    },
    cohort: {
      status: "observed",
      basis: "venue_events",
      launchBlock: "900",
      launchTransaction: `0x${"e".repeat(64)}`,
      windowBlocks: 600,
      sameBlockBuyers: [],
      insiderBuyers: [],
      earlySellers: [],
      buyerCount: 3,
      sellerCount: 0,
      note: null,
    },
    holders: {
      status: "observed",
      basis: "reconstructed",
      block: "1000",
      holdersCounted: 40,
      topHolderCount: 10,
      topShareBps: 2500,
      denominator: "sellable",
      denominatorUnits: "1000000",
      exclusions: [wallet],
      supplyReconciled: true,
      coverage: "complete",
      transfersRead: 200,
      pageBudget: 20,
      note: null,
    },
    screen: {
      status: "observed",
      isHoneypot: false,
      isMintable: false,
      isProxy: false,
      transferPausable: false,
      isBlacklisted: false,
      canTakeBackOwnership: false,
      ownerPercent: 0,
      note: null,
    },
    stubbed: false,
  });

describe("tradeResearchRefusal", () => {
  it("fails closed when facts are missing, stubbed or stale", () => {
    expect(tradeResearchRefusal({ policy, facts: null, now })).toContain(
      "trade.research_missing"
    );
    expect(
      tradeResearchRefusal({
        policy,
        facts: { ...observedFacts(), stubbed: true },
        now,
      })
    ).toContain("trade.research_missing");
    expect(
      tradeResearchRefusal({
        policy,
        facts: {
          ...observedFacts(),
          observedAt: now - RESEARCH_FRESHNESS_MS - 1,
        },
        now,
      })
    ).toContain("trade.research_stale");
  });

  it("refuses a template mismatch and an unobserved template", () => {
    const facts = observedFacts();
    expect(
      tradeResearchRefusal({
        policy,
        facts: {
          ...facts,
          template: { ...facts.template, matches: false },
        },
        now,
      })
    ).toContain("trade.research_template");
    expect(
      tradeResearchRefusal({
        policy,
        facts: {
          ...facts,
          template: {
            ...facts.template,
            status: "not_indexed",
            matches: null,
          },
        },
        now,
      })
    ).toContain("trade.research_template");
  });

  it("refuses launch insiders and the wrong cohort basis", () => {
    const facts = observedFacts();
    expect(
      tradeResearchRefusal({
        policy,
        facts: {
          ...facts,
          cohort: { ...facts.cohort, insiderBuyers: [wallet] },
        },
        now,
      })
    ).toContain("trade.research_insiders");
    expect(
      tradeResearchRefusal({
        policy,
        facts: {
          ...facts,
          cohort: { ...facts.cohort, basis: "first_mint_transfers" },
        },
        now,
      })
    ).toContain("trade.research_basis");
  });

  it("refuses concentration that is indexed, unreconciled, partial or too high", () => {
    const facts = observedFacts();
    expect(
      tradeResearchRefusal({
        policy,
        facts: {
          ...facts,
          holders: { ...facts.holders, basis: "indexed" },
        },
        now,
      })
    ).toContain("trade.research_basis");
    expect(
      tradeResearchRefusal({
        policy,
        facts: {
          ...facts,
          holders: { ...facts.holders, supplyReconciled: false },
        },
        now,
      })
    ).toContain("trade.research_unreconciled");
    expect(
      tradeResearchRefusal({
        policy,
        facts: {
          ...facts,
          holders: { ...facts.holders, coverage: "partial" },
        },
        now,
      })
    ).toContain("trade.research_concentration");
    expect(
      tradeResearchRefusal({
        policy,
        facts: {
          ...facts,
          holders: { ...facts.holders, topShareBps: 4001 },
        },
        now,
      })
    ).toContain("trade.research_concentration");
  });

  it("allows a complete own-RPC observation that satisfies every predicate", () => {
    expect(
      tradeResearchRefusal({ policy, facts: observedFacts(), now })
    ).toBeNull();
  });

  it("skips concentration when the policy leaves it unset", () => {
    const light = Schema.decodeUnknownSync(TradeResearchPolicy)({
      requireTemplateMatch: true,
      forbidLaunchInsiders: false,
      insiderWindowBlocks: 100,
      maxTopHoldersBps: null,
      topHolderCount: 10,
    });
    const facts = observedFacts();
    expect(
      tradeResearchRefusal({
        policy: light,
        facts: {
          ...facts,
          holders: {
            ...facts.holders,
            status: "unavailable",
            topShareBps: null,
            basis: "none",
            coverage: "none",
            supplyReconciled: false,
          },
        },
        now,
      })
    ).toBeNull();
  });
});

it("emptyTokenResearchFacts is loudly unavailable and stub-marked", () => {
  const empty = emptyTokenResearchFacts({
    network: "eip155:4663",
    address: Schema.decodeUnknownSync(TokenResearchFacts.fields.address)(
      address
    ),
    observedAt: now,
    stubbed: true,
    note: "no rpc",
  });
  expect(empty.stubbed).toBe(true);
  expect(empty.launcher.status).toBe("unavailable");
  expect(empty.template.status).toBe("unavailable");
  expect(empty.cohort.status).toBe("unavailable");
  expect(empty.holders.status).toBe("unavailable");
  expect(empty.screen.status).toBe("unavailable");
});
