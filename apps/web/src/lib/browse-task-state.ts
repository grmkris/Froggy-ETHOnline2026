import type { BrowsePhase, BrowseTaskView } from "@froggy/protocol";

export const BROWSE_LABELS: Record<BrowsePhase, string> = {
  queued: "Waiting for a browser",
  starting: "Opening your browser",
  working: "Froggy is browsing",
  awaiting_approval: "Waiting for your approval",
  handing_over: "Getting the page ready for you",
  human: "You have control",
  stopping: "Stopping the browser agent",
  finalizing: "Finishing your result",
  done: "Finished browsing",
  cancelled: "Browsing stopped",
  failed: "Browsing needs attention",
  budget_reached: "Browsing budget reached",
  checking: "Checking what happened",
  expired: "Browser session ended",
};
export const taskPhase = (task: BrowseTaskView): BrowsePhase => {
  if (task.browse !== null) {
    return task.browse.phase;
  }
  switch (task.status) {
    case "done": {
      return "done";
    }
    case "cancelled": {
      return "cancelled";
    }
    case "awaiting_approval": {
      return "awaiting_approval";
    }
    case "failed": {
      return "failed";
    }
    case "paused": {
      return "human";
    }
    case "uncertain": {
      return "checking";
    }
    case "running": {
      return "working";
    }
    case "paid":
    case "quoted": {
      return "queued";
    }
  }
  return "queued";
};
export const taskTerminal = (task: BrowseTaskView): boolean =>
  ["done", "cancelled", "failed", "budget_reached"].includes(taskPhase(task));

/** A reconnect snapshot can race a newer event, but cannot rewind a run. */
export const mergeBrowseTasks = (
  current: readonly BrowseTaskView[],
  incoming: readonly BrowseTaskView[]
): readonly BrowseTaskView[] => {
  const tasks = new Map(current.map((task) => [task.id, task]));
  for (const task of incoming) {
    const before = tasks.get(task.id);
    if (before !== undefined) {
      if (taskTerminal(before) && !taskTerminal(task)) {
        continue;
      }
      if (
        before.browse !== null &&
        task.browse !== null &&
        before.browse.revision >= task.browse.revision
      ) {
        continue;
      }
      if (before.updatedAt > task.updatedAt) {
        continue;
      }
    }
    tasks.set(task.id, task);
  }
  return [...tasks.values()]
    .toSorted((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40);
};

/** Human ownership is stable; a quiet browser is not a lost connection. */
export const taskIsStale = (
  task: BrowseTaskView,
  connected: boolean,
  now: number
): boolean => {
  if (taskTerminal(task) || taskPhase(task) === "expired") {
    return false;
  }
  if (!connected) {
    return true;
  }
  const progress = task.browse;
  if (
    progress === null ||
    progress.phase === "human" ||
    progress.phase === "awaiting_approval"
  ) {
    return false;
  }
  const refreshedAt = progress.refreshedAt ?? task.updatedAt;
  return now - refreshedAt > 10_000;
};
