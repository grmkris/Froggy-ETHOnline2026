import { describe, expect, it } from "bun:test";

import {
  MarketSearchInput,
  MarketSearchResult,
  TokenInspectInput,
  TokenInspectResult,
} from "@froggy/protocol";
import { Redacted, Schema } from "effect";

import { BIRDEYE_NETWORKS, liveBirdeye, stubBirdeye } from "./birdeye";

// These addresses are synthetic fixtures, never configured as live assets.
const ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const SOL_ADDRESS = "22222222222222222222222222222222222222222222";
const SOL_NETWORK = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const KEY = "test-only-birdeye-secret";
type ProviderFixture = Readonly<
  Record<string, string | number | boolean | null>
>;
const DEFAULT_OVERVIEW = { address: ADDRESS, decimals: 6 };
const overview = (data: ProviderFixture = DEFAULT_OVERVIEW) =>
  Response.json({ success: true, data });
const security = (data: ProviderFixture) =>
  Response.json({ success: true, data });

const fixture = (responses: readonly Response[]) => {
  const requests: {
    url: URL;
    headers: Headers;
    redirect: RequestRedirect | undefined;
  }[] = [];
  const fetchImpl: typeof fetch = Object.assign(
    async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      await Promise.resolve();
      requests.push({
        url: new URL(input instanceof Request ? input.url : String(input)),
        headers: new Headers(init?.headers),
        redirect: init?.redirect,
      });
      const response = responses[requests.length - 1];
      if (!response) {
        throw new Error(`Unexpected request with ${KEY}`);
      }
      return response;
    },
    { preconnect: (): void => undefined }
  );
  return {
    requests,
    adapter: liveBirdeye({
      apiKey: Redacted.make(KEY),
      now: () => 123_000,
      outbound: {
        fetch: fetchImpl,
        lookup: async () => {
          await Promise.resolve();
          return ["8.8.8.8"];
        },
      },
    }),
  };
};

const rejectsWith = async <T>(
  promise: Promise<T>,
  message: string
): Promise<void> => {
  try {
    await promise;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    expect(detail).toContain(message);
    expect(detail).not.toContain(KEY);
    return;
  }
  throw new Error("Expected Birdeye rejection.");
};

