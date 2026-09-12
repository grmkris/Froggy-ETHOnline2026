import { describe, expect, test } from "bun:test";

import { ScheduleId, userId } from "@froggy/domain";
import type { Schedule } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";

import {
  cadenceOf,
  createScheduleTicker,
  describeCadence,
  describeSchedule,
  isTimezone,
  localClock,
  nextRunAfter,
  scheduleLine,
} from "./schedules";

const ALICE = userId("did:privy:alice");
// 2026-09-05T06:30:00Z: 08:30 in Berlin (CEST), 23:30 the day before in LA.
const AT = Date.UTC(2026, 8, 5, 6, 30);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("localClock", () => {
  test("reads the day, the hour and the weekday in the person's zone", () => {
    expect(localClock(AT, "Europe/Berlin")).toMatchObject({
      day: "2026-09-05",
      hour: 8,
      minute: 30,
      weekday: "sat",
    });
    expect(localClock(AT, "America/Los_Angeles")).toMatchObject({
      day: "2026-09-04",
      hour: 23,
      weekday: "fri",
    });
  });

  test("falls back to UTC for a zone nobody has heard of", () => {
    expect(localClock(AT, "Mars/Olympus")).toMatchObject({
      day: "2026-09-05",
      hour: 6,
    });
    expect(isTimezone("Mars/Olympus")).toBe(false);
    expect(isTimezone("Europe/Berlin")).toBe(true);
  });
});

describe("nextRunAfter", () => {
  test("a once-off is its instant while that is ahead, and nothing afterwards", () => {
    expect(nextRunAfter({ _tag: "once", at: AT + MINUTE }, "UTC", AT)).toBe(
      AT + MINUTE
    );
    expect(nextRunAfter({ _tag: "once", at: AT }, "UTC", AT)).toBeNull();
  });

  test("daily at eight is tomorrow in Berlin and today in Los Angeles", () => {
    const daily = { _tag: "daily", time: "08:00" } as const;
    // 08:30 CEST has passed eight: tomorrow 08:00 CEST is 06:00Z.
    expect(nextRunAfter(daily, "Europe/Berlin", AT)).toBe(
      Date.UTC(2026, 8, 6, 6, 0)
    );
    // 23:30 PDT on the 4th: the 5th at 08:00 PDT is 15:00Z.
    expect(nextRunAfter(daily, "America/Los_Angeles", AT)).toBe(
      Date.UTC(2026, 8, 5, 15, 0)
    );
  });

  test("keeps eight o'clock across the Berlin clock change on 2026-10-25", () => {
    const daily = { _tag: "daily", time: "08:00" } as const;
    // 08:30 CEST on the 24th. The 25th is the morning the clocks go back.
    const saturday = Date.UTC(2026, 9, 24, 6, 30);
    const sunday = nextRunAfter(daily, "Europe/Berlin", saturday);
    expect(sunday).toBe(Date.UTC(2026, 9, 25, 7, 0));
    const monday = nextRunAfter(daily, "Europe/Berlin", sunday ?? 0);
    expect(monday).toBe(Date.UTC(2026, 9, 26, 7, 0));
    // Twenty-five hours between Saturday's and Sunday's eight, then twenty-four.
    expect((sunday ?? 0) - Date.UTC(2026, 9, 24, 6, 0)).toBe(25 * HOUR);
    expect((monday ?? 0) - (sunday ?? 0)).toBe(24 * HOUR);
  });

  test("weekly finds the next matching weekday, or the one after if today's has passed", () => {
    const monday = { _tag: "weekly", time: "09:00", weekday: "mon" } as const;
    // Saturday the 5th: Monday the 7th, 09:00 CEST.
    expect(nextRunAfter(monday, "Europe/Berlin", AT)).toBe(
      Date.UTC(2026, 8, 7, 7, 0)
    );
    const saturday = { _tag: "weekly", time: "08:00", weekday: "sat" } as const;
    // Saturday 08:30 CEST: this Saturday's eight has gone; next week's.
    expect(nextRunAfter(saturday, "Europe/Berlin", AT)).toBe(
      Date.UTC(2026, 8, 12, 6, 0)
    );
    // In LA it is still Friday, so Saturday 08:00 PDT is tomorrow.
    expect(nextRunAfter(saturday, "America/Los_Angeles", AT)).toBe(
      Date.UTC(2026, 8, 5, 15, 0)
    );
  });
});

