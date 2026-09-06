/**
 * What is worth asking next, given where things stand.
 *
 * Not a menu: at most three chips, each earned by the state. A refusal
 * earns "why"; an empty pocket earns a top-up; a Graph answer with nothing
 * bought yet earns the purchase; a purchase earns the question about it.
 * Frozen or busy earns nothing, and before the first message the empty
 * screen owns the suggestions.
 */

import type { Receipt } from "@froggy/domain";

import type { FroggyMessage } from "./stream-model";

export interface SuggestionInput {
  readonly busy: boolean;
  readonly frozen: boolean;
  /** A Graph answer is on screen. */
  readonly hasGraph: boolean;
  /** A 402 was paid this session. */
  readonly hasPaid: boolean;
  /** The newest receipt is a refusal. */
  readonly lastRefused: boolean;
  readonly pocketUsdMicros: number | null;
  /** Anything has been said yet. */
  readonly started: boolean;
}

/** Below this the pocket cannot pay for much; a top-up is the obvious next ask. */
const LOW_POCKET_USD_MICROS = 100_000;

export const suggestionsFor = (input: SuggestionInput): readonly string[] => {
  if (!input.started || input.busy || input.frozen) {
    return [];
  }
  const chips: string[] = [];
  if (input.lastRefused) {
    chips.push("Why was that refused?");
  }
  if (
    input.pocketUsdMicros !== null &&
    input.pocketUsdMicros < LOW_POCKET_USD_MICROS
  ) {
    chips.push("Top up the pocket with 1 USDC");
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
  readonly frozen: boolean;
  readonly messages: readonly FroggyMessage[];
  readonly pocketUsdMicros: number | null;
  /** Newest first. */
  readonly receipts: readonly Receipt[];
}): SuggestionInput => ({
  busy: page.busy,
  frozen: page.frozen,
  hasGraph: page.messages.some((message) =>
    message.parts.some((part) => part.type === "tool-graph_query")
  ),
  hasPaid: page.receipts.some(
    (receipt) =>
      receipt.settlement !== undefined && receipt.intent.host !== undefined
  ),
  lastRefused: page.receipts[0]?.decision._tag === "deny",
  pocketUsdMicros: page.pocketUsdMicros,
  started: page.messages.length > 0,
});
