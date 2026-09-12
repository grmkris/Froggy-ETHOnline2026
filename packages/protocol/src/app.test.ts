import { describe, expect, it } from "bun:test";

import { usdMicros } from "@froggy/domain";

import { decodeAppServerMessage, encodeAppServerMessage } from "./app";

const card = {
  amountLabel: "$1.50",
  detail: "a snapshot. Over the automatic limit, so it is your call.",
  expiresAt: 1_800_000_000_000,
  id: "apr_01hexampleexampleexampleex",
  options: [
    { id: "allow_once", kind: "allow_once" as const, label: "Allow once" },
  ],
  payeeLabel: "the oracle",
  purpose: "a snapshot",
  title: "Approve $1.50 to the oracle?",
};

describe("approval.request decoding", () => {
  it("still accepts a card written before breakdown existed", () => {
    const decoded = decodeAppServerMessage(
      JSON.stringify({
        request: card,
        type: "approval.request",
        v: 1,
      })
    );
    expect(decoded._tag).toBe("Success");
    if (decoded._tag !== "Success") {
      return;
    }
    expect(decoded.success.type).toBe("approval.request");
    if (decoded.success.type !== "approval.request") {
      return;
    }
    expect(decoded.success.request).toEqual(card);
    expect("breakdown" in decoded.success.request).toBe(false);
  });

  it("round-trips a four-line ledger and keeps v", () => {
    const request = {
      ...card,
      breakdown: [
        {
          amountLabel: "$1.35",
          amountUsdMicros: usdMicros(1_350_000),
          label: "Product",
          note: "Buying a service is what the agent is for, under your cap.",
        },
        { amountLabel: "paid by facilitator", label: "Network fee" },
        {
          amountLabel: "$0.02",
          amountUsdMicros: usdMicros(20_000),
          label: "Fees",
        },
        {
          amountLabel: "$0.12",
          amountUsdMicros: usdMicros(120_000),
          label: "Agent spend so far today",
        },
      ],
    };
    const decoded = decodeAppServerMessage(
      encodeAppServerMessage({
        request,
        type: "approval.request",
        v: 1,
      })
    );
    expect(decoded._tag).toBe("Success");
    if (
      decoded._tag !== "Success" ||
      decoded.success.type !== "approval.request"
    ) {
      return;
    }
    expect(decoded.success.v).toBe(1);
    expect(decoded.success.request.breakdown).toEqual(request.breakdown);
  });

  it("refuses a ledger longer than six lines", () => {
    const decoded = decodeAppServerMessage(
      JSON.stringify({
        request: {
          ...card,
          breakdown: Array.from({ length: 7 }, (_, index) => ({
            amountLabel: "$0.01",
            label: `Line ${String(index + 1)}`,
          })),
        },
        type: "approval.request",
        v: 1,
      })
    );
    expect(decoded._tag).toBe("Failure");
  });

  it("refuses a line with neither amount", () => {
    const decoded = decodeAppServerMessage(
      JSON.stringify({
        request: {
          ...card,
          breakdown: [{ label: "Product" }],
        },
        type: "approval.request",
        v: 1,
      })
    );
    expect(decoded._tag).toBe("Failure");
  });
});
