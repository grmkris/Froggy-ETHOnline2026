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

import { MESSARI_LENDING_DEPLOYMENTS } from "./registry";
import type { LendingMarket } from "./types";

/**
 * The fixture cites the real deployment ids, and a block number of 0.
 *
 * Real ids because the stub has to exercise the same rendering path as a live
 * answer; block 0 because it must never be mistakable for one. A fixture that
 * carried a plausible block number would be indistinguishable from a live row
 * in a screenshot, which is the one thing the whole stub split exists to
 * prevent.
 */
const deploymentId = (index: number): string =>
  MESSARI_LENDING_DEPLOYMENTS[index]?.id ?? "unknown";
const ipfsHash = (index: number): string =>
  MESSARI_LENDING_DEPLOYMENTS[index]?.ipfsHash ?? "unknown";

export const FIXTURE_CAPTURED_AT = 1_756_000_000_000;

export const FIXTURE_MARKETS: readonly LendingMarket[] = [
  {
    blockNumber: 0,
    borrowApr: 5.42,
    chain: "ethereum",
    deploymentId: deploymentId(0),
    inputTokenSymbol: "USDC",
    ipfsHash: ipfsHash(0),
    name: "Aave V3 USDC",
    protocol: "aave-v3",
    supplyApr: 3.11,
    totalBorrowUsd: 412_000_000,
    totalSupplyUsd: 918_000_000,
  },
  {
    blockNumber: 0,
    borrowApr: 6.08,
    chain: "ethereum",
    deploymentId: deploymentId(2),
    inputTokenSymbol: "USDC",
    ipfsHash: ipfsHash(2),
    name: "Compound V3 USDC",
    protocol: "compound-v3",
    supplyApr: 4.02,
    totalBorrowUsd: 233_000_000,
    totalSupplyUsd: 501_000_000,
  },
  {
    blockNumber: 0,
    borrowApr: 4.87,
    chain: "base",
    deploymentId: deploymentId(1),
    inputTokenSymbol: "USDC",
    ipfsHash: ipfsHash(1),
    name: "Aave V3 USDC (Base)",
    protocol: "aave-v3",
    supplyApr: 3.64,
    totalBorrowUsd: 96_000_000,
    totalSupplyUsd: 158_000_000,
  },
];
