/**
 * When a schedule runs next, and the minute tick that fires the due ones.
 *
 * A cadence is a wall-clock time in the person's zone. The next run is the
 * next instant at which that zone's clock shows that time, found by asking
 * `Intl` what the zone's offset is around the candidate rather than by
 * adding twenty-four hours: on the night the clocks change, "08:00 tomorrow"
 * is twenty-three or twenty-five hours away, and a reminder at seven would
 * be the kind of bug nobody notices until October.
 *
 * The tick claims rows through the store in one statement, so two processes
 * on one database never fire the same row. A claim that is never finished —
 * the process died between claim and finish — goes stale after ten minutes
 * and is fired again: at-least-once, bounded by the job's own budget.
 */

import { WEEKDAYS } from "@froggy/domain";
import type {
  Schedule,
  ScheduleCadence,
  ScheduleId,
  UserId,
  Weekday,
} from "@froggy/domain";
import type { ScheduleWhen } from "@froggy/protocol";
import type { Store } from "@froggy/wallet";

const MINUTE_MS = 60_000;
/** A claim older than this belongs to a process that died mid-run. */
const STALE_CLAIM_MS = 10 * MINUTE_MS;
/** A person mid-turn is retried this long past the due time, then the run is skipped. */
const BUSY_WINDOW_MS = 15 * MINUTE_MS;
const BUSY_RETRY_MS = MINUTE_MS;

const WEEKDAY_NAMES: ReadonlyMap<Weekday, string> = new Map([
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
]);

/** Whether `Intl` knows the zone. Everything below reads it through `Intl`. */
export const isTimezone = (name: string): boolean => {
  try {
    const probe = new Intl.DateTimeFormat("en-CA", { timeZone: name });
    return probe.resolvedOptions().timeZone !== "";
  } catch {
    return false;
  }
};

const formatterFor = (timezone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: isTimezone(timezone) ? timezone : "UTC",
    weekday: "short",
    year: "numeric",
  });

/** A moment as the zone's calendar and clock show it. */
export interface LocalClock {
  /** "2026-09-05". */
  readonly day: string;
  readonly date: number;
  readonly hour: number;
  readonly minute: number;
  readonly month: number;
  readonly second: number;
  readonly weekday: Weekday;
  readonly year: number;
}

/** The person's zone's reading of an instant. Invalid zones fall back to UTC. */
export const localClock = (at: number, timezone: string): LocalClock => {
  const parts = new Map(
    formatterFor(timezone)
      .formatToParts(new Date(at))
      .map((part) => [part.type, part.value])
  );
  const number = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.get(type) ?? "0");
  const year = number("year");
  const month = number("month");
  const date = number("day");
  // Some engines print midnight as "24". The day part is already right.
  const hour = number("hour") % 24;
  const short = (parts.get("weekday") ?? "").slice(0, 3).toLowerCase();
  const weekday = WEEKDAYS.find((name) => name === short) ?? "mon";
  return {
    date,
    day: `${parts.get("year") ?? "0000"}-${parts.get("month") ?? "00"}-${parts.get("day") ?? "00"}`,
    hour,
    minute: number("minute"),
    month,
    second: number("second"),
    weekday,
    year,
  };
};

/** How far the zone's clock is ahead of UTC at `at`, in milliseconds. */
const zoneOffsetMs = (at: number, timezone: string): number => {
  const clock = localClock(at, timezone);
  const asUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.date,
    clock.hour,
    clock.minute,
    clock.second
  );
  return asUtc - Math.floor(at / 1000) * 1000;
};

/**
 * The instant at which the zone's clock shows this date and time.
 *
 * Two passes: the offset at the naive guess, then the offset at the instant
 * that guess produced, which differ only within an hour of a clock change.
 * A time that does not exist (the spring gap) lands an hour late; one that
 * exists twice (the autumn overlap) lands on one of them. Both are minutes
 * a year, and both are better than an exception.
 */
const localToUtc = (
  year: number,
  month: number,
  date: number,
  hour: number,
  minute: number,
  timezone: string
): number => {
  const guess = Date.UTC(year, month - 1, date, hour, minute);
  const first = guess - zoneOffsetMs(guess, timezone);
  return guess - zoneOffsetMs(first, timezone);
};

/** "07:30" as numbers. The schema already refused anything else. */
const parseClockTime = (time: string): readonly [number, number] => {
  const [hour, minute] = time.split(":");
  return [Number(hour ?? "0"), Number(minute ?? "0")];
};

