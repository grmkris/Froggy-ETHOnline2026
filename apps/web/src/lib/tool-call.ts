/**
 * A tool call as the stream carries it, parsed at the boundary.
 *
 * The AI SDK hands the UI a loosely typed part per tool call. This is the one
 * place it is decoded, into what a card can render: the tool's name, where it
 * is in its life, the known input fields, and the text it returned. Anything
 * that does not fit renders as a plain row with the tool's name, never as a
 * crash.
 */

import { Schema } from "effect";

/** Every field any of the agent's tools takes. All optional: input streams in. */
const ToolInput = Schema.Struct({
  amountUsd: Schema.optional(Schema.Finite),
  purpose: Schema.optional(Schema.String),
  ref: Schema.optional(Schema.String),
  symbol: Schema.optional(Schema.String),
  text: Schema.optional(Schema.String),
  to: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});
export type ToolInput = typeof ToolInput.Type;

const ToolState = Schema.Literals([
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
  "output-available",
  "output-error",
  /** The person declined an SDK-level approval. Not raised by our tools,
      which park an ask inside `execute`, but the SDK can emit it. */
  "output-denied",
]);
export type ToolState = typeof ToolState.Type;

const ToolCallSchema = Schema.Struct({
  errorText: Schema.optional(Schema.String),
  input: Schema.optional(ToolInput),
  /** Our tools return text. Anything else is not shown, only named. */
  output: Schema.optional(Schema.String),
  state: ToolState,
  toolCallId: Schema.String,
  type: Schema.String,
});

export interface ToolCall {
  readonly errorText: string | null;
  readonly input: ToolInput;
  readonly name: string;
  readonly output: string | null;
  readonly state: ToolState;
  readonly toolCallId: string;
}

const decode = Schema.decodeUnknownResult(ToolCallSchema);

export const isToolPart = (part: { readonly type: string }): boolean =>
  part.type.startsWith("tool-") || part.type === "dynamic-tool";

/** Null when the part is not a tool call this UI knows how to read. */
export const toolCallOf = (part: {
  readonly type: string;
}): ToolCall | null => {
  const decoded = decode(part);
  if (decoded._tag === "Failure") {
    return null;
  }
  const raw = decoded.success;
  return {
    errorText: raw.errorText ?? null,
    input: raw.input ?? {},
    name: raw.type.replace(/^tool-/u, ""),
    output: raw.output ?? null,
    state: raw.state,
    toolCallId: raw.toolCallId,
  };
};
