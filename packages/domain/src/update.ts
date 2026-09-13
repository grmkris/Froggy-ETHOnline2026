import { Schema } from "effect";

import { UpdateId, WalletActivityId, WatchlistItemId } from "./id";

const time = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const Update = Schema.Struct({
  v: Schema.Literal(1),
  id: UpdateId,
  itemId: Schema.NullOr(WatchlistItemId),
  kind: Schema.Literals(["activity", "price", "found", "enriched", "notice"]),
  key: Schema.String.check(Schema.isMaxLength(300)),
  title: Schema.String.check(Schema.isMaxLength(120)),
  body: Schema.String.check(Schema.isMaxLength(1000)),
  at: time,
  readAt: Schema.NullOr(time),
  stubbed: Schema.Boolean,
  activityId: Schema.optional(WalletActivityId),
});
export type Update = typeof Update.Type;
export const UpdatesPage = Schema.Struct({
  v: Schema.Literal(1),
  updates: Schema.Array(Update).check(Schema.isMaxLength(30)),
  next: Schema.NullOr(UpdateId),
  unread: time,
});
export type UpdatesPage = typeof UpdatesPage.Type;
