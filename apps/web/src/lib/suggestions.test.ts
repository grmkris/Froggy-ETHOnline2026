import { describe, expect, it } from "bun:test";

import { suggestionsFor } from "./suggestions";
import type { SuggestionInput } from "./suggestions";

const quiet: SuggestionInput = {
  busy: false,
  frozen: false,
  hasGraph: false,
  hasPaid: false,
  lastRefused: false,
  pocketUsdMicros: 500_000,
  started: true,
};

describe("suggestionsFor", () => {
  it("says nothing before the first message, while busy, or when frozen", () => {
    expect(suggestionsFor({ ...quiet, started: false })).toEqual([]);
    expect(suggestionsFor({ ...quiet, busy: true, hasGraph: true })).toEqual(
      []
    );
    expect(
      suggestionsFor({ ...quiet, frozen: true, lastRefused: true })
    ).toEqual([]);
  });

  it("asks why after a refusal, and offers a top-up for an empty pocket", () => {
    expect(
      suggestionsFor({ ...quiet, lastRefused: true, pocketUsdMicros: 20_000 })
    ).toEqual(["Why was that refused?", "Top up the pocket with 1 USDC"]);
  });

  it("offers the purchase after a Graph answer, and the question after the purchase", () => {
    expect(suggestionsFor({ ...quiet, hasGraph: true })).toEqual([
      "Buy the snapshot now",
    ]);
    expect(suggestionsFor({ ...quiet, hasGraph: true, hasPaid: true })).toEqual(
      ["What does the snapshot say?"]
    );
  });

  it("never uses the empty screen's own words", () => {
    const every = suggestionsFor({
      ...quiet,
      hasGraph: true,
      hasPaid: true,
      lastRefused: true,
      pocketUsdMicros: 0,
    });
    expect(every.length).toBeLessThanOrEqual(3);
    expect(every.join(" ")).not.toContain("Buy the lending snapshot");
  });
});
