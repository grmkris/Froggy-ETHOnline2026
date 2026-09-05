import { describe, expect, test } from "bun:test";

import { userId } from "@froggy/domain";

import { createDigestScheduler, isDue, localClock } from "./scheduler";

const ALICE = userId("did:privy:alice");
// 2026-09-05T06:30:00Z: 08:30 in Berlin (CEST), 23:30 the day before in LA.
const AT = Date.UTC(2026, 8, 5, 6, 30);

describe("localClock", () => {
  test("reads the hour and the day in the person's zone", () => {
    expect(localClock(AT, "Europe/Berlin")).toEqual({
      day: "2026-09-05",
      hour: 8,
    });
    expect(localClock(AT, "America/Los_Angeles")).toEqual({
      day: "2026-09-04",
      hour: 23,
    });
  });

  test("falls back to UTC for a zone nobody has heard of", () => {
    expect(localClock(AT, "Mars/Olympus")).toEqual({
      day: "2026-09-05",
      hour: 6,
    });
  });
});

describe("isDue", () => {
  test("is the local day during the chosen hour, and null otherwise", () => {
    expect(isDue({ hour: 8, timezone: "Europe/Berlin" }, AT)).toBe(
      "2026-09-05"
    );
    expect(isDue({ hour: 9, timezone: "Europe/Berlin" }, AT)).toBeNull();
    expect(isDue({ hour: null, timezone: "Europe/Berlin" }, AT)).toBeNull();
  });
});

describe("createDigestScheduler", () => {
  test("runs each person once per local day, however many ticks fall in the hour", async () => {
    const ran: string[] = [];
    let clock = AT;
    const scheduler = createDigestScheduler({
      now: () => clock,
      run: async (id) => {
        await Promise.resolve();
        ran.push(id);
      },
      scheduled: async () => {
        await Promise.resolve();
        return [
          { schedule: { hour: 8, timezone: "Europe/Berlin" }, userId: ALICE },
        ];
      },
    });
    expect(await scheduler.tick()).toEqual([ALICE]);
    clock += 60_000;
    expect(await scheduler.tick()).toEqual([]);
    // The next day, same hour: due again.
    clock += 24 * 60 * 60 * 1000;
    expect(await scheduler.tick()).toEqual([ALICE]);
    expect(ran.length).toBe(2);
  });

  test("a failing run does not stop the others", async () => {
    const bob = userId("did:privy:bob");
    const ran: string[] = [];
    const scheduler = createDigestScheduler({
      now: () => AT,
      run: async (id) => {
        await Promise.resolve();
        if (id === ALICE) {
          throw new Error("no");
        }
        ran.push(id);
      },
      scheduled: async () => {
        await Promise.resolve();
        const schedule = { hour: 8, timezone: "Europe/Berlin" };
        return [
          { schedule, userId: ALICE },
          { schedule, userId: bob },
        ];
      },
    });
    expect(await scheduler.tick()).toEqual([ALICE, bob]);
    expect(ran).toEqual([bob]);
  });
});