describe("cadenceOf", () => {
  test("resolves a delay and a local time, and keeps a cadence as said", () => {
    expect(cadenceOf({ _tag: "in", minutes: 2 }, "UTC", AT)).toEqual({
      _tag: "once",
      at: AT + 2 * MINUTE,
    });
    expect(
      cadenceOf({ _tag: "at", local: "2026-09-08T07:30" }, "Europe/Berlin", AT)
    ).toEqual({ _tag: "once", at: Date.UTC(2026, 8, 8, 5, 30) });
    expect(cadenceOf({ _tag: "daily", time: "07:30" }, "UTC", AT)).toEqual({
      _tag: "daily",
      time: "07:30",
    });
    expect(
      describeCadence(
        { _tag: "weekly", time: "09:00", weekday: "mon" },
        "Europe/Berlin"
      )
    ).toBe("every Monday at 09:00 (Europe/Berlin)");
    expect(describeCadence({ _tag: "once", at: AT }, "Europe/Berlin")).toBe(
      "once, at Sat 5 Sept, 08:30 (Europe/Berlin)"
    );
  });
});

const reminder = (
  cadence: Schedule["cadence"],
  nextRunAt: number,
  timezone = "Europe/Berlin"
): Schedule => ({
  action: { _tag: "remind", text: "check the oven" },
  cadence,
  createdAt: AT - HOUR,
  id: ScheduleId.generate(),
  label: "oven",
  lastRunAt: null,
  nextRunAt,
  status: "active",
  timezone,
});

describe("describeSchedule and scheduleLine", () => {
  test("tell the person the label, the cadence, the next local time, what happens, and a defaulted zone", () => {
    const once = reminder(
      { _tag: "once", at: AT + 2 * MINUTE },
      AT + 2 * MINUTE
    );
    const said = describeSchedule(once, true);
    expect(said).toContain('"oven"');
    expect(said).toContain(once.id);
    expect(said).toContain("Next: Sat 5 Sept, 08:32 (Europe/Berlin)");
    expect(said).toContain("remind you on Telegram");
    expect(said).toContain("Timezone assumed UTC");
    const prompt: Schedule = {
      ...reminder({ _tag: "daily", time: "07:30" }, AT),
      action: { _tag: "prompt", text: "check rates" },
      label: "rates",
    };
    expect(describeSchedule(prompt, false)).toContain("run unattended");
    expect(describeSchedule(prompt, false)).not.toContain("assumed UTC");
    const line = scheduleLine({ ...once, nextRunAt: null, status: "done" });
    expect(line).toContain("[remind]");
    expect(line).toContain("— done");
  });
});

