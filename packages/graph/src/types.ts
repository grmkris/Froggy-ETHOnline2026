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
  readonly borrowApr: number;
  readonly inputTokenSymbol: string;
  readonly name: string;
  readonly protocol: string;
  readonly supplyApr: number;
  readonly totalBorrowUsd: number;
  readonly totalSupplyUsd: number;
}

export interface GraphSnapshot {
  readonly capturedAt: number;
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
