import {
  WatchlistData,
  WatchlistObservation,
  WatchlistPreviewId,
  EvmTradingNetwork,
  WatchlistInput,
  WatchlistItem,
} from "@froggy/domain";
import { Schema } from "effect";

import { TokenSnapshotResult } from "./trading-market";
import { AddressLookupResult } from "./trading-research";

export const WatchlistCreate = Schema.Struct({
  v: Schema.Literal(1),
  ...WatchlistInput.fields,
});
export const WatchlistPatch = Schema.Struct({
  v: Schema.Literal(1),
  revision: WatchlistItem.fields.revision,
  title: Schema.optional(WatchlistInput.fields.title),
  notes: Schema.optional(WatchlistInput.fields.notes),
  archived: Schema.optional(Schema.Boolean),
});
export type WatchlistPatch = typeof WatchlistPatch.Type;
export const WatchlistList = Schema.Struct({
  v: Schema.Literal(1),
  items: Schema.Array(WatchlistItem).check(Schema.isMaxLength(200)),
});

export const WatchlistResolve = Schema.Struct({
  v: Schema.Literal(1),
  input: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2048)),
  network: Schema.optional(EvmTradingNetwork),
});
export const WatchlistPreview = Schema.Struct({
  ref: Schema.optional(WatchlistPreviewId),
  observation: Schema.optional(WatchlistObservation),
  imageUrl: Schema.optional(WatchlistData.fields.imageUrl),
  v: Schema.Literal(1),
  candidates: Schema.Array(WatchlistInput).check(Schema.isMaxLength(6)),
  lookup: Schema.optional(AddressLookupResult),
  notice: Schema.String.check(Schema.isMaxLength(500)),
});
export type WatchlistPreview = typeof WatchlistPreview.Type;

export const WatchlistDetails = Schema.Struct({
  v: Schema.Literal(1),
  item: WatchlistItem,
  data: WatchlistData,
  snapshot: Schema.NullOr(TokenSnapshotResult),
});
export const WatchlistDetailsList = Schema.Struct({
  v: Schema.Literal(1),
  items: Schema.Array(WatchlistData).check(Schema.isMaxLength(200)),
});
export const WatchlistCapture = Schema.Struct({
  previewRef: Schema.optional(WatchlistPreviewId),
  v: Schema.Literal(2),
  ...WatchlistInput.fields,
  enrich: Schema.Boolean,
  acceptedPrice: Schema.Int.check(
    Schema.isBetween({ minimum: 0, maximum: 1_000_000 })
  ),
});
export const WatchlistCaptured = Schema.Struct({
  v: Schema.Literal(1),
  item: WatchlistItem,
  data: WatchlistData,
});
