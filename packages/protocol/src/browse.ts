import { ProtocolVersion, TaskId } from "@froggy/domain";
import { Schema } from "effect";

export const BrowseBudget = Schema.Literals([1, 3, 5]);
export type BrowseBudget = typeof BrowseBudget.Type;

export const BrowseQuote = Schema.Struct({
  taskId: TaskId,
  instruction: Schema.String,
  budgetUsd: BrowseBudget,
  priceUsdMicros: Schema.Int,
  modelAllowanceUsdMicros: Schema.Int,
  executionMs: Schema.Int,
  expiresAt: Schema.Int,
  idempotencyKey: Schema.String,
});
export type BrowseQuote = typeof BrowseQuote.Type;

export const BrowseChallenge = Schema.Struct({
  x402Version: Schema.Int,
  resource: Schema.Struct({
    url: Schema.String,
    description: Schema.optional(Schema.String),
    mimeType: Schema.optional(Schema.String),
  }),
  accepts: Schema.Array(
    Schema.Struct({
      scheme: Schema.String,
      network: Schema.String,
      amount: Schema.String,
      asset: Schema.String,
      payTo: Schema.String,
      maxTimeoutSeconds: Schema.optional(Schema.Int),
      extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    })
  ),
});
export type BrowseChallenge = typeof BrowseChallenge.Type;

export const BrowseQuoteResponse = Schema.Struct({
  ...BrowseChallenge.fields,
  v: ProtocolVersion,
  quote: BrowseQuote,
});
