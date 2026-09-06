import { describe, expect, it } from "bun:test";

import { MONEY_TOOLS, storyOf } from "./tool-stories";

describe("storyOf", () => {
  it("names the top-up with its amount", () => {
    expect(storyOf("wallet_topup").sentence({ amountUsd: 1 })).toBe(
      "Topped up the pocket with 1 USDC"
    );
    expect(storyOf("wallet_topup").tone).toBe("money");
  });

  it("shortens the address a send was aimed at", () => {
    expect(
      storyOf("wallet_send").sentence({
        amountUsd: 0.5,
        to: "0x000000000000000000000000000000000000dEaD",
      })
    ).toBe("Tried to send 0.5 USDC to 0x0000…dEaD");
  });

  it("reads a tool it has never met from its name", () => {
    const story = storyOf("ledger_export");
    expect(story.sentence({})).toBe("Ran ledger export");
    expect(story.tone).toBe("plain");
  });

  it("counts the four tools that can end in a payment as money", () => {
    expect([...MONEY_TOOLS].toSorted()).toEqual([
      "graph_query",
      "wallet_send",
      "wallet_topup",
      "x402_fetch",
    ]);
  });
});
