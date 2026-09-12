import { describe, expect, it } from "bun:test";

import { stubsOf } from "./stubs";

describe("stubsOf", () => {
  it("names every stubbed integration and ignores live ones", () => {
    expect(stubsOf(null)).toEqual([]);
    expect(
      stubsOf({
        browser: "stub",
        database: "live",
        graph: "stub",
        hedera: "live",
        model: "stub",
        privy: "stub",
        telegram: "live",
      })
    ).toEqual(["browser", "graph", "model", "privy"]);
  });
});
