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
 * single `markets { rates { rate side type } }` shape work across all four.
 */

export interface Deployment {
  /** Chain the protocol is deployed on. Shown, because rates differ by chain. */
  readonly chain: string;
  /** The pinned deployment id (`Qm…`-derived base58), not a subgraph name. */
  readonly id: string;
  readonly label: string;
}

export const MESSARI_LENDING_DEPLOYMENTS: readonly Deployment[] = [
  {
    chain: "ethereum",
    id: "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk",
    label: "Aave v3",
  },
  {
    chain: "base",
    id: "D7mapexM5ZsQckLJai2FawTKXJ7CqYGKM8PErnS3cJi9",
    label: "Aave v3",
  },
  {
    chain: "ethereum",
    id: "AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9",
    label: "Compound v3",
  },
  {
    chain: "ethereum",
    id: "GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si",
    label: "Spark",
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
