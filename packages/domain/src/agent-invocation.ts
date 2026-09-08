import { Schema } from "effect";

import { AgentInvocationId, AgentTokenId, OAuthGrantId, TaskId } from "./id";

export const AgentConnectionId = Schema.Union([AgentTokenId, OAuthGrantId]);
export type AgentConnectionId = typeof AgentConnectionId.Type;

/** Metadata only: never arguments, results, payment headers or credentials. */
export const AgentInvocation = Schema.Struct({
  id: AgentInvocationId,
  connectionId: AgentConnectionId,
  kind: Schema.Literals(["mcp", "task", "pay"]),
  name: Schema.String.check(Schema.isMaxLength(120)),
  at: Schema.Int,
  outcome: Schema.String.check(Schema.isMaxLength(80)),
  usdMicros: Schema.NullOr(Schema.Int),
  taskId: Schema.NullOr(TaskId),
  stubbed: Schema.Boolean,
});
export type AgentInvocation = typeof AgentInvocation.Type;
