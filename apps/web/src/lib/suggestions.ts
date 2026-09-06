/**
 * What is worth asking next, given where things stand.
 *
 * Not a menu: at most three chips, each earned by the state. A refusal
 * earns "why"; an empty pocket earns a top-up; a Graph answer with nothing
 * bought yet earns the purchase; a purchase earns the question about it.
 * Frozen or busy earns nothing, and before the first message the empty
 * screen owns the suggestions.
 */

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
