/**
 * A delegated task: something an outside agent or the workspace asked Froggy
 * to do, priced, paid, run on the server, and retrievable afterwards.
 *
 * The id outlives every socket. A caller that hangs up gets the same task
 * back by id; a caller that repeats a request with the same idempotency key
 * gets the same task rather than a second bill.
 */

import { Schema } from "effect";

import { AgentTokenId, RunId, SaleId, TaskId } from "./id";
import { UsdMicros } from "./money";

/** `brief` is a paid data answer with no browser; `browse` drives the shared Chrome. */
export const TaskKind = Schema.Literals(["brief", "browse"]);
export type TaskKind = typeof TaskKind.Type;

/**
 * `awaiting_approval` is a task parked on a ticket a person has not answered.
 * `uncertain` is a task whose payment was sent and not confirmed either way.
 */
export const TaskStatus = Schema.Literals([
  "quoted",
  "paid",
  "running",
  "awaiting_approval",
  "done",
  "failed",
  "uncertain",
]);
export type TaskStatus = typeof TaskStatus.Type;

export const Task = Schema.Struct({
  /** The token that asked, or null when the workspace itself did. */
  agentTokenId: Schema.NullOr(AgentTokenId),
  createdAt: Schema.Int,
  error: Schema.NullOr(Schema.String),
  id: TaskId,
  idempotencyKey: Schema.NullOr(Schema.String),
  /** What was asked, as the caller phrased it: `{symbol}` for a brief, `{instruction}` for a browse. */
  input: Schema.Record(Schema.String, Schema.Unknown),
  kind: TaskKind,
  /** The quote, which is also the price: nothing is metered back. */
  priceUsdMicros: UsdMicros,
  result: Schema.NullOr(Schema.Unknown),
  runId: Schema.NullOr(RunId),
  saleId: Schema.NullOr(SaleId),
  status: TaskStatus,
  updatedAt: Schema.Int,
});
export type Task = typeof Task.Type;
