import { describe, expect, it } from "bun:test";

import { ScheduleId } from "@froggy/domain";
import type { Schedule } from "@froggy/domain";

import { actionWords, cadenceWords, nextRunWords } from "./schedule-words";

const schedule: Schedule = {
  action: { _tag: "remind", text: "check the oven" },
  cadence: { _tag: "daily", time: "07:30" },
  createdAt: 0,
  id: ScheduleId.generate(),
  label: "oven",
  lastRunAt: null,
  nextRunAt: Date.UTC(2026, 8, 8, 5, 30),
  status: "active",
  timezone: "Europe/Berlin",
};

describe("schedule words", () => {
  it("says the cadence as the person set it", () => {
    expect(cadenceWords(schedule.cadence)).toBe("Every day at 07:30");
    expect(
      cadenceWords({ _tag: "weekly", time: "09:00", weekday: "mon" })
    ).toBe("Every Monday at 09:00");
    expect(cadenceWords({ _tag: "once", at: 1 })).toBe("Once");
  });

  it("says what it does", () => {
    expect(actionWords(schedule.action)).toBe("Remind: check the oven");
    expect(actionWords({ _tag: "prompt", text: "check prices" })).toBe(
      "Run: check prices"
    );
    expect(actionWords({ _tag: "digest" })).toBe("The daily digest");
  });

  it("shows the next run in the schedule's zone, or why there is none", () => {
    expect(nextRunWords(schedule)).toContain("7:30");
    expect(nextRunWords({ ...schedule, nextRunAt: null, status: "done" })).toBe(
      "Done"
    );
  });
});
