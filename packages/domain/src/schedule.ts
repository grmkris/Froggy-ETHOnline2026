/**
 * A schedule: something the person asked Froggy to do later, once or on a
 * cadence, in their own clock.
 *
 * The cadence is kept as the person said it — "daily at 07:30 in
 * Europe/Berlin" — and never as a UTC instant, so it still means half past
 * seven after the clocks change. `nextRunAt` is the one derived instant, and
 * it is recomputed after every run from the cadence, not advanced by a
 * fixed number of milliseconds.
 *
 * Three actions. A reminder says the text back; a prompt runs an unattended
 * turn with the text as its instruction; the digest is the daily report, kept
 * as a schedule so there is one clock in the process rather than two.
 */

import { Schema } from "effect";

import { AgentConnectionId } from "./agent-invocation";
import { ScheduleId } from "./id";

/** "HH:MM", twenty-four hour, on the person's wall clock. */
export const ClockTime = Schema.String.check(
  Schema.isPattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, {
    message: 'Expected a time such as "07:30"',
  })
);
export type ClockTime = typeof ClockTime.Type;

/** Monday first, as calendars print them. */
export const WEEKDAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export const Weekday = Schema.Literals(WEEKDAYS);
export type Weekday = typeof Weekday.Type;

export const ScheduleCadence = Schema.Union([
  /** One instant, in server milliseconds. */
  Schema.TaggedStruct("once", { at: Schema.Int }),
  Schema.TaggedStruct("daily", { time: ClockTime }),
  Schema.TaggedStruct("weekly", { time: ClockTime, weekday: Weekday }),
]);
export type ScheduleCadence = typeof ScheduleCadence.Type;

/** Said back to the person, on Telegram when paired and in the web stream. */
export const RemindAction = Schema.TaggedStruct("remind", {
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500)),
});
/** Run as an unattended turn: no browser, a small budget, a report afterwards. */
export const PromptAction = Schema.TaggedStruct("prompt", {
  permissions: Schema.optional(
    Schema.Array(Schema.Literals(["email:read", "email:draft"]))
  ),
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000)),
});
export const ScheduleAction = Schema.Union([
  RemindAction,
  Schema.Struct({
    ...PromptAction.fields,
    connectionId: Schema.optional(Schema.NullOr(AgentConnectionId)),
  }),
  Schema.TaggedStruct("digest", {}),
]);
export type ScheduleAction = typeof ScheduleAction.Type;

/** `done` is a once-off that fired; a cadence is only ever active or cancelled. */
export const ScheduleStatus = Schema.Literals(["active", "done", "cancelled"]);
export type ScheduleStatus = typeof ScheduleStatus.Type;

export const Schedule = Schema.Struct({
  action: ScheduleAction,
  cadence: ScheduleCadence,
  createdAt: Schema.Int,
  id: ScheduleId,
  label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  lastRunAt: Schema.NullOr(Schema.Int),
  /** Null once there is no next run: done, or cancelled. */
  nextRunAt: Schema.NullOr(Schema.Int),
  status: ScheduleStatus,
  /** An IANA zone name. The cadence's times are read in it. */
  timezone: Schema.String,
});
export type Schedule = typeof Schedule.Type;
