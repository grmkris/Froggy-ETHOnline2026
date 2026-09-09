import { describe, expect, it } from "bun:test";

import { PurchaseId } from "@froggy/domain";

import type { ToolCall } from "./tool-call";
import { summarize } from "./tool-summary";

const call = (name: string, output: string | null): ToolCall => ({
  errorText: null,
  graph: null,
  input: {},
  name,
  output,
  state: output === null ? "input-available" : "output-available",
  toolCallId: "call-1",
});

// Every fixture below is the server's wording, copied verbatim.

describe("summarize graph_query", () => {
  it("lifts the winner and the freshness, and flags a fixture", () => {
    const text =
      "Cheapest USDC borrow: Aave v3 on Base at 3.12% APR ($412M borrowed, QmAbCdEf… block 21000000). Next: Compound v3 on Ethereum 3.40% ($1.2B). 3/4 indexes fresh. Aave v3 (Ethereum) QmXyzAbc…: block 21000001, 12 markets | Spark (Ethereum) QmSpark12…: stale — no reason given\n\n[STUB: recorded fixture, not a live Graph provider. Say so if you cite it.]";
    expect(summarize(call("graph_query", text))).toEqual({
      detail: "3 of 4 indexes fresh",
      headline: "Aave v3 on Base at 3.12% APR",
      outcome: "ok",
      stubbed: true,
    });
  });

  it("prefers the fields when the answer carries them", () => {
    const structured: ToolCall = {
      ...call("graph_query", "Cheapest USDC borrow: ignored prose"),
      graph: {
        deployments: [],
        fresh: 4,
        markets: [
          {
            blockNumber: 21_000_000,
            borrowApr: 3.1234,
            chain: "base",
            deploymentId: "Qm1",
            name: "Aave V3 USDC",
            protocol: "aave-v3",
            supplyApr: 2.5,
            totalBorrowUsd: 412_000_000,
          },
        ],
        stubbed: false,
        symbol: "USDC",
        text: "Cheapest USDC borrow: ignored prose",
        total: 4,
      },
    };
    expect(summarize(structured)).toEqual({
      detail: "4 of 4 indexes fresh",
      headline: "Aave V3 USDC on base at 3.12% APR",
      outcome: "ok",
      stubbed: false,
    });
  });

  it("says when nothing was usable", () => {
    const text =
      "No usable markets. 0/4 indexes fresh. Aave v3 (Base) QmAbCdEf…: stale — behind by 900 blocks";
    expect(summarize(call("graph_query", text))).toMatchObject({
      detail: "0 of 4 indexes fresh",
      headline: "No usable markets",
      outcome: "info",
      stubbed: false,
    });
  });
});

describe("summarize spends", () => {
  it("reads a mandate refusal", () => {
    const text =
      "Refused by policy (payee_not_allowed): 0xdead is not on the list of payees this agent may pay.";
    expect(summarize(call("x402_fetch", text))).toMatchObject({
      detail: "0xdead is not on the list of payees this agent may pay.",
      headline: "Refused by the mandate",
      outcome: "refused",
    });
  });

  it("reads a refusal made before anything was sent", () => {
    const text =
      "Refused before sending: evil.example is not on the mandate's list of hosts this agent may pay. Nothing was requested. Use x402_probe to see what it costs; only the person can add it to the directory.";
    expect(summarize(call("x402_fetch", text))).toMatchObject({
      headline: "Refused before anything was sent",
      outcome: "refused",
    });
  });

  it("reads an ask that ended without an allow", () => {
    const text =
      "This spend is over the automatic limit and needs the human: Pay $1.50 to the oracle for a lending snapshot?";
    expect(summarize(call("wallet_send", text))).toMatchObject({
      detail: "Pay $1.50 to the oracle for a lending snapshot?",
      headline: "Over the automatic limit, so it asked you",
      outcome: "asked",
    });
  });

  it("credits the signer with its refusal, and drops the note to the model", () => {
    const text =
      "Allowed by the mandate, but not paid: Privy refused the transaction under policy rk6qw974uapbesb04u5tq5kb: RPC request denied due to policy violation. Stop here; do not look for another route.";
    expect(summarize(call("wallet_send", text))).toEqual({
      detail:
        "Privy refused the transaction under policy rk6qw974uapbesb04u5tq5kb: RPC request denied due to policy violation",
      headline: "Allowed by the mandate, refused by the signer",
      outcome: "refused",
      stubbed: false,
    });
  });
});

