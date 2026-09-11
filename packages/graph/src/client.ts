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
 *
 * `totalBorrowBalanceUSD_gt: 0` is not tidying. Compound v3's deployment
 * carries three empty USDC markets alongside its real one, all `isActive` and
 * all reporting a 0% borrow rate — and they sort straight to the top of
 * "cheapest borrow", so the honest-looking answer was "0.000%" against a
 * market with no liquidity in it. A market nobody has borrowed from is not an
 * answer to "where can I borrow", and the agent was about to spend money on
 * the strength of it.
 */
const LENDING_QUERY = `
  query CheapestBorrow($symbol: String!, $first: Int!) {
    _meta { block { number timestamp } deployment }
    markets(
      first: $first
      orderBy: totalBorrowBalanceUSD
      orderDirection: desc
      where: {
        inputToken_: { symbol: $symbol }
        isActive: true
        totalBorrowBalanceUSD_gt: 0
      }
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
  /**
   * Nullable, because the Messari schema declares it nullable and at least one
   * live deployment leaves it unset.
   *
   * Requiring a string here made the whole of Compound v3 decode-fail and get
   * reported as "did not match the standardized lending schema" — a decoder
   * stricter than the schema it claims to follow, blaming the data for its own
   * mistake. Standardised means what the schema says, not what three of four
   * deployments happen to fill in.
   */
  name: Schema.NullOr(Schema.String),
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
  /**
   * The hash of the deployment that actually answered. Optional because older
   * graph-node versions do not expose it; when it is present it has to be the
   * one that was asked for.
   */
  deployment: Schema.optional(Schema.NullOr(Schema.String)),
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

/**
 * A readable name for a market that did not supply one.
 *
 * Built from the two things every deployment does populate — the protocol we
 * asked and the token we asked about — so an unnamed market reads as
 * "Compound v3 USDC" rather than as a blank row the model has to guess at.
 */
const nameOf = (raw: RawMarket, deployment: Deployment): string =>
  raw.name ?? `${deployment.label} ${raw.inputToken.symbol}`;

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
  ipfsHash: deployment.ipfsHash,
  name: nameOf(raw, deployment),
  protocol: protocolOf(nameOf(raw, deployment)),
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
        ipfsHash: deployment.ipfsHash,
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

/**
 * How a query reaches the gateway.
 *
 * The Studio transport sends a key. An x402 transport pays per query, through
 * whatever pays on the caller's behalf; this package never sees money, only
 * a function that answers with a response. The label ends up on the snapshot
 * and every receipt, so "which provider served this" is a fact and not a
 * guess.
 */
export interface GraphTransport {
  readonly label: string;
  readonly send: (url: string, body: string) => Promise<Response>;
  /** The gateway address of one exact deployment, by its ipfs hash. */
  readonly url: (gateway: string, ipfsHash: string) => string;
}

export const studioTransport = (apiKey: string): GraphTransport => ({
  label: "studio",
  send: async (url, body) =>
    await fetch(url, {
      body,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    }),
  url: (gateway, ipfsHash) => `${gateway}/deployments/id/${ipfsHash}`,
});

/** The pay-per-query path: the URL the gateway prices, and whatever pays. */
export const x402Transport = (
  send: GraphTransport["send"]
): GraphTransport => ({
  label: "x402",
  send,
  url: (gateway, ipfsHash) => `${gateway}/x402/deployments/id/${ipfsHash}`,
});

export interface LiveGraphOptions {
  readonly apiKey: string;
  /** Overridable so a self-hosted index, or the testnet gateway, can stand in. */
  readonly gatewayUrl?: string;
  /** Overridable in tests. Defaults to the pinned registry. */
  readonly deployments?: readonly Deployment[];
  readonly now?: () => number;
  /** Defaults to the Studio key. */
  readonly transport?: GraphTransport;
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
    ipfsHash: deployment.ipfsHash,
    label: deployment.label,
    marketCount: 0,
    note,
    status: "unavailable",
  },
});

const GatewayFailure = Schema.Struct({
  error: Schema.optional(Schema.String),
  errors: Schema.optional(
    Schema.Array(Schema.Struct({ message: Schema.String }))
  ),
});

/** Preserve a supplier or signer refusal without buffering an unbounded error page. */
const failureNote = async (response: Response): Promise<string> => {
  const status =
    `gateway returned ${response.status} ${response.statusText}`.trim();
  const fallback =
    response.status === 402
      ? `${status}: supplier payment did not complete; no market data was retrieved`
      : status;
  if (response.body === null) {
    return fallback;
  }
  try {
    const decoder = new TextDecoder();
    let bytes = 0;
    let body = "";
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > 16_384) {
        // Breaking async iteration cancels the stream instead of draining an error page.
        return fallback;
      }
      body += decoder.decode(chunk, { stream: true });
    }
    body += decoder.decode();
    const decoded = Schema.decodeUnknownResult(GatewayFailure)(
      JSON.parse(body)
    );
    if (decoded._tag === "Failure") {
      return fallback;
    }
    const messages = decoded.success.errors
      ?.slice(0, 3)
      .map((error) => error.message)
      .join("; ");
    const detail = (messages ?? decoded.success.error ?? "")
      .trim()
      .slice(0, 1000);
    return detail === "" ? fallback : `${status}: ${detail}`;
  } catch {
    return fallback;
  }
};

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
    readonly gateway: string;
    readonly now: number;
    readonly symbol: string;
    readonly transport: GraphTransport;
  }
): Promise<Reading> => {
  const url = input.transport.url(input.gateway, deployment.ipfsHash);
  let response: Response;
  try {
    response = await input.transport.send(
      url,
      JSON.stringify({
        query: LENDING_QUERY,
        variables: { first: MARKET_LIMIT, symbol: input.symbol.toUpperCase() },
      })
    );
  } catch (error) {
    return unavailable(
      deployment,
      error instanceof Error ? error.message : "the gateway was unreachable"
    );
  }
  if (!response.ok) {
    return unavailable(deployment, await failureNote(response));
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
  // The receipt names this hash as the exact artefact the numbers came from.
  // A gateway that routed the query to another version would make that a
  // false statement, so it is checked rather than assumed.
  if (
    meta.deployment !== undefined &&
    meta.deployment !== null &&
    meta.deployment !== deployment.ipfsHash
  ) {
    return unavailable(
      deployment,
      `the gateway answered from deployment ${meta.deployment}, not the pinned ${deployment.ipfsHash}`
    );
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
        ipfsHash: deployment.ipfsHash,
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
        ipfsHash: deployment.ipfsHash,
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
      ipfsHash: deployment.ipfsHash,
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
  const transport = options.transport ?? studioTransport(options.apiKey);

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
              gateway,
              now,
              symbol,
              transport,
            })
        )
      );
      return {
        capturedAt: now,
        deployments: readings.map((r) => r.reading),
        markets: readings.flatMap((r) => r.markets).toSorted(byCheapestBorrow),
        query: `lendingMarkets(${symbol})`,
        source: `${gateway} via ${transport.label}`,
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
/**
 * How much is borrowed, at a precision that does not flatter a tiny market.
 *
 * `$Nm` rounding turned a market with four hundred thousand dollars borrowed
 * into "$0M" — while it sat second in a cheapest-first list, because its rate
 * is genuinely low and nobody is using it. The rate is real and the market is
 * real, so it is not filtered out; it is simply shown at a size that makes it
 * obvious why the rate is what it is.
 */
const money = (usd: number): string => {
  if (usd >= 1e9) {
    return `$${(usd / 1e9).toFixed(1)}B`;
  }
  if (usd >= 1e6) {
    return `$${(usd / 1e6).toFixed(0)}M`;
  }
  if (usd >= 1e3) {
    return `$${(usd / 1e3).toFixed(0)}k`;
  }
  return `$${usd.toFixed(0)}`;
};

/**
 * The other side of the same markets: where the token earns most.
 *
 * Same twelve indexes, same blocks, sorted the other way. Said as its own
 * sentence rather than folded into the borrow one, because a person asking
 * "where does my USDC earn most" should not have to read past the borrow
 * answer to find out.
 */
export const describeBestSupply = (snapshot: GraphSnapshot): string => {
  const ranked = [...snapshot.markets]
    .filter((m) => m.totalSupplyUsd > 0)
    .toSorted((a, b) => b.supplyApr - a.supplyApr);
  const [best] = ranked;
  if (best === undefined) {
    return "No usable supply markets.";
  }
  const rest = ranked
    .slice(1, 4)
    .map(
      (m) =>
        `${m.name} on ${m.chain} ${m.supplyApr.toFixed(2)}% (${money(m.totalSupplyUsd)})`
    )
    .join(", ");
  return `Best ${best.inputTokenSymbol} supply: ${best.name} on ${best.chain} at ${best.supplyApr.toFixed(2)}% APR (${money(best.totalSupplyUsd)} supplied, ${best.deploymentId.slice(0, 8)}… block ${best.blockNumber}).${rest === "" ? "" : ` Next: ${rest}.`}`;
};

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
    .map(
      (m) =>
        `${m.name} on ${m.chain} ${m.borrowApr.toFixed(2)}% (${money(m.totalBorrowUsd)})`
    )
    .join(", ");
  return `Cheapest ${best.inputTokenSymbol} borrow: ${best.name} on ${best.chain} at ${best.borrowApr.toFixed(2)}% APR (${money(best.totalBorrowUsd)} borrowed, ${best.deploymentId.slice(0, 8)}… block ${best.blockNumber}).${rest === "" ? "" : ` Next: ${rest}.`} ${provenance}`;
};
