import { expect, test } from "bun:test";

import { emptyTokenResearchFacts, tradeResearchRefusal } from "@froggy/domain";
import { Redacted, Schema } from "effect";

import { tradeEvmClient } from "./evm-chain";
import { liveTokenResearch } from "./research";

const token = "0x1111111111111111111111111111111111111111";
const Call = Schema.Struct({ id: Schema.Int, method: Schema.String });
test("log failures preserve launcher classification and independent security observations", async () => {
  const fetchImpl: typeof fetch = Object.assign(
    async (_url: RequestInfo | URL, init?: RequestInit) => {
      const call = Schema.decodeUnknownSync(Schema.fromJsonString(Call))(
        init?.body
      );
      const results = new Map<string, Schema.Json>([
        ["eth_chainId", "0x1"],
        [
          "eth_getBlockByNumber",
          {
            number: "0xa",
            hash: `0x${"ab".repeat(32)}`,
            timestamp: "0x1",
            transactions: [],
          },
        ],
      ]);
      const result = results.get(call.method) ?? "0x1";
      return await Promise.resolve(
        call.method === "eth_getLogs"
          ? new Response("oversized", { status: 413 })
          : Response.json({ jsonrpc: "2.0", id: call.id, result })
      );
    },
    { preconnect: (): void => {} }
  );
  const client = tradeEvmClient({
    endpoint: Redacted.make("https://rpc.test/private"),
    outbound: {
      fetch: fetchImpl,
      lookup: async () => await Promise.resolve(["93.184.216.34"]),
    },
  });
  const empty = emptyTokenResearchFacts({
    network: "eip155:1",
    address: token,
    observedAt: 1000,
    stubbed: false,
  });
  const reader = liveTokenResearch({
    clientFor: () => client,
    venuesFor: () => [],
    now: () => 1000,
    goplus: {
      stubbed: false,
      screen: async () =>
        await Promise.resolve({
          ...empty.screen,
          status: "observed",
          isHoneypot: false,
          note: "Screen read succeeded.",
        }),
    },
  });
  const facts = await reader.research({
    network: "eip155:1",
    address: token,
    cohortWindowBlocks: 500,
    holderPageBudget: 5,
  });
  expect(facts.launcher.launcher).toBe("unknown");
  expect(facts.launcher.status).toBe("observed");
  expect(facts.cohort.status).toBe("unavailable");
  expect(facts.cohort.note).toContain("http (413)");
  expect(facts.holders.topShareBps).toBeNull();
  expect(facts.screen.status).toBe("observed");
  expect(
    tradeResearchRefusal({
      policy: {
        requireTemplateMatch: false,
        forbidLaunchInsiders: false,
        insiderWindowBlocks: 500,
        maxTopHoldersBps: 5000,
        topHolderCount: 10,
      },
      facts,
      now: 1000,
    })
  ).not.toBeNull();
});
