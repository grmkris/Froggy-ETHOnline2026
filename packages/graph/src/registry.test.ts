/**
 * The freshness gate.
 *
 * These are the tests that make "fails closed" true rather than intended. The
 * agent spends money on the strength of these numbers, and a borrow rate from
 * an index that stopped six weeks ago is indistinguishable from a fresh one
 * once it is a float in a sentence — so the refusal has to happen here, and it
 * has to be provable.
 */

import { afterEach, describe, expect, it } from "bun:test";

import { liveGraphClient } from "./client";
import { MAX_INDEX_LAG_MS } from "./registry";
import type { Deployment } from "./registry";

const NOW = 1_788_000_000_000;
const SECOND = 1000;

const AAVE: Deployment = {
  chain: "ethereum",
  id: "aaaa1111",
  ipfsHash: "QmAave",
  label: "Aave v3",
};
const SPARK: Deployment = {
  chain: "ethereum",
  id: "bbbb2222",
  ipfsHash: "QmSpark",
  label: "Spark",
};

const market = (name: string, borrowApr: string) => ({
  inputToken: { symbol: "USDC" },
  name,
  rates: [{ rate: borrowApr, side: "BORROWER", type: "VARIABLE" }],
  totalBorrowBalanceUSD: "1000000",
  totalDepositBalanceUSD: "2000000",
});

const answer = (input: {
  readonly blockNumber: number;
  readonly markets: readonly ReturnType<typeof market>[];
  readonly timestampMs: number;
  /** What `_meta.deployment` says served the query; absent on old nodes. */
  readonly servedBy?: string;
}): Response => {
  const block = {
    number: input.blockNumber,
    timestamp: Math.floor(input.timestampMs / SECOND),
  };
  // The field is absent, not null, on a node that does not report it.
  const meta =
    input.servedBy === undefined
      ? { block }
      : { block, deployment: input.servedBy };
  return Response.json({ data: { _meta: meta, markets: input.markets } });
};

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Routes by deployment hash in the URL, so each index can behave differently. */
const routeByDeployment = (
  routes: Record<string, () => Response | Promise<Response>>
): void => {
  const stub = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const route = Object.entries(routes).find(([id]) => url.includes(id));
    if (route === undefined) {
      throw new Error(`unexpected fetch: ${url}`);
    }
    return await route[1]();
  };
  // SAFETY: the client calls `fetch(url, init)` and nothing else, so this stub
  // covers the whole surface it uses. The assertion is here rather than a full
  // reimplementation of `fetch`'s overload set; an unrouted call throws above.
  globalThis.fetch = stub as typeof globalThis.fetch;
};

const client = () =>
  liveGraphClient({
    apiKey: "test-key",
    deployments: [AAVE, SPARK],
    now: () => NOW,
  });

