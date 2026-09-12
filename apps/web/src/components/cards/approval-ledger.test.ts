import { describe, expect, it } from "bun:test";

import { usdMicros } from "@froggy/domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ApprovalLedger, ledgerAmount } from "./approval-ledger";

describe("ledgerAmount", () => {
  it("prefers the printed label when both are present", () => {
    expect(
      ledgerAmount({
        amountLabel: "$1.50",
        amountUsdMicros: usdMicros(1_500_000),
        label: "Product",
      })
    ).toBe("$1.50");
  });

  it("formats micros when only those arrived", () => {
    expect(
      ledgerAmount({
        amountUsdMicros: usdMicros(4000),
        label: "Product",
      })
    ).toBe("$0.0040");
  });

  it("returns null rather than inventing a figure", () => {
    expect(ledgerAmount({ label: "Fees" })).toBeNull();
  });
});

describe("ApprovalLedger", () => {
  it("renders labelled amounts as a list", () => {
    const html = renderToStaticMarkup(
      createElement(ApprovalLedger, {
        lines: [
          {
            amountLabel: "$0.0040",
            amountUsdMicros: usdMicros(4000),
            label: "Product",
            note: "Buying a service is what the agent is for, under your cap.",
          },
          {
            amountLabel: "$0.00",
            amountUsdMicros: usdMicros(0),
            label: "Agent spend so far today",
          },
        ],
      })
    );
    expect(html).toContain("<ul");
    expect(html).toContain("Spend breakdown");
    expect(html).toContain("<li");
    expect(html).toContain("Product");
    expect(html).toContain("$0.0040");
    expect(html).toContain("Agent spend so far today");
    expect(html).toContain("$0.00");
    expect(html).toContain("Buying a service is what the agent is for");
    expect(html).toContain("text-machine");
  });

  it("renders nothing when there are no lines, so an old card is unchanged", () => {
    expect(
      renderToStaticMarkup(createElement(ApprovalLedger, { lines: [] }))
    ).toBe("");
  });
});
