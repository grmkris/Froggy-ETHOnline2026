/**
 * The browser worker protocol.
 *
 * `Bun.WebView` runs exactly one Chrome per process and the first view's
 * profile directory applies to every later view, so "one Chrome per user"
 * means one *process* per user. The server spawns a worker per signed-in user
 * and talks to it over Bun's IPC channel; these are the messages.
 *
 * It lives here rather than in the browser package because both ends have to
 * agree on it, and because it is a wire format like any other in this
 * repository: every message carries `v`, and both ends decode before use.
 * IPC is structured-cloned rather than JSON, which is why a frame can travel
 * as bytes instead of base64.
 *
 * Commands that expect an answer carry an `id`; the worker echoes it on the
 * reply. `frame.ack` is the one command without one — it is a credit, not a
 * question. The worker keeps at most two frames in flight, mirroring Chrome's
 * own screencast policy, so a take never queues behind a backlog of JPEGs.
 */

import { ProtocolVersion } from "@froggy/domain";
import { Schema } from "effect";

import { BrowserClientMessage, BrowserState } from "./browser";

const Envelope = { v: ProtocolVersion };
const Correlated = { ...Envelope, id: Schema.Int };

/** Why an agent operation unblocked: the human was quiet, went quiet, or never did. */
export const WaitReason = Schema.Literals(["skipped", "idle", "timeout"]);
export type WaitReason = typeof WaitReason.Type;

export const WorkerCommand = Schema.Union([
  /** A message from the human's browser socket, forwarded verbatim. */
  Schema.Struct({
    ...Correlated,
    message: BrowserClientMessage,
    type: Schema.Literals(["client"]),
  }),
  Schema.Struct({
    ...Correlated,
    type: Schema.Literals(["agent.navigate"]),
    url: Schema.String,
  }),
  Schema.Struct({ ...Correlated, type: Schema.Literals(["agent.snapshot"]) }),
  Schema.Struct({
    ...Correlated,
    ref: Schema.String,
    type: Schema.Literals(["agent.click"]),
  }),
  Schema.Struct({
    ...Correlated,
    text: Schema.String,
    type: Schema.Literals(["agent.type"]),
  }),
  Schema.Struct({ ...Correlated, type: Schema.Literals(["take"]) }),
  /** Whether anyone is looking. No watchers, no screencast, no encoding. */
  Schema.Struct({
    ...Correlated,
    type: Schema.Literals(["watch"]),
    watching: Schema.Boolean,
  }),
  Schema.Struct({ ...Envelope, type: Schema.Literals(["frame.ack"]) }),
  Schema.Struct({ ...Correlated, type: Schema.Literals(["state"]) }),
  Schema.Struct({
    ...Correlated,
    graceful: Schema.Boolean,
    type: Schema.Literals(["shutdown"]),
  }),
]);
export type WorkerCommand = typeof WorkerCommand.Type;

export const WorkerReply = Schema.Union([
  Schema.Struct({ kind: Schema.Literals(["navigated"]), wait: WaitReason }),
  Schema.Struct({
    kind: Schema.Literals(["snapshot"]),
    snapshot: Schema.Struct({
      text: Schema.String,
      title: Schema.String,
      url: Schema.String,
    }),
    wait: WaitReason,
  }),
  Schema.Struct({
    kind: Schema.Literals(["clicked"]),
    note: Schema.String,
    ok: Schema.Boolean,
  }),
  Schema.Struct({ kind: Schema.Literals(["done"]) }),
  Schema.Struct({ kind: Schema.Literals(["state"]), state: BrowserState }),
]);
export type WorkerReply = typeof WorkerReply.Type;

export const WorkerEvent = Schema.Union([
  Schema.Struct({
    ...Envelope,
    pid: Schema.Int,
    type: Schema.Literals(["ready"]),
  }),
  Schema.Struct({
    ...Envelope,
    state: BrowserState,
    type: Schema.Literals(["state"]),
  }),
  /** An already-encoded screencast frame, forwarded to sockets byte for byte. */
  Schema.Struct({
    ...Envelope,
    bytes: Schema.Uint8Array,
    type: Schema.Literals(["frame"]),
  }),
  Schema.Struct({
    ...Correlated,
    result: WorkerReply,
    type: Schema.Literals(["reply"]),
  }),
  Schema.Struct({
    ...Correlated,
    error: Schema.Struct({ message: Schema.String, name: Schema.String }),
    type: Schema.Literals(["failure"]),
  }),
]);
export type WorkerEvent = typeof WorkerEvent.Type;

export const decodeWorkerCommand = Schema.decodeUnknownResult(WorkerCommand);
export const decodeWorkerEvent = Schema.decodeUnknownResult(WorkerEvent);