/** Monday-first index of a UTC date's weekday. */
const weekdayIndexOf = (year: number, month: number, date: number): number =>
  (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;

/** The calendar day `days` after a UTC date, as year/month/date. */
const dayAfter = (
  year: number,
  month: number,
  date: number,
  days: number
): readonly [number, number, number] => {
  const moved = new Date(Date.UTC(year, month - 1, date + days));
  return [moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate()];
};

/**
 * The first instant after `after` at which the cadence is due, or null when
 * there is none (a once-off that has passed).
 */
export const nextRunAfter = (
  cadence: ScheduleCadence,
  timezone: string,
  after: number
): number | null => {
  if (cadence._tag === "once") {
    return cadence.at > after ? cadence.at : null;
  }
  const [hour, minute] = parseClockTime(cadence.time);
  const local = localClock(after, timezone);
  // Two candidates: the next matching local day (today, for a daily
  // cadence or a weekly one on its day), and the one after it, in case the
  // first has already passed today.
  const step = cadence._tag === "daily" ? 1 : 7;
  const first =
    cadence._tag === "daily"
      ? 0
      : (WEEKDAYS.indexOf(cadence.weekday) -
          weekdayIndexOf(local.year, local.month, local.date) +
          7) %
        7;
  for (const days of [first, first + step]) {
    const [year, month, date] = dayAfter(
      local.year,
      local.month,
      local.date,
      days
    );
    const candidate = localToUtc(year, month, date, hour, minute, timezone);
    if (candidate > after) {
      return candidate;
    }
  }
  return null;
};

/** The cadence a request asks for, with relative and local times resolved now. */
export const cadenceOf = (
  when: ScheduleWhen,
  timezone: string,
  now: number
): ScheduleCadence => {
  if (when._tag === "in") {
    return { _tag: "once", at: now + when.minutes * MINUTE_MS };
  }
  if (when._tag === "at") {
    // "YYYY-MM-DDTHH:MM", checked by the schema.
    const year = Number(when.local.slice(0, 4));
    const month = Number(when.local.slice(5, 7));
    const date = Number(when.local.slice(8, 10));
    const [hour, minute] = parseClockTime(when.local.slice(11, 16));
    return {
      _tag: "once",
      at: localToUtc(year, month, date, hour, minute, timezone),
    };
  }
  if (when._tag === "daily") {
    return { _tag: "daily", time: when.time };
  }
  return { _tag: "weekly", time: when.time, weekday: when.weekday };
};

/** "Tue 8 Sep, 09:30 (Europe/Berlin)". */
export const formatLocal = (at: number, timezone: string): string => {
  const words = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: isTimezone(timezone) ? timezone : "UTC",
    weekday: "short",
  }).format(new Date(at));
  return `${words} (${timezone})`;
};

/** The cadence in words, for a tool answer or a card. */
export const describeCadence = (
  cadence: ScheduleCadence,
  timezone: string
): string => {
  if (cadence._tag === "once") {
    return `once, at ${formatLocal(cadence.at, timezone)}`;
  }
  if (cadence._tag === "daily") {
    return `every day at ${cadence.time} (${timezone})`;
  }
  return `every ${WEEKDAY_NAMES.get(cadence.weekday) ?? cadence.weekday} at ${cadence.time} (${timezone})`;
};

/** What a schedule does, in the words the tool answers with. */
const actionWords = (schedule: Schedule): string => {
  if (schedule.action._tag === "remind") {
    return "I will remind you on Telegram when it is paired, and in the web stream.";
  }
  if (schedule.action._tag === "prompt") {
    return "It will run unattended, without the browser, and post a report to Telegram and the web stream.";
  }
  return "It is the daily digest.";
};

/** What the model tells the person once a schedule exists. */
export const describeSchedule = (
  schedule: Schedule,
  timezoneDefaulted: boolean
): string => {
  const next =
    schedule.nextRunAt === null
      ? ""
      : ` Next: ${formatLocal(schedule.nextRunAt, schedule.timezone)}.`;
  const zone = timezoneDefaulted
    ? " Timezone assumed UTC; tell me yours and I will reschedule."
    : "";
  return `Scheduled "${schedule.label}" (${schedule.id}): ${describeCadence(schedule.cadence, schedule.timezone)}.${next} ${actionWords(schedule)}${zone}`;
};

/** One line per schedule, for the list. */
export const scheduleLine = (schedule: Schedule): string => {
  const next =
    schedule.nextRunAt === null
      ? schedule.status
      : `next ${formatLocal(schedule.nextRunAt, schedule.timezone)}`;
  return `${schedule.id} "${schedule.label}" [${schedule.action._tag}] ${describeCadence(schedule.cadence, schedule.timezone)} — ${next}`;
};

