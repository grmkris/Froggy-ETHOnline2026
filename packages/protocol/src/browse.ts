import {
  ConversationId,
  ProtocolVersion,
  TaskId,
  TaskStatus,
} from "@froggy/domain";
import { Schema } from "effect";

import { TaskOutcome } from "./monitoring";

export const BrowseBudget = Schema.Literals([1, 3, 5]);
export type BrowseBudget = typeof BrowseBudget.Type;

export const BrowseQuote = Schema.Struct({
  taskId: TaskId,
  instruction: Schema.String,
  budgetUsd: BrowseBudget,
  priceUsdMicros: Schema.Int,
  modelAllowanceUsdMicros: Schema.Int,
  executionMs: Schema.Int,
  expiresAt: Schema.Int,
  idempotencyKey: Schema.String,
});
export type BrowseQuote = typeof BrowseQuote.Type;

export const BrowseChallenge = Schema.Struct({
  x402Version: Schema.Int,
  resource: Schema.Struct({
    url: Schema.String,
    description: Schema.optional(Schema.String),
    mimeType: Schema.optional(Schema.String),
  }),
  accepts: Schema.Array(
    Schema.Struct({
      scheme: Schema.String,
      network: Schema.String,
      amount: Schema.String,
      asset: Schema.String,
      payTo: Schema.String,
      maxTimeoutSeconds: Schema.optional(Schema.Int),
      extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    })
  ),
});
export type BrowseChallenge = typeof BrowseChallenge.Type;

export const BrowseQuoteResponse = Schema.Struct({
  ...BrowseChallenge.fields,
  v: ProtocolVersion,
  quote: BrowseQuote,
});

export const BrowsePhase = Schema.Literals([
  "queued",
  "starting",
  "working",
  "awaiting_approval",
  "handing_over",
  "human",
  "stopping",
  "finalizing",
  "done",
  "cancelled",
  "failed",
  "budget_reached",
  "checking",
  "expired",
]);
export type BrowsePhase = typeof BrowsePhase.Type;

export const BrowseActivity = Schema.Struct({
  id: Schema.String.check(Schema.isMaxLength(100)),
  at: Schema.Int,
  label: Schema.String.check(Schema.isMaxLength(160)),
  status: Schema.Literals(["working", "done", "error"]),
});
export type BrowseActivity = typeof BrowseActivity.Type;

/** Public progress only. Provider identifiers and connection credentials stay server-side. */
export const BrowseTaskProgress = Schema.Struct({
  executor: Schema.Literals(["legacy", "hosted"]),
  revision: Schema.Int,
  phase: BrowsePhase,
  conversationId: Schema.NullOr(ConversationId),
  startedAt: Schema.NullOr(Schema.Int),
  finishedAt: Schema.NullOr(Schema.Int),
  refreshedAt: Schema.NullOr(Schema.Int),
  activeMs: Schema.Int,
  activity: Schema.Array(BrowseActivity).check(Schema.isMaxLength(80)),
  controls: Schema.Struct({
    stop: Schema.Boolean,
    takeControl: Schema.Boolean,
    continue: Schema.Boolean,
    forceStop: Schema.Boolean,
    watch: Schema.Boolean,
    reconnect: Schema.optional(Schema.Boolean),
  }),
  stubbed: Schema.Boolean,
});
export type BrowseTaskProgress = typeof BrowseTaskProgress.Type;

export const BrowseTaskView = Schema.Struct({
  id: TaskId,
  requestKey: Schema.optional(
    Schema.NullOr(Schema.String.check(Schema.isMaxLength(200)))
  ),
  kind: Schema.Literal("browse"),
  status: TaskStatus,
  input: Schema.Struct({ instruction: Schema.String }),
  priceUsdMicros: Schema.Int,
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
  error: Schema.NullOr(Schema.String),
  result: Schema.NullOr(
    Schema.Struct({
      text: Schema.optional(Schema.String),
      outcome: Schema.optionalKey(TaskOutcome),
    })
  ),
  browse: Schema.NullOr(BrowseTaskProgress),
});
export type BrowseTaskView = typeof BrowseTaskView.Type;

export const BrowseTaskResponse = Schema.Struct({
  v: ProtocolVersion,
  task: BrowseTaskView,
});
export const BrowseTasksResponse = Schema.Struct({
  v: ProtocolVersion,
  tasks: Schema.Array(BrowseTaskView),
});
export const BrowseTaskControl = Schema.Struct({
  v: ProtocolVersion,
  action: Schema.Literals([
    "stop",
    "take_control",
    "continue",
    "force_stop",
    "reconnect",
  ]),
});
export type BrowseTaskControl = typeof BrowseTaskControl.Type;
