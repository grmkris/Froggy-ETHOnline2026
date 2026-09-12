import { describe, expect, it } from "bun:test";

import type { TaskStatus } from "@froggy/domain";
import type { FrogPose } from "@froggy/ui/components/frog-mark";

import {
  copyForHome,
  copyForTask,
  poseForHome,
  poseForTask,
  STOPPED_BY_YOU,
} from "./frog-pose";

const STATUSES: readonly TaskStatus[] = [
  "quoted",
  "paid",
  "running",
  "paused",
  "awaiting_approval",
  "done",
  "failed",
  "uncertain",
];

const POSES: Record<TaskStatus, FrogPose> = {
  quoted: "needs-user",
  paid: "working",
  running: "working",
  paused: "idle",
  awaiting_approval: "needs-user",
  done: "success",
  failed: "stopped",
  uncertain: "stopped",
};

const COPY: Record<TaskStatus, string> = {
  quoted: "One thing needs you.",
  paid: "Working on it.",
  running: "Working on it.",
  paused: "Paused. It will not resume on its own.",
  awaiting_approval: "One thing needs you.",
  done: "Done, and confirmed.",
  failed: "This failed. Nothing was paid.",
  uncertain: "Outcome not yet known.",
};

describe("frog pose from TaskStatus", () => {
  it("maps every status to a contract pose and a COPY sentence", () => {
    for (const status of STATUSES) {
      expect(poseForTask(status)).toBe(POSES[status]);
      expect(copyForTask(status)).toBe(COPY[status]);
    }
  });

  it("renders uncertain as stopped, never a success", () => {
    expect(poseForTask("uncertain")).toBe("stopped");
    expect(poseForTask("uncertain")).not.toBe("success");
    expect(copyForTask("uncertain")).toBe("Outcome not yet known.");
    expect(copyForTask("failed")).toBe("This failed. Nothing was paid.");
    expect(STOPPED_BY_YOU).toBe("Stopped. Nothing was submitted.");
  });

  it("picks Home's pose from the most urgent fact", () => {
    expect(poseForHome(1, false)).toBe("needs-user");
    expect(copyForHome(1, false)).toBe("One thing needs you.");
    expect(copyForHome(2, true)).toBe("2 things need you.");
    expect(poseForHome(0, true)).toBe("working");
    expect(copyForHome(0, true)).toBe("Working on it.");
    expect(poseForHome(0, false)).toBe("idle");
    expect(copyForHome(0, false)).toBe("Nothing needs you.");
  });
});