describe("Birdeye market reads", () => {
  it("authenticates a bounded, chain-specific search and returns normalized raw amounts", async () => {
    const { adapter, requests } = fixture([
      Response.json({
        success: true,
        data: {
          items: [
            {
              type: "token",
              result: [
                {
                  address: ADDRESS,
                  network: "base",
                  name: "Example",
                  symbol: "EX",
                  decimals: 6,
                  price: 2,
                  liquidity: 10,
                  volume_24h_usd: 25,
                  price_change_24h_percent: -5,
                  last_trade_unix_time: 100,
                },
              ],
            },
          ],
        },
      }),
    ]);
    const result = await adapter.search({
      network: "eip155:8453",
      query: "Example",
      limit: 3,
    });
    expect(result.tokens[0]).toMatchObject({
      address: ADDRESS,
      decimals: 6,
      priceUsd: 2,
      liquidityUsd: 10,
      volume24hUsd: 25,
      lastTradeAt: 100_000,
      priceChange24hPercent: -5,
    });
    expect(result).toMatchObject({
      v: 1,
      stubbed: false,
      observedAt: 123_000,
      cursor: null,
    });
    expect(Schema.is(MarketSearchResult)(result)).toBe(true);
    expect(requests[0]?.url.pathname).toBe("/defi/v3/search");
    expect(requests[0]?.url.searchParams.get("chain")).toBe("base");
    expect(requests[0]?.url.searchParams.get("limit")).toBe("3");
    expect(requests[0]?.url.searchParams.get("target")).toBe("token");
    expect(requests[0]?.url.searchParams.get("ui_amount_mode")).toBe("raw");
    expect(requests[0]?.headers.get("x-api-key")).toBe(KEY);
    expect(requests[0]?.headers.get("x-chain")).toBe("base");
    expect(requests[0]?.redirect).toBe("manual");
  });

  it("uses new listings for null queries and preserves missing values and source time", async () => {
    const { adapter, requests } = fixture([
      Response.json({
        success: true,
        data: {
          items: [
            {
              address: ADDRESS,
              name: null,
              logoURI: null,
              liquidity: null,
              liquidityAddedAt: "2026-09-08T12:30:00",
              source: "uniswap",
            },
          ],
        },
      }),
    ]);
    const result = await adapter.search({
      network: "eip155:8453",
      query: null,
      limit: 10,
    });
    expect(requests[0]?.url.pathname).toBe("/defi/v2/tokens/new_listing");
    expect(result.mode).toBe("new_listings");
    expect(result.tokens[0]).toMatchObject({
      name: null,
      decimals: null,
      priceUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      listedAt: "2026-09-08T12:30:00",
      listingSource: "uniswap",
    });
  });

  it("bounds provider rows and token labels, including surrogate pairs", async () => {
    const { adapter } = fixture([
      Response.json({
        success: true,
        data: {
          items: Array.from({ length: 21 }, () => ({
            address: ADDRESS,
            name: "🐸".repeat(200),
          })),
        },
      }),
    ]);
    const result = await adapter.search({
      network: "eip155:8453",
      query: null,
      limit: 20,
    });
    expect(result.tokens).toHaveLength(20);
    expect(result.truncated).toBe(true);
    expect(result.tokens[0]?.name).toBe("🐸".repeat(60));
    expect(Schema.is(MarketSearchResult)(result)).toBe(true);
  });

  it("rejects unsupported networks and invalid input limits before requesting", async () => {
    const { adapter, requests } = fixture([]);
    await rejectsWith(
      adapter.search({ network: "eip155:84532", query: null, limit: 10 }),
      "does not support"
    );
    await rejectsWith(
      adapter.search({ network: "eip155:8453", query: null, limit: 21 }),
      ""
    );
    expect(
      Schema.is(MarketSearchInput)({
        network: "eip155:8453",
        query: "",
        limit: 1,
      })
    ).toBe(false);
    expect(requests).toHaveLength(0);
    expect(BIRDEYE_NETWORKS).toContain(SOL_NETWORK);
    expect(BIRDEYE_NETWORKS).not.toContain(
      "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
    );
  });

  it("rejects a search result on another network", async () => {
    const { adapter } = fixture([
      Response.json({
        success: true,
        data: {
          items: [
            {
              type: "token",
              result: [{ address: ADDRESS, network: "ethereum" }],
            },
          ],
        },
      }),
    ]);
    await rejectsWith(
      adapter.search({ network: "eip155:8453", query: "EX", limit: 1 }),
      "different network"
    );
  });

  it("ignores the documented market result group in token search", async () => {
    const { adapter } = fixture([
      Response.json({
        success: true,
        data: {
          items: [
            { type: "token", result: [{ address: ADDRESS, network: "base" }] },
            {
              type: "market",
              result: [{ name: "Unrequested market", address: OTHER }],
            },
          ],
        },
      }),
    ]);
    const result = await adapter.search({
      network: "eip155:8453",
      query: "EX",
      limit: 10,
    });
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]?.address).toBe(ADDRESS);
  });

  it("returns an empty page when the provider has no matching tokens", async () => {
    const { adapter } = fixture([
      Response.json({ success: true, data: { items: [] } }),
    ]);
    const result = await adapter.search({
      network: "eip155:8453",
      query: null,
      limit: 1,
    });
    expect(result.tokens).toEqual([]);
  });
});

