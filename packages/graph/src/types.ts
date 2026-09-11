/**
 * The one shape the agent reasons about.
 *
 * This is the "leverage of standards" the Graph track is asking for, made
 * concrete: a lending market is described the same way whether it came from
 * Aave, Compound or Morpho, so a single query answers "cheapest USDC borrow"
 * across all of them instead of three protocol-specific queries and a
 * reconciliation step nobody wants to write.
 */

export interface LendingMarket {
  /** The block this row was indexed at. Carried so a receipt can cite it. */
  readonly blockNumber: number;
  readonly borrowApr: number;
  readonly chain: string;
  /**
   * The pinned deployment this row came from.
   *
   * On the row rather than only on the snapshot, because the interesting
   * answer is a comparison *across* deployments — "cheapest borrow" is only
   * checkable if you can say which index each candidate came from.
   */
  readonly deploymentId: string;
  readonly inputTokenSymbol: string;
  /** The exact artefact the row was read from; see `Deployment.ipfsHash`. */
  readonly ipfsHash: string;
  readonly name: string;
  readonly protocol: string;
  readonly supplyApr: number;
  readonly totalBorrowUsd: number;
  readonly totalSupplyUsd: number;
}

/** Why a deployment did or did not contribute to an answer. */
export type DeploymentStatus = "fresh" | "stale" | "unavailable";

export interface DeploymentReading {
  readonly blockNumber: number | null;
  /** Seconds the index is behind wall-clock, or null when it did not answer. */
  readonly blockTimestamp: number | null;
  readonly chain: string;
  readonly id: string;
  /** The pinned hash; on the receipt so the artefact can be re-read. */
  readonly ipfsHash: string;
  readonly label: string;
  readonly marketCount: number;
  /** Filled for `stale` and `unavailable`. Shown to the model and the user. */
  readonly note: string | null;
  readonly status: DeploymentStatus;
}

export interface GraphSnapshot {
  readonly capturedAt: number;
  /**
   * One entry per deployment asked, including the ones that failed.
   *
   * A registry that silently drops a dead index looks identical to one that
   * never had it, and "three of four answered" is exactly the fact a person
   * deciding whether to trust the number needs.
   */
  readonly deployments: readonly DeploymentReading[];
  readonly markets: readonly LendingMarket[];
  readonly query: string;
  /** Provider label that ends up on the receipt: gateway URL, or the fixture. */
  readonly source: string;
  readonly stubbed: boolean;
}

export interface GraphClient {
  /**
   * Markets for one input token, cheapest borrow first.
   *
   * Sorting here rather than at the call site because "cheapest" is the whole
   * question and a caller that forgot to sort would answer it wrongly while
   * looking correct.
   */
  readonly lendingMarkets: (symbol: string) => Promise<GraphSnapshot>;
}
