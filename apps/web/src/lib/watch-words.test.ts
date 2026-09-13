import { describe, expect, it } from "bun:test";

import {
  EvmAddress,
  OnchainAlertRuleId,
  WalletActivityId,
  WalletMonitorId,
  WatchlistItemId,
} from "@froggy/domain";
import type {
  AddressPresence,
  WalletActivity,
  WalletMonitor,
  WatchlistItem,
} from "@froggy/domain";
import { Schema } from "effect";

import {
  amountWords,
  balanceWords,
  eventSentence,
  pageSentence,
  ruleWords,
  timeWords,
  watchStanding,
  windowLeft,
} from "./watch-words";

const NOW = Date.parse("2026-09-13T16:00:00Z");
const HOUR = 3_600_000;
const SUFFIX = "01j5x1y2z3a4b5c6d7e8f9g0h1";
const address = Schema.decodeUnknownSync(EvmAddress)(
  "0x8cc232c9eb25b4b20ee448106858e3b6281708c2"
);
const counterparty = Schema.decodeUnknownSync(EvmAddress)(
  "0x0cf84f01c311dc09f7f6a3b4c5d6e7f8091a67f6"
);
const itemId = Schema.decodeUnknownSync(WatchlistItemId)(`wli_${SUFFIX}`);
const monitorId = Schema.decodeUnknownSync(WalletMonitorId)(`wmon_${SUFFIX}`);
const activityId = Schema.decodeUnknownSync(WalletActivityId)(`wact_${SUFFIX}`);
const ruleId = Schema.decodeUnknownSync(OnchainAlertRuleId)(`oar_${SUFFIX}`);

const item = (patch: Partial<WatchlistItem> = {}): WatchlistItem => ({
  v: 1,
  id: itemId,
  title: "Base contract 0x8Cc2…08C2 activity",
  notes: "",
  source: { _tag: "wallet", address },
  createdAt: NOW - HOUR,
  updatedAt: NOW - HOUR,
  revision: 1,
  archived: false,
  ...patch,
});

const monitor = (patch: Partial<WalletMonitor> = {}): WalletMonitor => ({
  v: 1,
  id: monitorId,
  revision: 1,
  enabled: true,
  startedAt: NOW - 3 * HOUR,
  expiresAt: NOW + 21 * HOUR,
  startBlock: 100,
  telegram: true,
  swaps: true,
  transfers: true,
  networks: [{ network: "eip155:8453", startBlock: 100 }],
  ...patch,
});

const presence = (patch: Partial<AddressPresence> = {}): AddressPresence => ({
  network: "eip155:8453",
  status: "observed",
  kind: "eoa",
  block: "0x1",
  nativeBalance: "22110811026312163",
  usdc: { asset: address, decimals: 6, units: "15303610" },
  token: null,
  observedAt: NOW,
  stubbed: false,
  note: null,
  ...patch,
});

const activity = (patch: Partial<WalletActivity> = {}): WalletActivity => ({
  v: 1,
  id: activityId,
  itemId,
  monitorId,
  monitorRevision: 1,
  network: "eip155:8453",
  wallet: address,
  transactionHash: null,
  blockHash: `0x${"a".repeat(64)}`,
  blockNumber: 1,
  blockTime: NOW,
  observedAt: NOW,
  kind: "transfer",
  flows: [],
  venues: [],
  finality: "finalized",
  delivery: "delivered",
  telegramMessageId: null,
  complete: true,
  stubbed: false,
  ...patch,
});

describe("amountWords", () => {
  it("rounds stablecoins to cents and small figures to three significant digits", () => {
    expect(amountWords("15303610", 6, "USDC")).toBe("15.30 USDC");
    expect(amountWords("22110811026312163", 18, "ETH")).toBe("0.0221 ETH");
    expect(amountWords("1204500000", 6, "PEPE")).toBe("1,204.5 PEPE");
    expect(amountWords("0", 18, "ETH")).toBe("0 ETH");
    expect(amountWords("42", null, null)).toBe("42 raw units");
  });
});