/** `busy` means the person was mid-turn and nothing ran. */
export type FireOutcome = "busy" | "done";

export interface TickerDeps {
  readonly fire: (userId: UserId, schedule: Schedule) => Promise<FireOutcome>;
  readonly now?: () => number;
  /**
   * A due run that was given up on: the person was busy past the window, or
   * the process was down long enough that firing it now would be pretending
   * it ran on time. `lastRunAt` is left alone so the row does not look fired.
   */
  readonly onMissed?: (
    userId: UserId,
    schedule: Schedule,
    dueAt: number
  ) => Promise<void>;
  readonly staleMs?: number;
  readonly store: Pick<Store, "schedules">;
}

/** A caught value's words, for the log. */
const warn = (label: string, error: Error | string): void => {
  console.warn(label, error instanceof Error ? error.message : error);
};

export const createScheduleTicker = (deps: TickerDeps) => {
  const now = deps.now ?? Date.now;
  const staleMs = deps.staleMs ?? STALE_CLAIM_MS;
  /**
   * When each row first came due, for the busy rule: a retry moves the
   * row's `nextRunAt` a minute out, so the original due time is kept here.
   * In memory on purpose: a restart mid-retry restarts the fifteen minutes,
   * which is bounded and cheap.
   */
  const firstDue = new Map<ScheduleId, number>();

  const settle = async (
    userId: UserId,
    schedule: Schedule,
    claimedAt: number,
    outcome: FireOutcome
  ): Promise<void> => {
    const at = now();
    const due = firstDue.get(schedule.id) ?? schedule.nextRunAt ?? at;
    if (outcome === "busy" && at - due < BUSY_WINDOW_MS) {
      firstDue.set(schedule.id, due);
      await deps.store.schedules.finish(schedule.id, claimedAt, {
        nextRunAt: at + BUSY_RETRY_MS,
        status: "active",
      });
      return;
    }
    firstDue.delete(schedule.id);
    const next = nextRunAfter(schedule.cadence, schedule.timezone, at);
    const missed = outcome === "busy";
    const status = next === null ? "done" : "active";
    await deps.store.schedules.finish(
      schedule.id,
      claimedAt,
      missed
        ? { nextRunAt: next, status }
        : { lastRunAt: at, nextRunAt: next, status }
    );
    if (!missed || deps.onMissed === undefined) {
      return;
    }
    try {
      await deps.onMissed(userId, schedule, due);
    } catch (error) {
      warn(
        `schedule ${schedule.id} miss notice failed:`,
        error instanceof Error ? error : String(error)
      );
    }
  };

  const fireOne = async (
    userId: UserId,
    schedule: Schedule,
    claimedAt: number
  ): Promise<ScheduleId | null> => {
    const due = firstDue.get(schedule.id) ?? schedule.nextRunAt ?? claimedAt;
    if (now() - due >= BUSY_WINDOW_MS) {
      try {
        await settle(userId, schedule, claimedAt, "busy");
      } catch (error) {
        warn(
          `schedule ${schedule.id} could not be finished:`,
          error instanceof Error ? error : String(error)
        );
      }
      return null;
    }
    let outcome: FireOutcome = "done";
    try {
      outcome = await deps.fire(userId, schedule);
    } catch (error) {
      // The failure is the run's; the row still moves on, or a broken job
      // would fire every minute until somebody noticed.
      warn(
        `schedule ${schedule.id} (${schedule.label}) failed:`,
        error instanceof Error ? error : String(error)
      );
    }
    try {
      await settle(userId, schedule, claimedAt, outcome);
    } catch (error) {
      warn(
        `schedule ${schedule.id} could not be finished:`,
        error instanceof Error ? error : String(error)
      );
    }
    return outcome === "busy" ? null : schedule.id;
  };

  return {
    /** One pass over the due rows. Never rejects. Answers the ids that ran. */
    tick: async (): Promise<readonly ScheduleId[]> => {
      let due: Awaited<ReturnType<Store["schedules"]["claimDue"]>>;
      try {
        due = await deps.store.schedules.claimDue(now(), staleMs);
      } catch (error) {
        warn(
          "schedule tick could not claim due rows:",
          error instanceof Error ? error : String(error)
        );
        return [];
      }
      const fired = await Promise.all(
        due.map(
          async ({ schedule, userId, claimedAt }) =>
            await fireOne(userId, schedule, claimedAt)
        )
      );
      return fired.filter((id): id is ScheduleId => id !== null);
    },
  };
};