describe("the registry's freshness gate", () => {
  it("uses a fresh index and says which block it read", async () => {
    routeByDeployment({
      [AAVE.ipfsHash]: () =>
        answer({
          blockNumber: 21_000_000,
          markets: [market("Aave V3 USDC", "5.0")],
          timestampMs: NOW - 60_000,
        }),
      [SPARK.ipfsHash]: () =>
        answer({
          blockNumber: 21_000_001,
          markets: [market("Spark USDC", "4.0")],
          timestampMs: NOW - 60_000,
        }),
    });

    const snapshot = await client().lendingMarkets("USDC");

    expect(snapshot.markets).toHaveLength(2);
    expect(snapshot.markets[0]?.borrowApr).toBe(4);
    expect(snapshot.markets[0]?.deploymentId).toBe(SPARK.id);
    expect(snapshot.markets[0]?.blockNumber).toBe(21_000_001);
    expect(snapshot.deployments.every((d) => d.status === "fresh")).toBe(true);
  });

  it("drops a stale index's markets entirely", async () => {
    routeByDeployment({
      [AAVE.ipfsHash]: () =>
        answer({
          blockNumber: 20_000_000,
          // Cheaper, and six weeks old. Exactly the number that would win the
          // comparison while being worthless.
          markets: [market("Aave V3 USDC", "0.5")],
          timestampMs: NOW - MAX_INDEX_LAG_MS - 60_000,
        }),
      [SPARK.ipfsHash]: () =>
        answer({
          blockNumber: 21_000_001,
          markets: [market("Spark USDC", "4.0")],
          timestampMs: NOW - 60_000,
        }),
    });

    const snapshot = await client().lendingMarkets("USDC");

    expect(snapshot.markets).toHaveLength(1);
    expect(snapshot.markets[0]?.deploymentId).toBe(SPARK.id);
    const aave = snapshot.deployments.find((d) => d.id === AAVE.id);
    expect(aave?.status).toBe("stale");
    expect(aave?.note).toContain("behind");
  });

  it("refuses an index that will not say how fresh it is", async () => {
    routeByDeployment({
      [AAVE.ipfsHash]: () =>
        Response.json({
          data: {
            _meta: { block: { number: 21_000_000, timestamp: null } },
            markets: [market("Aave V3 USDC", "0.5")],
          },
        }),
      [SPARK.ipfsHash]: () =>
        answer({
          blockNumber: 21_000_001,
          markets: [market("Spark USDC", "4.0")],
          timestampMs: NOW - 60_000,
        }),
    });

    const snapshot = await client().lendingMarkets("USDC");

    // "I cannot tell you how fresh I am" is not the same as "I am fresh", and
    // treating it as such is the failure this gate exists to prevent.
    expect(snapshot.markets).toHaveLength(1);
    expect(snapshot.deployments.find((d) => d.id === AAVE.id)?.status).toBe(
      "stale"
    );
  });

  it("survives one index being down", async () => {
    routeByDeployment({
      [AAVE.ipfsHash]: () => {
        throw new Error("connect ECONNREFUSED");
      },
      [SPARK.ipfsHash]: () =>
        answer({
          blockNumber: 21_000_001,
          markets: [market("Spark USDC", "4.0")],
          timestampMs: NOW - 60_000,
        }),
    });

    const snapshot = await client().lendingMarkets("USDC");

    // The whole argument for a registry is that it degrades rather than fails.
    expect(snapshot.markets).toHaveLength(1);
    expect(snapshot.deployments.find((d) => d.id === AAVE.id)?.status).toBe(
      "unavailable"
    );
  });

  it("reports a gateway error against the deployment that caused it", async () => {
    routeByDeployment({
      [AAVE.ipfsHash]: () => new Response("nope", { status: 502 }),
      [SPARK.ipfsHash]: () =>
        answer({
          blockNumber: 21_000_001,
          markets: [market("Spark USDC", "4.0")],
          timestampMs: NOW - 60_000,
        }),
    });

    const snapshot = await client().lendingMarkets("USDC");

    expect(snapshot.deployments.find((d) => d.id === AAVE.id)?.note).toContain(
      "502"
    );
  });

  it("returns no markets at all when nothing is trustworthy", async () => {
    const stale = () =>
      answer({
        blockNumber: 1,
        markets: [market("Ancient USDC", "0.1")],
        timestampMs: NOW - MAX_INDEX_LAG_MS * 10,
      });
    routeByDeployment({ [AAVE.ipfsHash]: stale, [SPARK.ipfsHash]: stale });

    const snapshot = await client().lendingMarkets("USDC");

    // Failing closed: no answer beats a confident wrong one when the next
    // step is spending money.
    expect(snapshot.markets).toEqual([]);
    expect(snapshot.deployments.every((d) => d.status === "stale")).toBe(true);
  });

  it("asks the gateway for the pinned hash and carries it onto every reading", async () => {
    const asked: string[] = [];
    routeByDeployment({
      [AAVE.ipfsHash]: () => {
        asked.push(AAVE.ipfsHash);
        return answer({
          blockNumber: 21_000_000,
          markets: [market("Aave V3 USDC", "5.0")],
          servedBy: AAVE.ipfsHash,
          timestampMs: NOW - 60_000,
        });
      },
      [SPARK.ipfsHash]: () => {
        asked.push(SPARK.ipfsHash);
        return answer({
          blockNumber: 21_000_001,
          markets: [],
          servedBy: SPARK.ipfsHash,
          timestampMs: NOW - 60_000,
        });
      },
    });

    const snapshot = await client().lendingMarkets("USDC");

    expect(asked.toSorted()).toEqual(
      [AAVE.ipfsHash, SPARK.ipfsHash].toSorted()
    );
    expect(snapshot.deployments.map((d) => d.ipfsHash)).toEqual([
      AAVE.ipfsHash,
      SPARK.ipfsHash,
    ]);
    expect(snapshot.markets[0]?.ipfsHash).toBe(AAVE.ipfsHash);
  });

  it("refuses an answer the gateway served from a different artefact", async () => {
    // The receipt will say "read from QmAave". If the gateway routed the
    // query to another version, that sentence would be false; the numbers are
    // dropped rather than cited under the wrong hash.
    routeByDeployment({
      [AAVE.ipfsHash]: () =>
        answer({
          blockNumber: 21_000_000,
          markets: [market("Aave V3 USDC", "5.0")],
          servedBy: "QmSomethingElse",
          timestampMs: NOW - 60_000,
        }),
      [SPARK.ipfsHash]: () =>
        answer({
          blockNumber: 21_000_001,
          markets: [market("Spark USDC", "4.0")],
          servedBy: SPARK.ipfsHash,
          timestampMs: NOW - 60_000,
        }),
    });

    const snapshot = await client().lendingMarkets("USDC");

    const aave = snapshot.deployments.find((d) => d.id === AAVE.id);
    expect(aave?.status).toBe("unavailable");
    expect(aave?.note).toContain("QmSomethingElse");
    expect(snapshot.markets.map((m) => m.name)).toEqual(["Spark USDC"]);
  });
});
