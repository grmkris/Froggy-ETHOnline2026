/**
 * What `graph_query` hands back, in two registers.
 *
 * The model reads `text`, the same prose it read when prose was all there
 * was. The card reads the rest: the markets cheapest first, and every
 * deployment asked with whether it answered. One object, built once on the
 * server, so the two can never describe different answers. Shared here
 * because the client decodes what the server encodes.
 */

import { Schema } from "effect";

export const GraphQueryMarket = Schema.Struct({
  blockNumber: Schema.Finite,
  borrowApr: Schema.Finite,
  chain: Schema.String,
  deploymentId: Schema.String,
  name: Schema.String,
  protocol: Schema.String,
  supplyApr: Schema.Finite,
  totalBorrowUsd: Schema.Finite,
});
export type GraphQueryMarket = typeof GraphQueryMarket.Type;

export const GraphQueryDeployment = Schema.Struct({
  blockNumber: Schema.NullOr(Schema.Finite),
  chain: Schema.String,
  id: Schema.String,
  label: Schema.String,
  marketCount: Schema.Finite,
  /** Why it did not contribute, for `stale` and `unavailable`. */
  note: Schema.NullOr(Schema.String),
  status: Schema.Literals(["fresh", "stale", "unavailable"]),
});
export type GraphQueryDeployment = typeof GraphQueryDeployment.Type;

export const GraphQueryOutput = Schema.Struct({
  deployments: Schema.Array(GraphQueryDeployment),
  /** How many of `total` answered with a current block. */
  fresh: Schema.Int,
  /** Cheapest borrow first; the head is the answer. At most a handful. */
  markets: Schema.Array(GraphQueryMarket),
  stubbed: Schema.Boolean,
  symbol: Schema.String,
  /** The prose the model reads. */
  text: Schema.String,
  total: Schema.Int,
});
export type GraphQueryOutput = typeof GraphQueryOutput.Type;

export const decodeGraphQueryOutput =
  Schema.decodeUnknownResult(GraphQueryOutput);
