/**
 * The stub corpus.
 *
 * A recorded shape, not invented numbers: every field is one the Messari
 * standardized lending schema actually returns, so the code that consumes a
 * live answer is the same code that consumes this one. What it is *not* is a
 * substitute for a live provider — The Graph's track rules say mocked data does
 * not qualify, so anything built on this is marked `stubbed` all the way to the
 * receipt and the UI.
 *
 * The rates are deliberately unremarkable and the timestamp is fixed, so a
 * screenshot of a stubbed run cannot be mistaken for a live one by someone
 * scrolling past.
 */

import type { LendingMarket } from "./types";

export const FIXTURE_CAPTURED_AT = 1_756_000_000_000;

export const FIXTURE_MARKETS: readonly LendingMarket[] = [
  {
    borrowApr: 5.42,
    inputTokenSymbol: "USDC",
    name: "Aave V3 USDC",
    protocol: "aave-v3",
    supplyApr: 3.11,
    totalBorrowUsd: 412_000_000,
    totalSupplyUsd: 918_000_000,
  },
  {
    borrowApr: 6.08,
    inputTokenSymbol: "USDC",
    name: "Compound V3 USDC",
    protocol: "compound-v3",
    supplyApr: 4.02,
    totalBorrowUsd: 233_000_000,
    totalSupplyUsd: 501_000_000,
  },
  {
    borrowApr: 4.87,
    inputTokenSymbol: "USDC",
    name: "Morpho Blue USDC",
    protocol: "morpho-blue",
    supplyApr: 3.64,
    totalBorrowUsd: 96_000_000,
    totalSupplyUsd: 158_000_000,
  },
];
