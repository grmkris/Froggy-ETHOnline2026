import { WatchlistInput, WatchlistItem } from "@froggy/domain";
import { Schema } from "effect";

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