describe("createScheduleTicker", () => {
  test("a due once-off fires and becomes done; a daily one rolls to tomorrow", async () => {
    const store = memoryStore();
    const once = reminder({ _tag: "once", at: AT }, AT);
    const daily = reminder({ _tag: "daily", time: "08:30" }, AT);
    await store.schedules.create(ALICE, once);
    await store.schedules.create(ALICE, daily);
    const fired: string[] = [];
    const ticker = createScheduleTicker({
      fire: async (_userId, schedule) => {
        await Promise.resolve();
        fired.push(schedule.id);
        return "done";
      },
      now: () => AT,
      store,
    });
    const ran = await ticker.tick();
    expect(ran.toSorted()).toEqual([once.id, daily.id].toSorted());
    expect(fired).toHaveLength(2);
    const rows = await store.schedules.list(ALICE);
    expect(rows.find((row) => row.id === once.id)).toMatchObject({
      lastRunAt: AT,
      nextRunAt: null,
      status: "done",
    });
    expect(rows.find((row) => row.id === daily.id)).toMatchObject({
      lastRunAt: AT,
      nextRunAt: Date.UTC(2026, 8, 6, 6, 30),
      status: "active",
    });
    expect(await ticker.tick()).toEqual([]);
  });

  test("a busy person is retried a minute later, until the run happens", async () => {
    const store = memoryStore();
    const once = reminder({ _tag: "once", at: AT }, AT);
    await store.schedules.create(ALICE, once);
    let clock = AT;
    let busy = true;
    const ticker = createScheduleTicker({
      fire: async () => {
        await Promise.resolve();
        return busy ? "busy" : "done";
      },
      now: () => clock,
      store,
    });
    expect(await ticker.tick()).toEqual([]);
    const [retry] = await store.schedules.list(ALICE);
    expect(retry).toMatchObject({
      lastRunAt: null,
      nextRunAt: AT + MINUTE,
      status: "active",
    });
    clock = AT + 30_000;
    expect(await ticker.tick()).toEqual([]);
    clock = AT + MINUTE;
    busy = false;
    expect(await ticker.tick()).toEqual([once.id]);
    const [finished] = await store.schedules.list(ALICE);
    expect(finished?.status).toBe("done");
  });

  test("a person busy for the whole window is skipped, not retried forever", async () => {
    const store = memoryStore();
    const once = reminder({ _tag: "once", at: AT }, AT);
    await store.schedules.create(ALICE, once);
    let clock = AT;
    const missed: { dueAt: number; id: string }[] = [];
    const ticker = createScheduleTicker({
      fire: async () => {
        await Promise.resolve();
        return "busy";
      },
      now: () => clock,
      onMissed: async (_userId, schedule, dueAt) => {
        await Promise.resolve();
        missed.push({ dueAt, id: schedule.id });
      },
      store,
    });
    await ticker.tick();
    clock = AT + 16 * MINUTE;
    await ticker.tick();
    const [skipped] = await store.schedules.list(ALICE);
    expect(skipped).toMatchObject({
      lastRunAt: null,
      status: "done",
    });
    expect(missed).toEqual([{ dueAt: AT, id: once.id }]);
  });

  test("a tick far past due is missed without firing, and lastRunAt stays unset", async () => {
    const store = memoryStore();
    const once = reminder({ _tag: "once", at: AT }, AT);
    await store.schedules.create(ALICE, once);
    const fired: string[] = [];
    const notices: string[] = [];
    const ticker = createScheduleTicker({
      fire: async (_userId, schedule) => {
        await Promise.resolve();
        fired.push(schedule.id);
        return "done";
      },
      now: () => AT + 16 * MINUTE,
      onMissed: async (_userId, schedule) => {
        await Promise.resolve();
        notices.push(schedule.id);
      },
      store,
    });
    expect(await ticker.tick()).toEqual([]);
    expect(fired).toEqual([]);
    expect(notices).toEqual([once.id]);
    const [skipped] = await store.schedules.list(ALICE);
    expect(skipped).toMatchObject({
      lastRunAt: null,
      nextRunAt: null,
      status: "done",
    });
  });

  test("two tickers on one store fire a row once; a stale claim fires again", async () => {
    const store = memoryStore();
    const once = reminder({ _tag: "once", at: AT }, AT);
    await store.schedules.create(ALICE, once);
    const fired: string[] = [];
    // Held open: the second ticker runs while the first is mid-fire.
    const gate = Promise.withResolvers<null>();
    const deps = {
      fire: async (_userId: typeof ALICE, schedule: Schedule) => {
        fired.push(schedule.id);
        await gate.promise;
        return "done" as const;
      },
      now: () => AT,
      store,
    };
    const first = createScheduleTicker(deps).tick();
    const second = createScheduleTicker(deps).tick();
    await Promise.resolve();
    expect(await second).toEqual([]);
    gate.resolve(null);
    expect(await first).toEqual([once.id]);
    expect(fired).toEqual([once.id]);

    // A claim that was never finished: the row is due again after staleMs.
    const abandoned = reminder({ _tag: "once", at: AT }, AT);
    await store.schedules.create(ALICE, abandoned);
    const never = createScheduleTicker({
      fire: async () => await Promise.withResolvers<"done">().promise,
      now: () => AT,
      staleMs: 5 * MINUTE,
      store,
    });
    void never.tick();
    await Promise.resolve();
    const later = createScheduleTicker({
      fire: async () => {
        await Promise.resolve();
        return "done";
      },
      now: () => AT + 6 * MINUTE,
      staleMs: 5 * MINUTE,
      store,
    });
    expect(await later.tick()).toEqual([abandoned.id]);
  });
});
