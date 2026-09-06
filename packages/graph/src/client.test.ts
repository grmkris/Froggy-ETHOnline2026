import { describe, expect, it } from "bun:test";

import {
  describeBestSupply,
  describeCheapestBorrow,
  liveGraphClient,
  snapshotHash,
  stubGraphClient,
  x402Transport,
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

    expect(describeCheapestBorrow(snapshot)).toContain("No usable markets");
  });

  it("cites the deployment and block behind the number", async () => {
    const snapshot = await stubGraphClient().lendingMarkets("USDC");

    // The provenance is the claim the Graph tracks are judged on. An answer
    // that does not say which index it came from is not checkable.
    expect(describeCheapestBorrow(snapshot)).toMatch(/block \d+/u);
    expect(describeCheapestBorrow(snapshot)).toContain("indexes fresh");
  });
});

describe("the live client's transport", () => {
  it("names the provider on the snapshot and asks it for every deployment", async () => {
    const asked: string[] = [];
    const client = liveGraphClient({
      apiKey: "",
      deployments: [
        { chain: "ethereum", id: "DEP1", label: "Aave v3" },
        { chain: "base", id: "DEP2", label: "Aave v3" },
      ],
      gatewayUrl: "https://gateway.test/api",
      now: () => 1_700_000_000_000,
      transport: x402Transport(async (url) => {
        asked.push(url);
        await Promise.resolve();
        return Response.json({
          data: {
            _meta: { block: { number: 100, timestamp: 1_700_000_000 } },
            markets: [],
          },
        });
      }),
    });
    const snapshot = await client.lendingMarkets("USDC");
    expect(asked).toEqual([
      "https://gateway.test/api/x402/subgraphs/id/DEP1",
      "https://gateway.test/api/x402/subgraphs/id/DEP2",
    ]);
    expect(snapshot.source).toBe("https://gateway.test/api via x402");
    expect(snapshot.deployments.map((d) => d.status)).toEqual([
      "fresh",
      "fresh",
    ]);
  });
});

describe("describeBestSupply", () => {
  it("leads with the highest supply rate, and never with a market nobody supplies", async () => {
    const snapshot = await stubGraphClient().lendingMarkets("USDC");
    const answer = describeBestSupply(snapshot);
    const [top] = [...snapshot.markets]
      .filter((m) => m.totalSupplyUsd > 0)
      .toSorted((a, b) => b.supplyApr - a.supplyApr);
    expect(top).toBeDefined();
    expect(answer).toContain(`Best USDC supply: ${top?.name ?? ""}`);
    expect(answer).toContain(`${top?.supplyApr.toFixed(2) ?? ""}% APR`);
  });

  it("says so plainly when nothing matched", async () => {
    const snapshot = await stubGraphClient().lendingMarkets("WBTC");
    expect(describeBestSupply(snapshot)).toBe("No usable supply markets.");
  });
});
