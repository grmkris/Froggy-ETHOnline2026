import type { HostedEvent } from "@froggy/browser";
import { ConversationId, quotePaymentState } from "@froggy/domain";
import type { Task } from "@froggy/domain";
import { BrowseActivity, BrowsePhase } from "@froggy/protocol";
import type { BrowseTaskProgress, BrowseTaskView } from "@froggy/protocol";
import { Schema } from "effect";

const ProviderId = Schema.String.check(Schema.isUUID());
/** Kept inside the task result document; never serialized as a public result. */
export const HostedBrowseState = Schema.Struct({
  revision: Schema.Int,
  phase: BrowsePhase,
  stage: Schema.Literals(["bootstrap", "task"]),
  dispatch: Schema.Literals(["none", "creating", "created"]),
  providerRunId: Schema.NullOr(ProviderId),
  providerSessionId: Schema.NullOr(ProviderId),
  providerWorkspaceId: Schema.NullOr(ProviderId),
  browserId: Schema.NullOr(ProviderId),
  unexpectedBrowserId: Schema.NullOr(ProviderId),
  profileId: Schema.NullOr(ProviderId),
  cursor: Schema.Int,
  attempt: Schema.Int,
  released: Schema.Boolean,
  attached: Schema.Boolean,
  settled: Schema.Boolean,
  spentUsdMicros: Schema.Int,
  intent: Schema.NullOr(Schema.Literals(["take", "stop", "budget"])),
  intentAt: Schema.NullOr(Schema.Int),
  cancelSent: Schema.Boolean,
  startedAt: Schema.NullOr(Schema.Int),
  finishedAt: Schema.NullOr(Schema.Int),
  refreshedAt: Schema.NullOr(Schema.Int),
  clockAt: Schema.Int,
  activeMs: Schema.Int,
  activity: Schema.Array(BrowseActivity).check(Schema.isMaxLength(80)),
  text: Schema.String.check(Schema.isMaxLength(16_000)),
});
export type HostedBrowseState = typeof HostedBrowseState.Type;
export const hostedState = (task: Task): HostedBrowseState | null => {
  const parsed = Schema.decodeUnknownResult(
    Schema.Struct({ hosted: HostedBrowseState })
  )(task.result);
  return parsed._tag === "Success" ? parsed.success.hosted : null;
};
export const hostedTask = (task: Task): boolean =>
  task.kind === "browse" && task.input["executor"] === "hosted";
export const browseFinished = (task: Task): boolean =>
  ["done", "failed", "cancelled"].includes(task.status);
export const initialHostedState = (now: number): HostedBrowseState => ({
  revision: 0,
  phase: "queued",
  stage: "bootstrap",
  dispatch: "none",
  providerRunId: null,
  providerSessionId: null,
  providerWorkspaceId: null,
  browserId: null,
  unexpectedBrowserId: null,
  profileId: null,
  cursor: 0,
  attempt: 0,
  released: false,
  attached: false,
  settled: false,
  spentUsdMicros: 0,
  intent: null,
  intentAt: null,
  cancelSent: false,
  startedAt: null,
  finishedAt: null,
  refreshedAt: null,
  clockAt: now,
  activeMs: 0,
  activity: [],
  text: "",
});

const BrowserReady = Schema.Struct({ browser_session_id: ProviderId });
const ToolEvent = Schema.Struct({
  type: Schema.Literal("tool_use"),
  part: Schema.Struct({
    type: Schema.Literal("tool"),
    tool: Schema.String,
    callID: Schema.String,
    state: Schema.Struct({
      status: Schema.String,
      input: Schema.optional(
        Schema.Struct({ description: Schema.optional(Schema.String) })
      ),
    }),
  }),
});

/** Classify, never copy, model text: descriptions can contain private page data. */
const activityLabel = (description: string): string => {
  if (/\b(?:navigate|open|visit|goto)\b/iu.test(description)) {
    return "Opening a page";
  }
  if (/\b(?:click|select|press)\b/iu.test(description)) {
    return "Interacting with the page";
  }
  if (/\b(?:type|fill|enter)\b/iu.test(description)) {
    return "Filling in the page";
  }
  if (/\b(?:search|find|look)\b/iu.test(description)) {
    return "Looking for a match";
  }
  if (/\b(?:wait|load)\b/iu.test(description)) {
    return "Waiting for the page";
  }
  return "Checking the page";
};

const activityStatus = (status: string): "done" | "error" | "working" => {
  if (status === "completed") {
    return "done";
  }
  return status === "error" ? "error" : "working";
};
export const browseInstruction = (task: Task): string => {
  const decoded = Schema.decodeUnknownResult(Schema.String)(
    task.input["instruction"]
  );
  return decoded._tag === "Success"
    ? decoded.success.slice(0, 8000)
    : "Browsing task";
};

