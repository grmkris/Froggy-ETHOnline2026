import { describe, expect, it } from "bun:test";

import { TaskId } from "@froggy/domain";
import type { BrowsePhase, BrowseTaskView } from "@froggy/protocol";

import { initialAppState, reduceApp } from "./app-state";
import {
  mergeBrowseTasks,
  taskTerminal,
  taskIsStale,
} from "./browse-task-state";

const id = TaskId.generate();
const task = (phase: BrowsePhase, revision: number): BrowseTaskView => ({
  id,
  kind: "browse",
  status: phase === "done" ? "done" : "running",
  input: { instruction: "Find green shoes" },
  priceUsdMicros: 1_000_000,
  createdAt: 1,
  updatedAt: revision,
  error: null,
  result: null,
  browse: {
    executor: "hosted",
    revision,
    phase,
    conversationId: null,
    startedAt: 1,
    finishedAt: phase === "done" ? revision : null,
    refreshedAt: revision,
    activeMs: revision,
    activity: [],
    controls: {
      stop: true,
      takeControl: true,
      continue: false,
      forceStop: false,
      watch: true,
    },
    stubbed: true,
  },
});
describe("hosted browser progress", () => {
  it("ignores stale and duplicate events and never rewinds terminal progress", () => {
    const working = task("working", 2);
    expect(mergeBrowseTasks([working], [task("starting", 1)])[0]).toBe(working);
    expect(mergeBrowseTasks([working], [task("working", 2)])[0]).toBe(working);
    const done = task("done", 3);
    expect(mergeBrowseTasks([done], [task("working", 4)])[0]).toBe(done);
  });
  it("restores without a completion notice and announces a live terminal transition once", () => {
    const base = { ...initialAppState, sessionId: "session-a" };
    const restored = reduceApp(base, {
      type: "browse.snapshot",
      sessionId: "session-a",
      tasks: [task("done", 3)],
    });
    expect(restored.notices).toHaveLength(0);
    let active = reduceApp(base, {
      type: "browse.snapshot",
      sessionId: "session-a",
      tasks: [task("working", 2)],
    });
    const event = {
      type: "server",
      at: 4,
      message: { type: "browse.task.updated", v: 1, task: task("done", 3) },
    } as const;
    active = reduceApp(active, event);
    expect(active.notices).toHaveLength(1);
    expect(reduceApp(active, event).notices).toHaveLength(1);
  });
  it("does not apply a prior owner's late HTTP response", () => {
    const state = { ...initialAppState, sessionId: "session-b" };
    expect(
      reduceApp(state, {
        type: "browse.snapshot",
        sessionId: "session-a",
        tasks: [task("working", 1)],
      })
    ).toBe(state);
  });
  it("keeps human handoff and uncertain execution active", () => {
    expect(taskTerminal(task("human", 1))).toBe(false);
    expect(taskTerminal(task("checking", 1))).toBe(false);
    expect(taskTerminal(task("expired", 1))).toBe(false);
    expect(taskTerminal(task("cancelled", 2))).toBe(true);
  });
});

it("distinguishes a quiet human session from missing active progress", () => {
  expect(taskIsStale(task("expired", 1), true, 100_000)).toBe(false);
  const human = task("human", 1);
  expect(taskIsStale(human, true, 100_000)).toBe(false);
  expect(taskIsStale(human, false, 100_000)).toBe(true);
  const starting = task("starting", 1);
  const pending = {
    ...starting,
    browse:
      starting.browse === null
        ? null
        : { ...starting.browse, refreshedAt: null },
  };
  expect(taskIsStale(pending, true, 5000)).toBe(false);
  expect(taskIsStale(pending, true, 20_000)).toBe(true);
});
