/**
 * TaskStatus to the mascot's five moods, and the COPY sentence beside it.
 *
 * The frog carries mood; the words carry the fact. `uncertain` is stopped,
 * never a failure colour and never a celebration, because a pending payment
 * is not a failed one.
 */

import type { TaskStatus } from "@froggy/domain";
import type { FrogPose } from "@froggy/ui/components/frog-mark";

const POSE: Record<TaskStatus, FrogPose> = {
  cancelled: "stopped",
  awaiting_approval: "needs-user",
  done: "success",
  failed: "stopped",
  paid: "working",
  paused: "idle",
  quoted: "needs-user",
  running: "working",
  uncertain: "stopped",
};

const COPY: Record<TaskStatus, string> = {
  cancelled: "Browsing stopped.",
  awaiting_approval: "One thing needs you.",
  done: "Done, and confirmed.",
  failed: "This failed. Nothing was paid.",
  paid: "Working on it.",
  paused: "Paused. It will not resume on its own.",
  quoted: "One thing needs you.",
  running: "Working on it.",
  uncertain: "Outcome not yet known.",
};

/** User-stop is not a TaskStatus; the words sit next to the stopped pose. */
export const STOPPED_BY_YOU = "Stopped. Nothing was submitted.";

export const poseForTask = (status: TaskStatus): FrogPose => POSE[status];

export const copyForTask = (status: TaskStatus): string => COPY[status];

/**
 * Home has several facts rather than one task. Map the most urgent onto the
 * table: a decision first, then work in progress, then idle.
 */
export const poseForHome = (needsUser: number, busy: boolean): FrogPose => {
  if (needsUser > 0) {
    return poseForTask("awaiting_approval");
  }
  if (busy) {
    return poseForTask("running");
  }
  return poseForTask("paused");
};

export const copyForHome = (needsUser: number, busy: boolean): string => {
  if (needsUser > 1) {
    return `${needsUser} things need you.`;
  }
  if (needsUser > 0) {
    return copyForTask("awaiting_approval");
  }
  if (busy) {
    return copyForTask("running");
  }
  return "Nothing needs you.";
};
