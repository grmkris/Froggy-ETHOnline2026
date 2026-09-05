/**
 * The Graph, in two implementations behind one interface.
 *
 * The live one fans out across the pinned deployments in `registry.ts`, in
 * parallel, with one query shape. The stub returns a recorded fixture. Which
 * one is running is a property of the snapshot (`stubbed`) rather than a fact
 * only the server knows, because that flag has to survive all the way onto the
 * receipt — a submission whose Graph data was faked and whose UI did not say
 * so would be misrepresenting the one thing the track is judging.
 *
 * The freshness gate is the other load-bearing thing here. Every query asks
 * `_meta { block }` alongside the markets, and a deployment whose head is more
 * than `MAX_INDEX_LAG_MS` behind contributes **nothing**. Failing closed is
 * the only defensible choice when the next step is spending money: a borrow
 * rate from an index that stopped six weeks ago looks exactly like a fresh
 * one, and is worse than no number at all.
 */

import { Result, Schema } from "effect";

import { FIXTURE_CAPTURED_AT, FIXTURE_MARKETS } from "./fixture";
import { MAX_INDEX_LAG_MS, MESSARI_LENDING_DEPLOYMENTS } from "./registry";
import type { Deployment } from "./registry";
import type {
  DeploymentReading,
  GraphClient,
  GraphSnapshot,
  LendingMarket,
} from "./types";

/**
 * Messari's standardized lending schema, queried once for every protocol.
 *
 * `totalBorrowBalanceUSD` and the rate array are schema fields, not
 * protocol-specific ones — that is the entire point of querying a standardized
 * subgraph rather than three bespoke ones.
 */
const LENDING_QUERY = `
  query CheapestBorrow($symbol: String!, $first: Int!) {
    _meta { block { number timestamp } }
    markets(
      first: $first
      orderBy: totalBorrowBalanceUSD
      orderDirection: desc
      where: { inputToken_: { symbol: $symbol }, isActive: true }
    ) {
      name
      inputToken { symbol }
      totalBorrowBalanceUSD
      totalDepositBalanceUSD
      rates { rate side type }
    }
  }
`;

/**
 * The gateway's answer, decoded rather than asserted.
 *
 * Every field here is one the Messari standardized schema declares, and the
 * decode is what makes "standardized" mean something: a deployment that has
 * drifted fails loudly at the boundary instead of quietly producing `NaN` rates
 * that the agent would then reason about and spend against.
 */
const RawRate = Schema.Struct({
  rate: Schema.String,
  side: Schema.String,
  type: Schema.String,
});

const RawMarket = Schema.Struct({
  inputToken: Schema.Struct({ symbol: Schema.String }),
  name: Schema.String,
  rates: Schema.Array(RawRate),
  totalBorrowBalanceUSD: Schema.String,
  totalDepositBalanceUSD: Schema.String,
});

/**
 * `_meta` is how a subgraph reports its own head.
 *
 * `timestamp` is nullable in the schema and genuinely absent on some
 * deployments, which is why the gate treats a missing timestamp as
 * unverifiable rather than as fresh.
 */
const RawMeta = Schema.Struct({
  block: Schema.Struct({
    number: Schema.Finite,
    timestamp: Schema.optional(Schema.NullOr(Schema.Finite)),
  }),
});

const GatewayResponse = Schema.Struct({
  data: Schema.optional(
    Schema.Struct({
      _meta: Schema.optional(Schema.NullOr(RawMeta)),
      markets: Schema.optional(Schema.Array(RawMarket)),
    })
  ),
  errors: Schema.optional(
    Schema.Array(Schema.Struct({ message: Schema.String }))
  ),
});

const decodeGatewayResponse = Schema.decodeUnknownResult(GatewayResponse);

type RawRate = typeof RawRate.Type;
type RawMarket = typeof RawMarket.Type;

const rateOf = (rates: readonly RawRate[], side: string): number => {
  const variable = rates.find((r) => r.side === side && r.type === "VARIABLE");
  const any = rates.find((r) => r.side === side);
  return Number((variable ?? any)?.rate ?? 0);
};

/**
 * A market's protocol, taken from its name.
 *
 * The standardized schema names the deployment ("Aave V3 USDC"), and the first
 * word is the protocol in every deployment we query. Deliberately not a lookup
 * table: an unrecognised protocol should show up as its own name in the answer,
 * not silently become "unknown".
 */
const protocolOf = (name: string): string =>
  name.split(/\s+/u)[0]?.toLowerCase() ?? "unknown";

