/**
 * Where a tool call is in its life, decided once.
 *
 * This is the only reader of `call.state`. Everything else — the card's tone,
 * its status word, whether the sentence shimmers — asks this function, so the
 * answer to "is it still running" cannot drift between two places.
 *
 * Our money tools park an approval inside `execute`, so the SDK never moves
 * them to an approval state: a tool waiting on the person looks like any
 * running tool. "Waiting for you" is therefore inferred — a money tool still
 * running while an approval card is open is the one that is waiting.
 */

import type { ToolCall } from "./tool-call";
import { MONEY_TOOLS } from "./tool-stories";
import type { ToolSummary } from "./tool-summary";

export type ToolPhase =
  | "denied"
  | "done"
  | "failed"
  | "refused"
  | "running"
  | "waiting";

export interface ToolStatus {
  /** The status word the card shows. */
  readonly label: string;
  /** Still changing: the sentence shimmers. */
  readonly live: boolean;
  readonly phase: ToolPhase;
}

const settled = (summary: ToolSummary | null): ToolStatus => {
  if (summary?.outcome === "refused") {
    return { label: "refused", live: false, phase: "refused" };
  }
  if (summary?.outcome === "asked") {
    return { label: "not allowed", live: false, phase: "refused" };
  }
  return { label: "done", live: false, phase: "done" };
};

export const toolStatus = (
  call: ToolCall,
  summary: ToolSummary | null,
  context: { readonly asking: boolean }
): ToolStatus => {
  if (call.state === "output-error") {
    return { label: "failed", live: false, phase: "failed" };
  }
  if (call.state === "output-denied") {
    return { label: "declined", live: false, phase: "denied" };
  }
  if (call.state === "output-available") {
    return settled(summary);
  }
  // Input streaming or available, or one of the SDK's approval states: the
  // call is still in flight either way.
  return context.asking && MONEY_TOOLS.has(call.name)
    ? { label: "waiting for you", live: true, phase: "waiting" }
    : { label: "running…", live: true, phase: "running" };
};
