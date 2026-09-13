import { Schema } from "effect";

import { TaskId, WatchlistItemId } from "./id";
import { publicHttpUrl } from "./url";

const ShortText = Schema.String.check(Schema.isMaxLength(500));
const Time = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Price = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const SourceUrl = Schema.NullOr(
  Schema.String.check(
    Schema.isMaxLength(2048),
    Schema.makeFilter((url) => publicHttpUrl(url).ok)
  )
);
export const WatchlistFact = Schema.Struct({
  label: Schema.String.check(Schema.isMaxLength(60)),
  value: ShortText,
});
export const WatchlistObservation = Schema.Struct({
  at: Time,
  source: ShortText,
  sourceUrl: SourceUrl,
  price: Schema.NullOr(Price),
  currency: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u))),
  /** Different variants, fares and simulated sources must never share a price series. */
  basis: ShortText,
  stubbed: Schema.Boolean,
  facts: Schema.Array(WatchlistFact).check(Schema.isMaxLength(24)),
});
export type WatchlistObservation = typeof WatchlistObservation.Type;
export const WatchlistData = Schema.Struct({
  v: Schema.Literal(1),
  itemId: WatchlistItemId,
  imageUrl: Schema.optional(SourceUrl),
  latest: Schema.NullOr(WatchlistObservation),
  observations: Schema.Array(WatchlistObservation).check(
    Schema.isMaxLength(500)
  ),
  /** Provider history remains in its immutable durable task, not copied into every list response. */
  snapshotTaskId: Schema.NullOr(TaskId),
  enrichment: Schema.NullOr(
    Schema.Struct({
      key: Schema.String.check(Schema.isMaxLength(128)),
      itemRevision: Schema.Int,
      requestedAt: Time,
      acceptedPrice: Schema.Int.check(
        Schema.isBetween({ minimum: 0, maximum: 1_000_000 })
      ),
      status: Schema.Literals([
        "queued",
        "running",
        "done",
        "failed",
        "needs_help",
        "uncertain",
      ]),
      taskId: Schema.NullOr(TaskId),
      note: ShortText,
    })
  ),
});
export type WatchlistData = typeof WatchlistData.Type;
export const emptyWatchlistData = (itemId: WatchlistItemId): WatchlistData => ({
  v: 1,
  itemId,
  latest: null,
  observations: [],
  snapshotTaskId: null,
  enrichment: null,
});
