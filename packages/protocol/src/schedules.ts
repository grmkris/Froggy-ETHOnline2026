/**
 * Schedules over HTTP: what a person or the model asks for, and what they
 * are shown.
 *
 * The request speaks in the person's terms — "in 20 minutes", "at
 * 2026-09-08T07:30 my time", "every Monday at 09:00" — and the server turns
 * that into a cadence with the zone resolved. The two shapes are kept apart
 * so a client never has to compute an instant to ask for a reminder.
 */

import {
  ClockTime,
  PromptAction,
  RemindAction,
  Schedule,
  Weekday,
} from "@froggy/domain";
import { Schema } from "effect";

/** Thirty days, in minutes. Further out than that is a date, not a delay. */
const MAX_DELAY_MINUTES = 30 * 24 * 60;

export const ScheduleWhen = Schema.Union([
  Schema.TaggedStruct("in", {
    minutes: Schema.Int.check(
      Schema.isBetween({ maximum: MAX_DELAY_MINUTES, minimum: 1 })
    ),
  }),
  /** A local wall-clock instant, "YYYY-MM-DDTHH:MM", read in the resolved zone. */
  Schema.TaggedStruct("at", {
    local: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/u, {
        message: 'Expected a local time such as "2026-09-08T07:30"',
      })
    ),
  }),
  Schema.TaggedStruct("daily", { time: ClockTime }),
  Schema.TaggedStruct("weekly", { time: ClockTime, weekday: Weekday }),
]);
export type ScheduleWhen = typeof ScheduleWhen.Type;

/** The request without its envelope: what the model's tool takes. */
export const ScheduleRequestBody = Schema.Struct({
  action: Schema.Union([RemindAction, PromptAction]),
  label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  /** An IANA zone. Absent: the person's last known zone, else UTC, and the answer says so. */
  timezone: Schema.optional(Schema.String),
  when: ScheduleWhen,
});
export type ScheduleRequestBody = typeof ScheduleRequestBody.Type;

export const ScheduleRequest = Schema.Struct({
  v: Schema.Literals([1]),
  ...ScheduleRequestBody.fields,
});
export type ScheduleRequest = typeof ScheduleRequest.Type;

export const ScheduleList = Schema.Struct({
  v: Schema.Literals([1]),
  schedules: Schema.Array(Schedule),
});
export type ScheduleList = typeof ScheduleList.Type;