const toMarket = (
  raw: RawMarket,
  deployment: Deployment,
  blockNumber: number
): LendingMarket => ({
  blockNumber,
  borrowApr: rateOf(raw.rates, "BORROWER"),
  chain: deployment.chain,
  deploymentId: deployment.id,
  inputTokenSymbol: raw.inputToken.symbol,
  name: raw.name,
  protocol: protocolOf(raw.name),
  supplyApr: rateOf(raw.rates, "LENDER"),
  totalBorrowUsd: Number(raw.totalBorrowBalanceUSD),
  totalSupplyUsd: Number(raw.totalDepositBalanceUSD),
});

const byCheapestBorrow = (a: LendingMarket, b: LendingMarket): number =>
  a.borrowApr - b.borrowApr;

export const stubGraphClient = (): GraphClient => ({
  lendingMarkets: async (symbol) => {
    await Promise.resolve();
    const markets = FIXTURE_MARKETS.filter(
      (m) => m.inputTokenSymbol.toUpperCase() === symbol.toUpperCase()
    ).toSorted(byCheapestBorrow);
    return {
      capturedAt: FIXTURE_CAPTURED_AT,
      // Every deployment reports `unavailable`, not `fresh`. A stub that
      // claimed four healthy indexes would be the exact screenshot this whole
      // split exists to make impossible.
      deployments: MESSARI_LENDING_DEPLOYMENTS.map((deployment) => ({
        blockNumber: null,
        blockTimestamp: null,
        chain: deployment.chain,
        id: deployment.id,
        label: deployment.label,
        marketCount: markets.filter((m) => m.deploymentId === deployment.id)
          .length,
        note: "fixture, not queried",
        status: "unavailable" as const,
      })),
      markets,
      query: `lendingMarkets(${symbol})`,
      source: "fixture:messari-lending",
      stubbed: true,
    } satisfies GraphSnapshot;
  },
});

export interface LiveGraphOptions {
  readonly apiKey: string;
  /** Overridable so a self-hosted index, or the testnet gateway, can stand in. */
  readonly gatewayUrl?: string;
  /** Overridable in tests. Defaults to the pinned registry. */
  readonly deployments?: readonly Deployment[];
  readonly now?: () => number;
}

const DEFAULT_GATEWAY = "https://gateway.thegraph.com/api";
const MARKET_LIMIT = 25;
const MS_PER_SECOND = 1000;

interface Reading {
  readonly markets: readonly LendingMarket[];
  readonly reading: DeploymentReading;
}

const unavailable = (deployment: Deployment, note: string): Reading => ({
  markets: [],
  reading: {
    blockNumber: null,
    blockTimestamp: null,
    chain: deployment.chain,
    id: deployment.id,
    label: deployment.label,
    marketCount: 0,
    note,
    status: "unavailable",
  },
});

/**
 * Query one deployment.
 *
 * Never throws. One dead index must not take the other three with it — the
 * whole argument for a registry is that it degrades rather than fails, and a
 * rejected promise here would turn a partial answer into no answer.
 */
