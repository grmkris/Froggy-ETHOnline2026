/**
 * The welcome flow's one fact: whether this person has been through it.
 *
 * Read on Home, which shows the flow while `seenAt` is null, and written
 * when they finish or skip it. Nothing here touches what may be spent; the
 * grant the flow asks for goes the same way it does from Settings.
 */

import { Schema } from "effect";

export const SetupState = Schema.Struct({
  v: Schema.Literals([1]),
  /** When they finished or skipped the welcome, or null while they never have. */
  seenAt: Schema.NullOr(Schema.Int),
});
export type SetupState = typeof SetupState.Type;

export const SetupRequest = Schema.Struct({
  v: Schema.Literals([1]),
  /** True once through; false to be welcomed again on the next visit to Home. */
  seen: Schema.Boolean,
});
export type SetupRequest = typeof SetupRequest.Type;