describe("Birdeye token inspection", () => {
  it("normalizes only explicit EVM flags and keeps tax strings in provider units", async () => {
    const { adapter, requests } = fixture([
      overview(),
      security({
        isHoneypot: "0",
        isMintable: "1",
        isProxy: null,
        cannotBuy: "unknown",
        buyTax: "0.05",
        sellTax: "0",
        isOpenSource: "1",
      }),
    ]);
    const result = await adapter.inspect({
      network: "eip155:8453",
      address: ADDRESS,
    });
    expect(Schema.is(TokenInspectResult)(result)).toBe(true);
    expect(result.security.facts).toContainEqual({
      key: "isHoneypot",
      value: false,
      unit: "boolean",
    });
    expect(result.security.facts).toContainEqual({
      key: "isMintable",
      value: true,
      unit: "boolean",
    });
    expect(result.security.facts).toContainEqual({
      key: "isProxy",
      value: null,
      unit: "boolean",
    });
    expect(result.security.facts).toContainEqual({
      key: "cannotBuy",
      value: null,
      unit: "boolean",
    });
    expect(result.security.facts).toContainEqual({
      key: "buyTax",
      value: "0.05",
      unit: "provider_numeric_string",
    });
    expect(requests[0]?.url.searchParams.get("frames")).toBe("24h");
    expect(requests[1]?.url.pathname).toBe("/defi/token_security");
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("does not request custom overview frames on chains that do not support them", async () => {
    const { adapter, requests } = fixture([overview(), security({})]);
    const result = await adapter.inspect({
      network: "eip155:137",
      address: ADDRESS,
    });
    expect(requests[0]?.url.searchParams.has("frames")).toBe(false);
    expect(result.token.volume24hUsd).toBeNull();
  });

  it("preserves unknown Solana flags and fractional holder concentration", async () => {
    const { adapter } = fixture([
      overview({ address: SOL_ADDRESS, decimals: 9 }),
      security({
        freezeable: null,
        mutableMetadata: true,
        isToken2022: false,
        top10HolderPercent: 0.304,
      }),
    ]);
    const result = await adapter.inspect({
      network: SOL_NETWORK,
      address: SOL_ADDRESS,
    });
    expect(result.security.facts).toContainEqual({
      key: "freezeable",
      value: null,
      unit: "boolean",
    });
    expect(result.security.facts).toContainEqual({
      key: "isToken2022",
      value: false,
      unit: "boolean",
    });
    expect(result.security.facts).toContainEqual({
      key: "top10HolderPercent",
      value: 0.304,
      unit: "supply_share",
    });
  });

  it("rejects missing or mismatched identity before requesting security", async () => {
    await Promise.all(
      [
        { decimals: 6 },
        { address: OTHER },
        { address: ADDRESS, decimals: 6.5 },
      ].map(async (data) => {
        const { adapter, requests } = fixture([overview(data)]);
        await rejectsWith(
          adapter.inspect({ network: "eip155:8453", address: ADDRESS }),
          ""
        );
        expect(requests).toHaveLength(1);
      })
    );
  });

  it("rejects Solana addresses with the wrong decoded byte length before requesting", async () => {
    const { adapter, requests } = fixture([]);
    const input = { network: SOL_NETWORK, address: "z".repeat(44) };
    expect(Schema.is(TokenInspectInput)(input)).toBe(false);
    expect(
      Schema.is(TokenInspectInput)({
        network: SOL_NETWORK,
        address: "2".repeat(32),
      })
    ).toBe(false);
    expect(
      Schema.is(TokenInspectInput)({
        network: SOL_NETWORK,
        address: SOL_ADDRESS,
      })
    ).toBe(true);
    await rejectsWith(adapter.inspect(input), "32 bytes");
    await rejectsWith(stubBirdeye().inspect(input), "32 bytes");
    expect(requests).toHaveLength(0);
  });

  it("rejects a wallet address from the wrong chain family before requesting", async () => {
    const { adapter, requests } = fixture([]);
    await rejectsWith(
      adapter.inspect({ network: SOL_NETWORK, address: ADDRESS }),
      "does not match"
    );
    expect(requests).toHaveLength(0);
  });

  it("reports unavailable security explicitly without replacing it with false flags", async () => {
    const { adapter } = fixture([
      overview(),
      new Response(KEY, { status: 429 }),
    ]);
    const result = await adapter.inspect({
      network: "eip155:8453",
      address: ADDRESS,
    });
    expect(result.security).toEqual({ status: "unavailable", facts: [] });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });
});

describe("Birdeye outbound boundaries", () => {
  it("does not expose provider error bodies, malformed payloads, or transport secrets", async () => {
    await Promise.all(
      [
        [],
        [new Response(KEY, { status: 401 })],
        [Response.json({ success: false, message: KEY })],
        [new Response(KEY)],
        [overview({ address: ADDRESS, name: KEY.repeat(20_000) })],
      ].map(async (responses) => {
        const { adapter } = fixture(responses);
        await rejectsWith(
          adapter.inspect({ network: "eip155:8453", address: ADDRESS }),
          "Birdeye request failed or returned invalid data."
        );
      })
    );
  });

  it("refuses credential-bearing redirects without following them", async () => {
    const { adapter, requests } = fixture([
      new Response(null, {
        status: 302,
        headers: { location: "https://public-api.birdeye.so/other" },
      }),
    ]);
    await rejectsWith(
      adapter.inspect({ network: "eip155:8453", address: ADDRESS }),
      "Birdeye request failed"
    );
    expect(requests).toHaveLength(1);
  });

  it("marks both stub operations and leaves invented market values absent", async () => {
    const adapter = stubBirdeye();
    const searchResult = await adapter.search({
      network: "eip155:8453",
      query: null,
      limit: 5,
    });
    const inspectResult = await adapter.inspect({
      network: "eip155:8453",
      address: ADDRESS,
    });
    expect(searchResult.stubbed).toBe(true);
    expect(inspectResult.stubbed).toBe(true);
    expect(inspectResult.token.priceUsd).toBeNull();
    expect(inspectResult.security.status).toBe("unavailable");
  });
});
