import { describe, expect, test } from "bun:test";

import { composeInstructions, situationLine } from "./prompt";

/** 13 Sep 2026, 15:42:07 UTC. */
const AT = Date.UTC(2026, 8, 13, 15, 42, 7);
const OWN = [
  {
    address: "0x5eca000000000000000000000000000000000344",
    label: "agent_signer",
  },
];
const parts = (
  surface: "web" | "telegram" | "schedule",
  timezone: string | null = "Europe/Berlin"
) => {
  const shared = {
    situation: { at: AT, timezone, surface },
    taskContext: "",
    emailContext: "",
    own: OWN,
    appOrigin: "https://froggy.example",
  };
  return surface === "schedule"
    ? composeInstructions({
        ...shared,
        toolSurface: "schedule",
        instructions: "Job instructions.",
      })
    : composeInstructions({ ...shared, toolSurface: "chat" });
};

describe("situationLine", () => {
  test("names the person's local date, time and zone", () => {
    const line = situationLine({
      at: AT,
      timezone: "Europe/Berlin",
      surface: "web",
    });
    expect(line).toContain("13 Sept 2026");
    expect(line).toContain("17:42");
    expect(line).toContain("(Europe/Berlin)");
    expect(line).toContain("the Froggy web app");
  });

  test("falls back to UTC and asks once when the zone is unknown or invalid", () => {
    for (const timezone of [null, "Mars/Olympus"]) {
      const line = situationLine({ at: AT, timezone, surface: "telegram" });
      expect(line).toContain("15:42 UTC");
      expect(line).toContain("timezone is not known");
      expect(line).toContain("Telegram");
    }
  });
});

describe("composeInstructions", () => {
  test("the web chat narrates for a watching person and offers browse cards", () => {
    const text = parts("web");
    expect(text.startsWith("Today is ")).toBe(true);
    expect(text).toContain("watching live");
    expect(text).toContain("Narrate what you are about to do");
    expect(text).toContain("call browse_task");
    expect(text).not.toContain("On Telegram:");
    expect(text).toContain(OWN[0]?.address ?? "");
  });

  test("Telegram gets short plain lines, the app link, and knows which posts were not its own", () => {
    const text = parts("telegram");
    expect(text).toContain("answering on the person's phone");
    expect(text).toContain("https://froggy.example");
    expect(text).toContain("at most six short lines");
    expect(text).toContain("[Froggy alert]");
    expect(text).not.toContain("watching the page change");
    expect(text).toContain("call browse_task");
  });

  test("every surface is told the words to use and to retry rejected arguments quietly", () => {
    for (const surface of ["web", "telegram"] as const) {
      const text = parts(surface);
      expect(text).toContain("never eip155 ids");
      expect(text).toContain("fix them and call it again without mentioning");
      expect(text).toContain("at most one question");
      expect(text).not.toContain(
        "open that link in the shared browser with browser_navigate"
      );
    }
  });

  test("a job keeps its own instructions, gets the clock, and is not offered a browser", () => {
    const text = parts("schedule");
    expect(text).toContain("Job instructions.");
    expect(text).toContain("unattended scheduled run");
    expect(text).not.toContain("browse_task");
    expect(text).not.toContain("task_report");
    expect(text).not.toContain("You are Froggy, an agent with a wallet");
  });
});

test("shopping preserves purchase intent and real approval boundaries", () => {
  for (const surface of ["web", "telegram"] as const) {
    const text = parts(surface);
    expect(text).toContain("You may spend");
    expect(text).toContain("specific rule and the smallest change");
    expect(text).toContain("HTTP 200 says nothing");
    expect(text).toContain("explicit stop-before-payment instructions");
    expect(text).toContain("Do not invent restrictions");
    expect(text).toContain("raise a limit or approve a spend");
    expect(text).toContain("valid partial observations");
    expect(text).toContain("before offering another budget card");
  }
});

test("mailbox context reaches a paid browse and a job with custom instructions", () => {
  for (const toolSurface of ["browse", "schedule"] as const) {
    const text = composeInstructions({
      situation: { at: AT, timezone: "Europe/Berlin", surface: toolSurface },
      toolSurface,
      taskContext: "",
      emailContext: "Froggy email: shopper@froggy.test",
      own: OWN,
      appOrigin: "https://froggy.example",
      instructions:
        toolSurface === "schedule" ? "Job instructions." : undefined,
    });
    expect(text).toContain("shopper@froggy.test");
    if (toolSurface === "browse") {
      expect(text).toContain("do not ask the person to copy an address");
      expect(text).toContain("use email_wait when available");
      expect(text).toContain("call task_report");
    }
  }
});