describe("summarize x402_fetch", () => {
  it("says a payment went through and never repeats the one-time link", () => {
    const text =
      "Cheapest USDC borrow: Aave v3 on Base at 3.12% APR.\n\n[Paid. The unlocked page for the person is https://app.example/unlocked/abc123 — open it with browser_navigate so they see it in the shared browser. It opens once.]";
    const result = summarize(call("x402_fetch", text));
    expect(result).toMatchObject({
      detail: null,
      headline: "Paid. The unlocked page went to the shared browser",
      outcome: "ok",
    });
    expect(result?.headline).not.toContain("http");
  });

  it("says when the page never asked to be paid", () => {
    expect(
      summarize(call("x402_fetch", "<!doctype html><html>hello</html>"))
    ).toMatchObject({
      headline: "Answered without asking to be paid",
      outcome: "info",
    });
  });
});

describe("summarize wallet tools", () => {
  it("reads a sent transfer", () => {
    const text =
      "Sent 0.5 USDC to 0x000000000000000000000000000000000000dEaD on Base Sepolia. Transaction 0xfeedbeef.";
    expect(summarize(call("wallet_send", text))).toMatchObject({
      headline: "Sent 0.5 USDC on Base Sepolia",
      outcome: "ok",
    });
  });

  it("reads the wallet's JSON into money words", () => {
    const text = JSON.stringify(
      {
        address: "0xabc",
        rules: [],
        totalUsdMicros: 250_000,
        windowSpentUsdMicros: 4000,
      },
      null,
      2
    );
    expect(summarize(call("wallet_status", text))).toMatchObject({
      detail: "Balance $0.25",
      headline: "$0.0040 spent in this window",
      outcome: "info",
    });
  });

  it("gives up quietly on JSON it does not recognise", () => {
    expect(summarize(call("wallet_status", "{not json"))).toBeNull();
    expect(summarize(call("wallet_status", '{"other":1}'))).toBeNull();
  });
});

describe("summarize the rest", () => {
  it("has nothing to add to a page snapshot, or before an answer", () => {
    expect(
      summarize(call("browser_snapshot", "- document\n  - heading"))
    ).toBeNull();
    expect(summarize(call("x402_fetch", null))).toBeNull();
  });

  it("reads a browser refusal", () => {
    const text =
      "Refused: the address is private. The browser opens public http(s) pages only.";
    expect(summarize(call("browser_navigate", text))).toMatchObject({
      headline: "Refused before anything was sent",
      outcome: "refused",
    });
  });

  it("reads a stale click as a refusal", () => {
    const text =
      "@e12 is not in the current snapshot. Take a fresh snapshot and use a ref from it.";
    expect(summarize(call("browser_click", text))?.outcome).toBe("refused");
  });
});

const purchase = (
  state: "none" | "settled" | "uncertain",
  status: "declined" | "completed" | "uncertain",
  delivery: "pending" | "delivered" | "failed"
): string =>
  JSON.stringify({
    v: 1,
    id: PurchaseId.generate(),
    status,
    payment: { state },
    delivery: { state: delivery },
    error: null,
    stubbed: true,
  });

describe("URL purchase summaries", () => {
  it("distinguishes a simulated payment with a delivered result", () => {
    expect(
      summarize(
        call("x402_fetch", purchase("settled", "completed", "delivered"))
      )
    ).toMatchObject({
      headline: "Simulated payment · result delivered",
      detail: "The saved response is in Services.",
      stubbed: true,
    });
  });

  it("never calls an uncertain sent payment free", () => {
    expect(
      summarize(
        call("x402_fetch", purchase("uncertain", "uncertain", "failed"))
      )
    ).toMatchObject({
      headline: "Payment uncertain",
      detail: "Check the saved purchase in Services before buying again.",
    });
  });

  it("reports a declined purchase", () => {
    expect(
      summarize(call("x402_fetch", purchase("none", "declined", "pending")))
    ).toMatchObject({
      headline: "Purchase declined",
      outcome: "refused",
    });
  });

  it("recognizes coordinator refusals without claiming a response was delivered", () => {
    expect(
      summarize(call("x402_fetch", "Purchase refused: The request is blocked."))
    ).toMatchObject({
      headline: "Purchase refused",
      detail: "The request is blocked.",
      outcome: "refused",
    });
  });
});
