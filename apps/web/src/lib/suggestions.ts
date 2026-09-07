/**
 * What is worth asking next, given where things stand.
 *
 * Not a menu: at most three chips, each earned by the state. A refusal
 * earns "why"; a Graph answer with nothing bought yet earns the purchase; a
 * purchase earns the question about it. Busy earns nothing, and before the
 * first message the empty screen owns the suggestions.
 */

import type { Receipt } from "@froggy/domain";

import type { FroggyMessage } from "./stream-model";

export interface SuggestionInput {
  readonly busy: boolean;
  /** A Graph answer is on screen. */
  readonly hasGraph: boolean;
  /** A 402 was paid this session. */
  readonly hasPaid: boolean;
  /** The newest receipt is a refusal. */
  readonly lastRefused: boolean;
  /** Anything has been said yet. */
  readonly started: boolean;
}

export const suggestionsFor = (input: SuggestionInput): readonly string[] => {
  if (!input.started || input.busy) {
    return [];
  }
  const chips: string[] = [];
  if (input.lastRefused) {
    chips.push("Why was that refused?");
  }
  if (input.hasPaid) {
    chips.push("What does the snapshot say?");
  } else if (input.hasGraph) {
    chips.push("Buy the snapshot now");
  }
  return chips.slice(0, 3);
};

/** The flags the chips depend on, read off what the page already holds. */
export const suggestionInputFrom = (page: {
  readonly busy: boolean;
  readonly messages: readonly FroggyMessage[];
  /** Newest first. */
  readonly receipts: readonly Receipt[];
}): SuggestionInput => ({
  busy: page.busy,
  hasGraph: page.messages.some((message) =>
    message.parts.some((part) => part.type === "tool-graph_query")
  ),
  hasPaid: page.receipts.some(
    (receipt) =>
      receipt.settlement !== undefined && receipt.intent.host !== undefined
  ),
  lastRefused: page.receipts[0]?.decision._tag === "deny",
  started: page.messages.length > 0,
});
