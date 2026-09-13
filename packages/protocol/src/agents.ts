import {
  ExecutionId,
  AgentConnectionId,
  AgentInvocation,
  OAuthScope,
  TaskKind,
  TaskStatus,
} from "@froggy/domain";
import { Schema } from "effect";

export const AgentConnection = Schema.Struct({
  id: AgentConnectionId,
  name: Schema.String,
  scopes: Schema.Array(OAuthScope),
  createdAt: Schema.Int,
  lastUsedAt: Schema.NullOr(Schema.Int),
  revokedAt: Schema.NullOr(Schema.Int),
});
export type AgentConnection = typeof AgentConnection.Type;

export const AgentInvocationView = Schema.Struct({
  ...AgentInvocation.fields,
  executionId: Schema.NullOr(ExecutionId),
  taskKind: Schema.NullOr(TaskKind),
  taskStatus: Schema.NullOr(TaskStatus),
});
export type AgentInvocationView = typeof AgentInvocationView.Type;

export const AgentDetail = Schema.Struct({
  v: Schema.Literals([1]),
  agent: AgentConnection,
  invocations: Schema.Array(AgentInvocationView).check(Schema.isMaxLength(50)),
});
export type AgentDetail = typeof AgentDetail.Type;