const readDeployment = async (
  deployment: Deployment,
  input: {
    readonly apiKey: string;
    readonly gateway: string;
    readonly now: number;
    readonly symbol: string;
  }
): Promise<Reading> => {
  const url = `${input.gateway}/subgraphs/id/${deployment.id}`;
  let response: Response;
  try {
    response = await fetch(url, {
      body: JSON.stringify({
        query: LENDING_QUERY,
        variables: { first: MARKET_LIMIT, symbol: input.symbol.toUpperCase() },
      }),
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
  } catch (error) {
    return unavailable(
      deployment,
      error instanceof Error ? error.message : "the gateway was unreachable"
    );
  }
  if (!response.ok) {
    return unavailable(
      deployment,
      `gateway returned ${response.status} ${response.statusText}`
    );
  }

  const decoded = decodeGatewayResponse(
    await response.json().catch(() => null)
  );
  if (Result.isFailure(decoded)) {
    return unavailable(
      deployment,
      "the answer did not match the standardized lending schema"
    );
  }
  const body = decoded.success;
  if (body.errors !== undefined && body.errors.length > 0) {
    return unavailable(
      deployment,
      body.errors.map((issue) => issue.message).join("; ")
    );
  }

  const meta = body.data?._meta;
  if (meta === undefined || meta === null) {
    return unavailable(deployment, "the deployment reported no _meta block");
  }
  const timestamp = meta.block.timestamp ?? null;
  if (timestamp === null) {
    // Unverifiable, so refused. Treating "I cannot tell you how fresh I am"
    // as fresh is the failure this gate exists to prevent.
    return {
      markets: [],
      reading: {
        blockNumber: meta.block.number,
        blockTimestamp: null,
        chain: deployment.chain,
        id: deployment.id,
        label: deployment.label,
        marketCount: 0,
        note: "the deployment did not report a block timestamp",
        status: "stale",
      },
    };
  }

  const lagMs = input.now - timestamp * MS_PER_SECOND;
  if (lagMs > MAX_INDEX_LAG_MS) {
    const hours = Math.round(lagMs / 3_600_000);
    return {
      markets: [],
      reading: {
        blockNumber: meta.block.number,
        blockTimestamp: timestamp,
        chain: deployment.chain,
        id: deployment.id,
        label: deployment.label,
        marketCount: 0,
        note: `${hours}h behind; its numbers were not used`,
        status: "stale",
      },
    };
  }

  const markets = (body.data?.markets ?? []).map((raw) =>
    toMarket(raw, deployment, meta.block.number)
  );
  return {
    markets,
    reading: {
      blockNumber: meta.block.number,
      blockTimestamp: timestamp,
      chain: deployment.chain,
      id: deployment.id,
      label: deployment.label,
      marketCount: markets.length,
      note: null,
      status: "fresh",
    },
  };
};

export const liveGraphClient = (options: LiveGraphOptions): GraphClient => {
  const gateway = options.gatewayUrl ?? DEFAULT_GATEWAY;
  const deployments = options.deployments ?? MESSARI_LENDING_DEPLOYMENTS;
  const clock = options.now ?? Date.now;

  return {
    lendingMarkets: async (symbol) => {
      const now = clock();
      // In parallel: four sequential round trips would put the freshness of
      // the first several seconds behind the last, which is the thing being
      // measured.
      const readings = await Promise.all(
        deployments.map(
          async (deployment) =>
            await readDeployment(deployment, {
              apiKey: options.apiKey,
              gateway,
              now,
              symbol,
            })
        )
      );
      return {
        capturedAt: now,
        deployments: readings.map((r) => r.reading),
        markets: readings.flatMap((r) => r.markets).toSorted(byCheapestBorrow),
        query: `lendingMarkets(${symbol})`,
        source: gateway,
        stubbed: false,
      } satisfies GraphSnapshot;
    },
  };
};

/**
 * A digest of what the agent saw, for the receipt.
 *
 * The snapshot body is stored with the spend; this is what makes "the number it
 * acted on" checkable without re-reading the whole payload, and what makes a
 * later claim that the evidence was different falsifiable.
 */
export const snapshotHash = (snapshot: GraphSnapshot): string => {
  const canonical = JSON.stringify({
    capturedAt: snapshot.capturedAt,
    // Included: which indexes answered, and at which blocks. Two snapshots
    // with the same markets but different provenance are different evidence,
    // and a hash that could not tell them apart would not be worth citing.
    deployments: snapshot.deployments,
    markets: snapshot.markets,
    query: snapshot.query,
    source: snapshot.source,
  });
  return new Bun.CryptoHasher("sha256").update(canonical).digest("hex");
};

/**
 * One line per deployment, including the ones that did not answer.
 *
 * This is the provenance the Graph tracks are judged on, and it is written for
 * a reader rather than a log: "3 of 4 indexes fresh" plus the reason for the
 * fourth is what someone needs to decide whether to believe the number above.
 */
export const describeDeployments = (snapshot: GraphSnapshot): string => {
  const fresh = snapshot.deployments.filter((d) => d.status === "fresh").length;
  const lines = snapshot.deployments.map((d) => {
    const where = `${d.label} (${d.chain}) ${d.id.slice(0, 8)}…`;
    if (d.status === "fresh") {
      return `${where}: block ${d.blockNumber ?? "?"}, ${d.marketCount} markets`;
    }
    return `${where}: ${d.status} — ${d.note ?? "no reason given"}`;
  });
  return `${fresh}/${snapshot.deployments.length} indexes fresh. ${lines.join(" | ")}`;
};

/**
 * The one-line answer, and the reason it is worth paying for.
 *
 * Returned as prose because this string is both what the model reads and what
 * the paid endpoint sells. Keeping one formatter means the thing the buyer gets
 * cannot drift from the thing the agent reasoned about.
 */
export const describeCheapestBorrow = (snapshot: GraphSnapshot): string => {
  const [best] = snapshot.markets;
  const provenance = describeDeployments(snapshot);
  if (best === undefined) {
    // Distinguishes "nothing matched" from "nothing was trustworthy". The
    // second is a much more important thing to say out loud, and the
    // deployment lines are how it gets said.
    return `No usable markets. ${provenance}`;
  }
  const rest = snapshot.markets
    .slice(1, 4)
    .map((m) => `${m.name} ${m.borrowApr.toFixed(2)}%`)
    .join(", ");
  return `Cheapest ${best.inputTokenSymbol} borrow: ${best.name} at ${best.borrowApr.toFixed(2)}% APR ($${(best.totalBorrowUsd / 1e6).toFixed(0)}M borrowed, ${best.deploymentId.slice(0, 8)}… block ${best.blockNumber}).${rest === "" ? "" : ` Next: ${rest}.`} ${provenance}`;
};
