/**
 * The conversation is the ledger.
 *
 * Receipts are not a side panel: each one is filed under the turn that
 * produced it, so "the agent paid for this" sits beneath the sentence where it
 * said it would. The join is the run id the server stamps on every assistant
 * message and on every receipt. Receipts from before this tab's history — a
 * reload, a previous day — have no turn to sit under and are grouped once at
 * the top as "earlier".
 */

import type { Receipt } from "@froggy/domain";
import type { ChatStatus, UIMessage } from "ai";

import type { TimelineEvent } from "./app-state";

/** What the server stamps on a message. Both fields are absent on a client draft. */
interface TurnMetadata {
  readonly at?: number;
  readonly runId?: string;
}

export type FroggyMessage = UIMessage<TurnMetadata>;

export type StreamItem =
  | {
      readonly kind: "earlier";
      readonly receipts: readonly Receipt[];
    }
  | {
      readonly event: TimelineEvent;
      readonly kind: "marker";
    }
  | {
      readonly kind: "turn";
      readonly message: FroggyMessage;
      readonly receipts: readonly Receipt[];
    };

const BROWSER_TOOL_PREFIX = "tool-browser_";

/** Did this turn touch the shared page? The live card sits under the last one that did. */
const usesBrowser = (message: FroggyMessage): boolean =>
  message.parts.some((part) => part.type.startsWith(BROWSER_TOOL_PREFIX));

export const lastBrowserTurn = (
  messages: readonly FroggyMessage[]
): string | null => {
  for (const message of messages.toReversed()) {
    if (usesBrowser(message)) {
      return message.id;
    }
  }
  return null;
};

/**
 * Events between the turns, at the moment they happened.
 *
 * An event goes after the last message that started at or before it; one
 * from before the first message goes first. A message with no clock — a
 * draft still being sent — sits with the message before it.
 */
const interleave = (
  turns: readonly StreamItem[],
  messages: readonly FroggyMessage[],
  events: readonly TimelineEvent[]
): readonly StreamItem[] => {
  const sorted = events.toSorted((a, b) => a.at - b.at);
  const placed: StreamItem[] = [];
  let cursor = 0;
  const flushBefore = (limit: number | null): void => {
    for (;;) {
      const next = sorted[cursor];
      if (next === undefined || (limit !== null && next.at >= limit)) {
        return;
      }
      placed.push({ event: next, kind: "marker" });
      cursor += 1;
    }
  };
  const clocks = messages.map((message) => message.metadata?.at ?? null);
  flushBefore(clocks.find((clock) => clock !== null) ?? null);
  for (const [index, turn] of turns.entries()) {
    placed.push(turn);
    const nextClock = clocks.slice(index + 1).find((clock) => clock !== null);
    if (nextClock !== undefined) {
      flushBefore(nextClock);
    }
  }
  flushBefore(null);
  return placed;
};

export const buildStream = (
  messages: readonly FroggyMessage[],
  receipts: readonly Receipt[],
  events: readonly TimelineEvent[] = []
): readonly StreamItem[] => {
  const byRun = new Map<string, Receipt[]>();
  for (const receipt of receipts.toSorted((a, b) => a.at - b.at)) {
    const bucket = byRun.get(receipt.runId) ?? [];
    bucket.push(receipt);
    byRun.set(receipt.runId, bucket);
  }
  const turns: StreamItem[] = messages.map((message) => {
    const runId =
      message.role === "assistant" ? message.metadata?.runId : undefined;
    const attached = runId === undefined ? [] : (byRun.get(runId) ?? []);
    if (runId !== undefined) {
      byRun.delete(runId);
    }
    return { kind: "turn", message, receipts: attached };
  });
  const earlier = [...byRun.values()].flat().toSorted((a, b) => a.at - b.at);
  const placed = interleave(turns, messages, events);
  return earlier.length === 0
    ? placed
    : [{ kind: "earlier", receipts: earlier }, ...placed];
};

/**
 * Is the model at work with nothing on screen to show for it?
 *
 * Submitted and not yet answered; streaming with no assistant part yet; or
 * the last thing that arrived is a step boundary, so one step's words are
 * done and the next has not begun. In each the person is looking at a gap,
 * and the gap gets a marker rather than silence.
 */
export const showThinking = (
  messages: readonly FroggyMessage[],
  status: ChatStatus
): boolean => {
  if (status === "submitted") {
    return true;
  }
  if (status !== "streaming") {
    return false;
  }
  const last = messages.at(-1);
  if (last === undefined || last.role !== "assistant") {
    return true;
  }
  const tail = last.parts.at(-1);
  return tail === undefined || tail.type === "step-start";
};

/**
 * The turn that can be asked again: the last assistant turn, while the chat
 * stands in error. Any other time, none.
 */
export const retryIdOf = (
  messages: readonly FroggyMessage[],
  status: ChatStatus
): string | null => {
  if (status !== "error") {
    return null;
  }
  const last = messages.findLast((message) => message.role === "assistant");
  return last === undefined ? null : last.id;
};
