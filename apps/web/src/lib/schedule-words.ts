/**
 * A schedule in the person's words: when it runs, and what it does.
 *
 * The cadence is kept as they said it, in their zone, so it is said back
 * the same way; the next run is the one instant, shown on their clock.
 */

import type { Schedule, Weekday } from "@froggy/domain";

const WEEKDAY_WORDS: ReadonlyMap<Weekday, string> = new Map([
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
]);

/** "Once", "Every day at 07:30", "Every Monday at 09:00". */
export const cadenceWords = (cadence: Schedule["cadence"]): string => {
  if (cadence._tag === "daily") {
    return `Every day at ${cadence.time}`;
  }
  if (cadence._tag === "weekly") {
    return `Every ${WEEKDAY_WORDS.get(cadence.weekday) ?? cadence.weekday} at ${cadence.time}`;
  }
  return "Once";
};

/** "Remind: text", "Run: text", or the digest. */
export const actionWords = (action: Schedule["action"]): string => {
  if (action._tag === "remind") {
    return `Remind: ${action.text}`;
  }
  if (action._tag === "prompt") {
    return `Run: ${action.text}`;
  }
  return "The daily digest";
};

/** The next run on the person's clock, in their schedule's zone. */
export const nextRunWords = (schedule: Schedule): string => {
  if (schedule.nextRunAt === null) {
    return schedule.status === "done" ? "Done" : "Cancelled";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: schedule.timezone,
    }).format(new Date(schedule.nextRunAt));
  } catch {
    return new Date(schedule.nextRunAt).toLocaleString();
  }
};
