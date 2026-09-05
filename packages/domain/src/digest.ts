/**
 * The daily digest schedule: when, in whose clock.
 *
 * `hour` is local to `timezone`, an IANA name, so "at eight" survives the
 * clocks changing. Null hour means never.
 */

import { Schema } from "effect";

export const DigestSchedule = Schema.Struct({
  hour: Schema.NullOr(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 23 }))
  ),
  timezone: Schema.String,
});
export type DigestSchedule = typeof DigestSchedule.Type;

export const NO_DIGEST: DigestSchedule = { hour: null, timezone: "UTC" };
