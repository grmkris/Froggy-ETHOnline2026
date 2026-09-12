import { expect, test } from "bun:test";

import { userId } from "@froggy/domain";
import { ConfigProvider, Effect, Redacted } from "effect";

import { loadEnvironment } from "./environment";
import { createResearchData, indexedHolderFact } from "./research-data";

const owner = userId("did:privy:research-test");
const environment = async () =>
  await Effect.runPromise(
    loadEnvironment().pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({})
      )
    )
  );
const fixture = async (key: string | null) => {
  const env = await environment();
  const seen: URL[] = [];
  const fetchImpl: typeof fetch = Object.assign(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const target = new URL(url instanceof Request ? url.url : url);
      seen.push(target);
      if (target.pathname === "/v1/networks") {
        return Response.json({
          networks: [
            {
              id: "base",
              caip2Id: "eip155:8453",
              indexed_to: [
                {
                  category: "balances",
                  block_num: 100,
                  timestamp: Math.floor(Date.now() / 1000),
                },
              ],
            },
          ],
        });
      }
      expect(new Headers(init?.headers).get("X-Api-Key")).toBe(key);
      return await Promise.resolve(Response.json({ data: [{ amount: "10" }] }));
    },
    { preconnect: () => {} }
  );
  return {
    seen,
    data: createResearchData(
      {
        ...env,
        researchMode: "live",
        pinaxApiKey: key === null ? null : Redacted.make(key),
      },
      {
        fetch: fetchImpl,
        lookup: async () => await Promise.resolve(["93.184.216.34"]),
      }
    ),
  };
};
test("missing token credentials remain unavailable, never an empty balance", async () => {
  const { data, seen } = await fixture(null);
  const result = await data.read(owner, {
    operation: "wallet_assets",
    network: "base",
    address: "0x1111111111111111111111111111111111111111",
  });
  expect(result.status).toBe("unavailable");
  expect(result.note).toContain("PINAX_API_KEY");
  expect(seen).toHaveLength(1);
});
test("token swaps use the provider's actual token filter and cache repeated included reads", async () => {
  const { data, seen } = await fixture("test-key");
  const input = {
    operation: "token_swaps",
    network: "eip155:8453",
    address: "0x1111111111111111111111111111111111111111",
  } as const;
  const result = await data.read(owner, input);
  await data.read(owner, input);
  expect(result.status).toBe("observed");
  expect(seen).toHaveLength(2);
  expect(seen[1]?.searchParams.get("input_contract")).toBe(input.address);
  expect(JSON.stringify(result)).not.toContain("test-key");
  await data.read(owner, { ...input, side: "output" });
  expect(seen[2]?.searchParams.get("output_contract")).toBe(input.address);
});
test("indexed holders retain their basis and cannot invent missing concentration", async () => {
  const { data } = await fixture("test-key");
  const result = await data.read(owner, {
    operation: "token_holders",
    network: "base",
    address: "0x1111111111111111111111111111111111111111",
  });
  expect(indexedHolderFact(result, "100", 10).topShareBps).toBe(1000);
  expect(
    indexedHolderFact({ ...result, truncated: true }, "100", 10).topShareBps
  ).toBeNull();
  expect(indexedHolderFact({ ...result, stale: true }, "100", 10).status).toBe(
    "unavailable"
  );
  expect(indexedHolderFact(result, "100", 10).basis).toBe("indexed");
});
test("stubbed research never performs a provider request", async () => {
  const data = createResearchData(await environment(), {
    fetch: Object.assign(
      () => {
        throw new Error("must not fetch");
      },
      { preconnect: () => {} }
    ),
  });
  const result = await data.read(owner, { operation: "perp_markets" });
  expect(result.stubbed).toBe(true);
  expect(result.status).toBe("unavailable");
});
