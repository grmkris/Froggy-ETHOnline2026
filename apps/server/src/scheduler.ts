/**
 * The minute tick that starts digests.
 *
 * A person's digest is due during the local hour they chose, in the zone they
 * chose it in, once per local day. "Once" is remembered in this process, so a
 * restart inside the hour could run a second time; that is a bounded, cheap
 * mistake and the alternative is a table for a bookmark.
 */

import type { DigestSchedule, UserId } from "@froggy/domain";

export interface SchedulerDeps {
  readonly now?: () => number;
  readonly run: (userId: UserId) => Promise<void>;
  readonly scheduled: () => Promise<
    readonly { readonly schedule: DigestSchedule; readonly userId: UserId }[]
  >;
}

export interface LocalClock {
  readonly day: string;
  readonly hour: number;
}

/** "2026-09-05" and 8, in the person's zone. Invalid zones fall back to UTC. */
export const localClock = (at: number, timezone: string): LocalClock => {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      month: "2-digit",
      timeZone: "UTC",
      year: "numeric",
    });
  }
  const parts = new Map(
    formatter.formatToParts(new Date(at)).map((part) => [part.type, part.value])
  );
  const hour = Number(parts.get("hour") ?? "0") % 24;
  return {
    day: `${parts.get("year") ?? "0000"}-${parts.get("month") ?? "00"}-${parts.get("day") ?? "00"}`,
    hour,
  };
};

export const isDue = (schedule: DigestSchedule, at: number): string | null => {
  if (schedule.hour === null) {
    return null;
  }
  const clock = localClock(at, schedule.timezone);
  return clock.hour === schedule.hour ? clock.day : null;
};

export const createDigestScheduler = (deps: SchedulerDeps) => {
  const done = new Map<UserId, string>();
  const now = deps.now ?? Date.now;
  return {
    /** One pass. Never rejects: one person's failure is logged, not fatal. */
    tick: async (): Promise<readonly UserId[]> => {
      const started: UserId[] = [];
      let scheduled: Awaited<ReturnType<SchedulerDeps["scheduled"]>>;
      try {
        scheduled = await deps.scheduled();
      } catch (error) {
        console.warn(
          "digest scheduler could not read schedules:",
          error instanceof Error ? error.message : error
        );
        return started;
      }
      await Promise.all(
        scheduled.map(async ({ schedule, userId }) => {
          const day = isDue(schedule, now());
          if (day === null || done.get(userId) === day) {
            return;
          }
          done.set(userId, day);
          started.push(userId);
          try {
            await deps.run(userId);
          } catch (error) {
            console.warn(
              `digest for ${userId} failed:`,
              error instanceof Error ? error.message : error
            );
          }
        })
      );
      return started;
    },
  };
};
