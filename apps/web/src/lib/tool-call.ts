/**
 * A tool call as the stream carries it, parsed at the boundary.
 *
 * The AI SDK hands the UI a loosely typed part per tool call. This is the one
 * place it is decoded, into what a card can render: the tool's name, where it
 * is in its life, the known input fields, and the text it returned. Anything
 * that does not fit renders as a plain row with the tool's name, never as a
 * crash.
 */

import { WatchlistItem } from "@froggy/domain";
import {
  AddressLookupResult,
  WatchlistList,
  WatchlistDetails,
  GraphQueryOutput,
  ServiceCatalog,
  ServiceTicket,
} from "@froggy/protocol";
import { Schema } from "effect";

/** Every field any of the agent's tools takes. All optional: input streams in. */
const ToolInput = Schema.Struct({
  address: Schema.optional(Schema.String),
  amountUsd: Schema.optional(Schema.Finite),
  contract: Schema.optional(Schema.String),
  purpose: Schema.optional(Schema.String),
  query: Schema.optional(Schema.String),
  service: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
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
  /** Our tools return text; `graph_query` returns its text with fields. */
  output: Schema.optional(
    Schema.Union([
      Schema.String,
      GraphQueryOutput,
      ServiceTicket,
      ServiceCatalog,
      WatchlistItem,
      WatchlistList,
      WatchlistDetails,
      AddressLookupResult,
      Schema.Struct({ v: Schema.Literals([1]), error: Schema.String }),
    ])
  ),
  state: ToolState,
  toolCallId: Schema.String,
  type: Schema.String,
});

export interface ToolCall {
  readonly errorText: string | null;
  /** The Graph answer's fields, when this is a `graph_query` with them. */
  readonly graph: GraphQueryOutput | null;
  readonly input: ToolInput;
  readonly name: string;
  /** What the model read: the text, whichever shape carried it. */
  readonly output: string | null;
  readonly state: ToolState;
  readonly toolCallId: string;
}

const decode = Schema.decodeUnknownResult(ToolCallSchema);
/** Which half of the output union arrived, asked of the parsed value. */
const isGraph = Schema.is(GraphQueryOutput);
const isText = Schema.is(Schema.String);

const outputText = (
  output: (typeof ToolCallSchema.Type)["output"]
): string | null => {
  if (output === undefined) {
    return null;
  }
  if (isText(output)) {
    return output;
  }
  if (isGraph(output)) {
    return output.text;
  }
  return JSON.stringify(output);
};

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
  const output = raw.output ?? null;
  const graph = output !== null && isGraph(output) ? output : null;
  return {
    errorText: raw.errorText ?? null,
    graph,
    input: raw.input ?? {},
    name: raw.type.replace(/^tool-/u, ""),
    output: outputText(raw.output),
    state: raw.state,
    toolCallId: raw.toolCallId,
  };
};

const RichToolResult = Schema.Union([
  ServiceTicket,
  WatchlistItem,
  WatchlistList,
  WatchlistDetails,
  AddressLookupResult,
]);
export const richResultOf = (
  call: ToolCall
): typeof RichToolResult.Type | null => {
  if (call.output === null || call.output.length > 200_000) {
    return null;
  }
  const result = Schema.decodeUnknownResult(
    Schema.fromJsonString(RichToolResult)
  )(call.output);
  return result._tag === "Success" ? result.success : null;
};
