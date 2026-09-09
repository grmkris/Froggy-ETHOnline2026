import { Schema } from "effect";

import { AgentConnectionId } from "./agent-invocation";
import {
  ApprovalId,
  AgentInvocationId,
  ArtifactId,
  ConversationId,
  ExecutionId,
  MessageId,
  PurchaseId,
  ReceiptId,
  RunId,
  TaskId,
  ActivityEventId,
} from "./id";
import { Receipt } from "./receipt";

export const HistorySource = Schema.Literals([
  "web",
  "telegram",
  "agent",
  "schedule",
]);
export const HistoryStatus = Schema.Literals([
  "accepted",
  "running",
  "waiting",
  "completed",
  "failed",
  "stopped",
  "interrupted",
  "uncertain",
]);
const fields = {
  v: Schema.Literal(1),
  revision: Schema.Int,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  source: HistorySource,
};
export const Conversation = Schema.Struct({
  ...fields,
  kind: Schema.Literal("conversation"),
  id: ConversationId,
  title: Schema.String,
  preview: Schema.String,
  externalKey: Schema.NullOr(Schema.String),
  archived: Schema.Boolean,
  latestStatus: Schema.optional(HistoryStatus),
});
export type Conversation = typeof Conversation.Type;
export const HistoryMessage = Schema.Struct({
  ...fields,
  kind: Schema.Literal("message"),
  id: MessageId,
  conversationId: ConversationId,
  runId: Schema.NullOr(RunId),
  role: Schema.Literals(["user", "assistant"]),
  clientId: Schema.String,
  parts: Schema.Array(Schema.Json),
  status: HistoryStatus,
  delivery: Schema.Literals(["saved", "pending", "delivered", "uncertain"]),
  recovered: Schema.Boolean,
  truncated: Schema.Boolean,
});
export type HistoryMessage = typeof HistoryMessage.Type;
const HistoryWait = Schema.Struct({
  id: ApprovalId,
  expiresAt: Schema.Int,
  request: Schema.Json,
  resolution: Schema.NullOr(Schema.String),
});
export const HistoryRun = Schema.Struct({
  ...fields,
  kind: Schema.Literal("run"),
  id: RunId,
  conversationId: ConversationId,
  triggerMessageId: MessageId,
  assistantMessageId: MessageId,
  status: HistoryStatus,
  leaseEpoch: Schema.Int,
  leaseExpiresAt: Schema.Number,
  finishedAt: Schema.NullOr(Schema.Number),
  error: Schema.NullOr(Schema.String),
  waits: Schema.Array(HistoryWait),
});
export type HistoryRun = typeof HistoryRun.Type;
export const HistoryExecution = Schema.Struct({
  ...fields,
  kind: Schema.Literal("execution"),
  id: ExecutionId,
  conversationId: Schema.NullOr(ConversationId),
  runId: Schema.NullOr(RunId),
  invocationId: Schema.NullOr(AgentInvocationId),
  connectionId: Schema.NullOr(AgentConnectionId),
  toolCallId: Schema.String,
  name: Schema.String,
  input: Schema.String,
  result: Schema.String,
  truncated: Schema.Boolean,
  redacted: Schema.Boolean,
  status: HistoryStatus,
  outcome: Schema.String,
  finishedAt: Schema.NullOr(Schema.Number),
  taskId: Schema.NullOr(TaskId),
  purchaseId: Schema.NullOr(PurchaseId),
  receiptIds: Schema.Array(ReceiptId),
  artifactIds: Schema.Array(ArtifactId),
});
export type HistoryExecution = typeof HistoryExecution.Type;
export const HistoryArtifact = Schema.Struct({
  ...fields,
  kind: Schema.Literal("artifact"),
  id: ArtifactId,
  conversationId: Schema.NullOr(ConversationId),
  runId: Schema.NullOr(RunId),
  title: Schema.String,
  content: Schema.String,
  mediaType: Schema.String,
  sourceUrl: Schema.NullOr(Schema.String),
  truncated: Schema.Boolean,
});
export type HistoryArtifact = typeof HistoryArtifact.Type;
export const HistoryRecord = Schema.Union([
  Conversation,
  HistoryMessage,
  HistoryRun,
  HistoryExecution,
  HistoryArtifact,
]);
export type HistoryRecord = typeof HistoryRecord.Type;
export const HistoryId = Schema.Union([
  ConversationId,
  MessageId,
  RunId,
  ExecutionId,
  ArtifactId,
]);
export type HistoryId = typeof HistoryId.Type;
export const HistoryEvent = Schema.Struct({
  v: Schema.Literal(1),
  id: ActivityEventId,
  sequence: Schema.Int,
  entityId: HistoryId,
  kind: Schema.Literals([
    "conversation",
    "message",
    "run",
    "execution",
    "artifact",
  ]),
  revision: Schema.Int,
  deleted: Schema.Boolean,
  recordedAt: Schema.Number,
});
export type HistoryEvent = typeof HistoryEvent.Type;
export const HistoryPage = Schema.Struct({
  sequence: Schema.Int,
  v: Schema.Literal(1),
  records: Schema.Array(HistoryRecord),
  receipts: Schema.optional(Schema.Array(Receipt)),
  cursor: Schema.NullOr(Schema.String),
});
export const HistoryChanges = Schema.Struct({
  v: Schema.Literal(1),
  events: Schema.Array(HistoryEvent),
  cursor: Schema.Int,
  hasMore: Schema.Boolean,
});
