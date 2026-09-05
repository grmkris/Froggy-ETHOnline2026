/**
 * The four deployments the agent reads, and why there are four.
 *
 * The Composable track's own text says that "simply querying one Subgraph …
 * does not qualify", and it is right to: one subgraph is a database call with
 * extra steps. The claim worth making is that a *standardized schema* lets one
 * query shape answer a question across protocols that would otherwise need
 * three bespoke integrations and a reconciliation step nobody wants to own.
 *
 * So these are pinned by deployment id rather than by subgraph name. A name
 * resolves to whatever version is current, which means the answer can change
 * under you between two runs of the same demo; a deployment id is the exact
 * indexed artefact, and it is what a receipt can honestly cite.
 *
 * They are Messari's standardized lending deployments, which is what makes the
 * single `markets { rates { rate side type } }` shape work across all of them:
 * six protocols on five chains, answering one query.
 */

export interface Deployment {
  /** Chain the protocol is deployed on. Shown, because rates differ by chain. */
  readonly chain: string;
  /** The pinned deployment id (`Qm…`-derived base58), not a subgraph name. */
  readonly id: string;
  readonly label: string;
}

/**
 * Every deployment was probed against the live gateway on 5 Sep 2026 with the
 * exact query in `client.ts`, and kept only if it answered with real USDC
 * markets at sane rates. Three candidates were rejected on evidence, and the
 * reasons are recorded here because the next person to widen this list will
 * otherwise find them again the hard way:
 *
 *   - **Aave v3 Base** (`D7mapexM…`, previously pinned here) — the gateway
 *     answers `subgraph not found: no allocations`. Nobody indexes it, so it
 *     cannot be served at any price. The official Aave Base subgraph exists
 *     but is not the standardized schema (`Query has no field markets`).
 *   - **Moonwell Base** — answers, and is standardized, and its numbers are
 *     wrong: 99.59% borrow against 90.05% supply on USDC, 46.8% on cbBTC.
 *     Those are not Moonwell's rates. A subgraph can be live, allocated and
 *     schema-correct and still report nonsense, which is the argument for
 *     reading the numbers before trusting the registry entry.
 *   - **Compound v3 on Base and Optimism** — a genuinely older schema with no
 *     `inputToken` on a market. Contorting one query to span schema versions
 *     would make every answer harder to trust than leaving these out.
 */
export const MESSARI_LENDING_DEPLOYMENTS: readonly Deployment[] = [
  // -- Aave v3 ---------------------------------------------------------------
  {
    chain: "ethereum",
    id: "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk",
    label: "Aave v3",
  },
  {
    chain: "arbitrum",
    id: "4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf",
    label: "Aave v3",
  },
  {
    chain: "polygon",
    id: "6yuf1C49aWEscgk5n9D1DekeG1BCk5Z9imJYJT3sVmAT",
    label: "Aave v3",
  },
  {
    chain: "bsc",
    id: "43jbGkvSw55sMvYyF6MZieksmJbajMu3hNGF8PN9ucuP",
    label: "Aave v3",
  },
  // -- Aave v2. Deprecated, thin, and priced accordingly — which is exactly
  // what makes it worth reading: it is the same schema saying a very
  // different number, and a comparison that only spans healthy markets is not
  // much of a comparison.
  {
    chain: "ethereum",
    id: "C2zniPn45RnLDGzVeGZCx2Sw3GXrbc9gL4ZfL8B8Em2j",
    label: "Aave v2",
  },
  {
    chain: "polygon",
    id: "GrZQJ7sWdTqiNUD8Vh2THaeBM4wGwiF8mFv9FBfyzwxm",
    label: "Aave v2",
  },
  // -- Compound --------------------------------------------------------------
  {
    chain: "ethereum",
    id: "AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9",
    label: "Compound v3",
  },
  {
    chain: "arbitrum",
    id: "5MjRndNWGhqvNX7chUYLQDnvEgc8DaH8eisEkcJt71SR",
    label: "Compound v3",
  },
  {
    chain: "polygon",
    id: "5wfoWBpfYv59b99wDxJmyFiKBu9brXESeqJAzw8WP5Cz",
    label: "Compound v3",
  },
  {
    chain: "ethereum",
    id: "4TbqVA8p2DoBd5qDbPMwmDZv3CsJjWtxo8nVSqF2tA9a",
    label: "Compound v2",
  },
  // -- and two more protocols, because the claim is cross-protocol -----------
  {
    chain: "ethereum",
    id: "GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si",
    label: "Spark",
  },
  {
    chain: "ethereum",
    id: "95nyAWFFaiz6gykko3HtBCyhRuP5vZzuKYsZiLxHxLhr",
    label: "Euler",
  },
];

/**
 * How far behind an index may be before its numbers stop counting.
 *
 * Two hours, and it **fails closed**: a deployment behind this contributes no
 * markets and is reported as stale rather than quietly folded into the answer.
 * The agent is about to spend money on the strength of these numbers, and a
 * borrow rate from an index that stopped six weeks ago is worse than no
 * number — it looks exactly like a fresh one.
 */
export const MAX_INDEX_LAG_MS = 2 * 60 * 60 * 1000;