/** Ordered cursor and stable call ids make repeated pages and tool updates harmless. */
export const applyHostedEvent = (
  state: HostedBrowseState,
  event: HostedEvent,
  now: number
): HostedBrowseState => {
  if (event.runId !== state.providerRunId || event.id <= state.cursor) {
    return state;
  }
  let next: HostedBrowseState = { ...state, cursor: event.id };
  if (event.type === "worker.session_released") {
    return { ...next, released: true };
  }
  if (event.type === "browser.ready" || event.type === "browser.reattached") {
    const ready = Schema.decodeUnknownResult(BrowserReady)(event.data);
    if (ready._tag === "Success") {
      next = { ...next, browserId: ready.success.browser_session_id };
    }
  }
  if (event.type !== "core.event" || state.stage === "bootstrap") {
    return next;
  }
  const decoded = Schema.decodeUnknownResult(ToolEvent)(event.data);
  if (
    decoded._tag === "Failure" ||
    decoded.success.part.tool !== "browser_execute"
  ) {
    return next;
  }
  const { part } = decoded.success;
  const id = `${state.attempt}:${part.callID}`.slice(0, 100);
  const previous = next.activity.find((row) => row.id === id);
  if (previous?.status === "done" || previous?.status === "error") {
    return next;
  }
  const parsedAt = Date.parse(event.ts);
  const row: typeof BrowseActivity.Type = {
    id,
    at: Number.isFinite(parsedAt) ? parsedAt : now,
    label: activityLabel(part.state.input?.description ?? ""),
    status: activityStatus(part.state.status),
  };
  return {
    ...next,
    activity: [...next.activity.filter((entry) => entry.id !== id), row].slice(
      -80
    ),
  };
};

const legacyBrowseProgress = (
  task: Task,
  now: number
): BrowseTaskProgress | null => {
  if (hostedTask(task)) {
    return null;
  }
  const phases = {
    quoted: "queued",
    paid: "starting",
    running: "working",
    paused: "human",
    awaiting_approval: "awaiting_approval",
    uncertain: "checking",
    done: "done",
    failed: "failed",
    cancelled: "cancelled",
  } as const;
  const progress = Schema.decodeUnknownResult(
    Schema.Struct({ progress: Schema.Struct({ activeMs: Schema.Int }) })
  )(task.result);
  const origin = Schema.decodeUnknownResult(ConversationId)(
    task.input["conversationId"]
  );
  const terminal = browseFinished(task);
  return {
    executor: "legacy",
    revision: now,
    phase: phases[task.status],
    conversationId: origin._tag === "Success" ? origin.success : null,
    startedAt: task.runId === null ? null : task.createdAt,
    finishedAt: terminal ? task.updatedAt : null,
    refreshedAt: now,
    activeMs:
      progress._tag === "Success" ? progress.success.progress.activeMs : 0,
    activity: [],
    stubbed: task.input["stubbed"] === true,
    controls: {
      stop: task.status === "running" || task.status === "paused",
      takeControl: task.status === "running",
      continue: task.status === "paused",
      forceStop: false,
      watch: task.runId !== null,
    },
  };
};

const publicBrowseProgress = (
  task: Task,
  now: number,
  awaiting = false
): BrowseTaskProgress | null => {
  const state = hostedState(task);
  if (state === null) {
    return legacyBrowseProgress(task, now);
  }
  const terminal = browseFinished(task);
  const handover = state.intent !== null;
  const phase =
    awaiting && !handover && !terminal ? "awaiting_approval" : state.phase;
  const origin = Schema.decodeUnknownResult(ConversationId)(
    task.input["conversationId"]
  );
  return {
    executor: "hosted",
    revision: state.revision,
    phase,
    conversationId: origin._tag === "Success" ? origin.success : null,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    refreshedAt: state.refreshedAt,
    activeMs: state.activeMs,
    activity: state.activity,
    stubbed: task.input["stubbed"] === true,
    controls: {
      stop: !terminal && !handover,
      reconnect: phase === "expired" && !terminal,
      takeControl:
        !terminal && state.attached && !handover && phase !== "human",
      continue:
        !terminal && phase === "human" && state.released && state.settled,
      forceStop:
        !terminal &&
        handover &&
        state.browserId !== null &&
        state.intentAt !== null &&
        now - state.intentAt >= 15_000,
      watch: state.attached && state.browserId !== null,
    },
  };
};

/** Also used by HTTP snapshots. No provider metadata, payment proof or raw tool output. */
export const publicBrowseTask = (
  task: Task,
  now: number,
  awaiting = false
): BrowseTaskView => {
  const state = hostedState(task);
  const legacy = Schema.decodeUnknownResult(
    Schema.Struct({
      text: Schema.optional(Schema.String),
    })
  )(task.result);
  const result = legacy._tag === "Success" ? legacy.success : null;
  const pendingQuote =
    task.status === "quoted" && quotePaymentState(task) !== null;
  return {
    id: task.id,
    requestKey:
      task.idempotencyKey !== null && task.idempotencyKey.length <= 200
        ? task.idempotencyKey
        : null,
    kind: "browse",
    status: pendingQuote ? "uncertain" : task.status,
    input: {
      instruction: browseInstruction(task),
    },
    priceUsdMicros: task.priceUsdMicros,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    error: pendingQuote
      ? "A browser payment is awaiting confirmation. Do not sign or purchase again."
      : task.error,
    result: state === null ? result : { text: state.text },
    browse: publicBrowseProgress(task, now, awaiting),
  };
};
