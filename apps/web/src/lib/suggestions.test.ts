import { describe, expect, it } from "bun:test";

import { suggestionInputFrom, suggestionsFor } from "./suggestions";
import type { SuggestionInput } from "./suggestions";

const quiet: SuggestionInput = {
  busy: false,
  hasGraph: false,
  hasPaid: false,
  lastRefused: false,
  started: true,
};

describe("suggestionsFor", () => {
  it("says nothing before the first message or while busy", () => {
    expect(suggestionsFor({ ...quiet, started: false })).toEqual([]);
    expect(suggestionsFor({ ...quiet, busy: true, hasGraph: true })).toEqual(
      []
    );
  });

  it("asks why after a refusal", () => {
    expect(suggestionsFor({ ...quiet, lastRefused: true })).toEqual([
      "Why was that refused?",
    ]);
  });

  it("offers the purchase after a Graph answer, and the question after the purchase", () => {
    expect(suggestionsFor({ ...quiet, hasGraph: true })).toEqual([
      "Buy the snapshot now",
    ]);
    expect(suggestionsFor({ ...quiet, hasGraph: true, hasPaid: true })).toEqual(
      ["What does the snapshot say?"]
    );
  });

  it("limits the next actions to three suggestions", () => {
    const every = suggestionsFor({
      ...quiet,
      hasGraph: true,
      hasPaid: true,
      lastRefused: true,
    });
    expect(every.length).toBeLessThanOrEqual(3);
  });
});

describe("suggestionInputFrom", () => {
  it("reads the flags off the page's state", () => {
    const input = suggestionInputFrom({
      busy: false,
      messages: [
        { id: "u", parts: [{ text: "hi", type: "text" }], role: "user" },
        {
          id: "a",
          parts: [
            {
              input: {},
              output: "x",
              state: "output-available",
              toolCallId: "c",
              type: "tool-graph_query",
            },
          ],
          role: "assistant",
        },
      ],
      receipts: [],
    });
    expect(input).toMatchObject({
      hasGraph: true,
      hasPaid: false,
      lastRefused: false,
      started: true,
    });
  });
});
