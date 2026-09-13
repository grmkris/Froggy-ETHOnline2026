import { describe, expect, test } from "bun:test";

import { ScheduleId } from "@froggy/domain";
import type { Schedule } from "@froggy/domain";

import { digestJob, promptJob } from "./jobs";

const ORACLE = "http://localhost:3000/oracle/snapshot";

describe("promptJob", () => {
  test("names the label, the instruction, when it was set and the cadence, with no browser tool", () => {
    const schedule: Schedule = {
      action: {
        _tag: "prompt",
        text: "Check USDC borrow rates and tell me if any is under 3%.",
      },
      cadence: { _tag: "weekly", time: "09:00", weekday: "mon" },
      createdAt: Date.UTC(2026, 8, 5, 6, 30),
      id: ScheduleId.generate(),
      label: "Monday rates",
      lastRunAt: null,
      nextRunAt: Date.UTC(2026, 8, 7, 7, 0),
      status: "active",
      timezone: "Europe/Berlin",
    };
    const job = promptJob(schedule, ORACLE);
    expect(job.instructions).toContain('"Monday rates"');
    expect(job.instructions).toContain("under 3%");
    expect(job.instructions).toContain("Sat 5 Sept, 08:30 (Europe/Berlin)");
    expect(job.instructions).toContain("every Monday at 09:00 (Europe/Berlin)");
    expect(job.instructions).toContain(ORACLE);
    expect(job.scheduleId).toBe(schedule.id);
    expect(job.surface).toBe("schedule");
    expect(job.title).toBe("Monday rates");
    expect(job.tools).toContain("notify");
    expect(job.tools.some((tool) => tool.startsWith("browser_"))).toBe(false);
    expect(job.budgetUsdMicros).toBe(250_000);
  });

  test("the digest keeps its three tools and five cents", () => {
    const job = digestJob(ORACLE);
    expect(job.tools).toEqual(["graph_query", "x402_fetch", "wallet_status"]);
    expect(job.budgetUsdMicros).toBe(50_000);
    expect(job.surface).toBe("digest");
    expect(job.scheduleId).toBeNull();
  });
  test("scheduled inbox access is explicit and never adds draft permission implicitly", () => {
    const schedule: Schedule = {
      action: {
        _tag: "prompt",
        text: "Check the inbox",
        permissions: ["email:read"],
      },
      cadence: { _tag: "daily", time: "09:00" },
      createdAt: 0,
      id: ScheduleId.generate(),
      label: "Inbox",
      lastRunAt: null,
      nextRunAt: 1,
      status: "active",
      timezone: "UTC",
    };
    expect(promptJob(schedule, ORACLE).tools).toContain("email_read");
    expect(promptJob(schedule, ORACLE).tools).not.toContain("email_draft");
    expect(
      promptJob(
        { ...schedule, action: { _tag: "prompt", text: "Check the inbox" } },
        ORACLE
      ).tools
    ).not.toContain("email_read");
  });
});
