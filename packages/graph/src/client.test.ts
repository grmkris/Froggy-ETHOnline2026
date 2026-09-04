import { describe, expect, it } from "bun:test";

import {
  describeCheapestBorrow,
  snapshotHash,
  stubGraphClient,
} from "./client";

describe("the stub Graph client", () => {
  it("returns markets cheapest borrow first", async () => {
    // Sorting lives in the client, not the caller: "cheapest" is the entire
    // question, and a caller that forgot to sort would answer it wrongly while
    // looking correct.
    const snapshot = await stubGraphClient().lendingMarkets("USDC");

    const rates = snapshot.markets.map((market) => market.borrowApr);
    expect(rates).toEqual(rates.toSorted((a, b) => a - b));
  });

  it("marks itself as a fixture", async () => {
    const snapshot = await stubGraphClient().lendingMarkets("USDC");

    expect(snapshot.stubbed).toBe(true);
    expect(snapshot.source).toContain("fixture");
  });

  it("matches the symbol case-insensitively", async () => {
    const snapshot = await stubGraphClient().lendingMarkets("usdc");

    expect(snapshot.markets.length).toBeGreaterThan(0);
  });

  it("returns nothing for a token it has no data for", async () => {
    const snapshot = await stubGraphClient().lendingMarkets("WBTC");

    expect(snapshot.markets).toEqual([]);
  });
});

describe("snapshotHash", () => {
  it("is stable for the same data", async () => {
    const client = stubGraphClient();
    const a = await client.lendingMarkets("USDC");
    const b = await client.lendingMarkets("USDC");

    expect(snapshotHash(a)).toBe(snapshotHash(b));
  });

  it("changes when the data changes", async () => {
    const snapshot = await stubGraphClient().lendingMarkets("USDC");
    const moved = {
      ...snapshot,
      markets: snapshot.markets.map((market) => ({
        ...market,
        borrowApr: market.borrowApr + 1,
      })),
    };

    // This is what makes "the number it acted on" checkable later, and a claim
    // that the evidence was different falsifiable.
    expect(snapshotHash(moved)).not.toBe(snapshotHash(snapshot));
  });
});

describe("describeCheapestBorrow", () => {
  it("leads with the cheapest market and its rate", async () => {
    const snapshot = await stubGraphClient().lendingMarkets("USDC");

    const answer = describeCheapestBorrow(snapshot);

    expect(answer).toContain(snapshot.markets[0]?.name ?? "");
    expect(answer).toMatch(/\d+\.\d{2}% APR/u);
  });

  it("says so plainly when nothing matched", async () => {
    const snapshot = await stubGraphClient().lendingMarkets("NOPE");

    expect(describeCheapestBorrow(snapshot)).toContain("No active markets");
  });
});