describe("watchStanding", () => {
  it("says what a live watch is doing, where, until when, and where alerts go", () => {
    const standing = watchStanding(item({ walletMonitor: monitor() }), {
      now: NOW,
    });
    expect(standing.state).toBe("watching");
    expect(standing.words).toMatch(
      /^Watching transfers and swaps on Base · until .+ · Telegram on$/u
    );
  });

  it("reads a paused, an ended, and a never-watched item differently", () => {
    expect(
      watchStanding(item({ walletMonitor: monitor({ enabled: false }) }), {
        now: NOW,
      })
    ).toMatchObject({ state: "paused" });
    const ended = watchStanding(
      item({ walletMonitor: monitor({ expiresAt: NOW - 2 * HOUR }) }),
      { now: NOW }
    );
    expect(ended.state).toBe("ended");
    expect(ended.words).toContain("2 h ago");
    expect(watchStanding(item(), { now: NOW })).toEqual({
      state: "saved",
      words: null,
    });
  });

  it("puts what needs the person before everything else", () => {
    expect(
      watchStanding(item({ walletMonitor: monitor() }), {
        now: NOW,
        attention: "Telegram was disconnected",
      })
    ).toEqual({
      state: "needs_you",
      words: "Needs you · Telegram was disconnected",
    });
    expect(
      watchStanding(item({ archived: true, walletMonitor: monitor() }), {
        now: NOW,
      })
    ).toEqual({ state: "archived", words: null });
  });
});

describe("ruleWords", () => {
  it("turns saved conditions into a phrase", () => {
    expect(
      ruleWords(
        monitor({
          rules: [
            {
              id: ruleId,
              condition: {
                _tag: "transfer",
                direction: "received",
                token: null,
              },
              source: null,
              latest: null,
              triggeredBlock: null,
            },
            {
              id: ruleId,
              condition: {
                _tag: "price",
                comparison: "below",
                threshold: "0.01",
                quoteCurrency: "USDC",
              },
              source: null,
              latest: null,
              triggeredBlock: null,
            },
          ],
        })
      )
    ).toBe("receives and a price below 0.01 USDC");
    expect(ruleWords(monitor({ swaps: false }))).toBe("transfers");
  });
});

describe("balanceWords", () => {
  it("rounds the balances and names the chain", () => {
    expect(
      balanceWords([
        presence(),
        presence({
          network: "eip155:1",
          status: "absent",
          kind: null,
          nativeBalance: null,
          usdc: null,
        }),
      ])
    ).toBe("0.0221 ETH · 15.30 USDC on Base");
    expect(balanceWords([])).toBeNull();
  });
});

describe("eventSentence", () => {
  it("names the amount and the counterparty", () => {
    expect(
      eventSentence(
        activity({
          flows: [
            {
              asset: address,
              amount: "15303610",
              direction: "received",
              counterparty,
              symbol: "USDC",
              decimals: 6,
            },
          ],
        })
      )
    ).toBe("Received 15.30 USDC from 0x0cf8…67f6");
  });
  it("reads a swap as one sentence", () => {
    expect(
      eventSentence(
        activity({
          kind: "swap",
          venues: ["uniswap_v3"],
          flows: [
            {
              asset: "native",
              amount: "500000000000000000",
              direction: "sent",
              counterparty: address,
              swapSide: "sent",
              symbol: "ETH",
              decimals: 18,
            },
            {
              asset: address,
              amount: "1204000000",
              direction: "received",
              counterparty: address,
              swapSide: "received",
              symbol: "USDC",
              decimals: 6,
            },
          ],
        })
      )
    ).toBe("Swapped 0.5 ETH for 1,204.00 USDC on Uniswap v3");
  });
});

describe("pageSentence and windowLeft", () => {
  it("counts what is watching and what is merely saved", () => {
    expect(
      pageSentence(
        [
          item({ walletMonitor: monitor() }),
          item({ source: { _tag: "link", url: "https://example.com" } }),
        ],
        NOW
      )
    ).toBe("1 watching on Base · 1 saved · alerts to Telegram");
    expect(pageSentence([], NOW)).toBe("Nothing saved yet");
  });
  it("measures the window from its start, not from a fixed day", () => {
    expect(windowLeft(monitor(), NOW)).toMatchObject({ percent: 88 });
    expect(windowLeft(monitor({ expiresAt: NOW - HOUR }), NOW).words).toBe(
      "Ended 1 h ago"
    );
    expect(timeWords(NOW - 90_000, NOW)).toBe("2 min ago");
  });
});
