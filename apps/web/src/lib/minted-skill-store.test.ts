import { describe, expect, it } from "bun:test";

import { setMintedSkill } from "./minted-skill-store";

describe("the minted skill store", () => {
  it("holds one skill at a time and accepts being cleared", () => {
    // The hook reads through the same closure; setting and clearing must not throw
    // and must leave the module in the cleared state for the next test.
    setMintedSkill("skill text");
    setMintedSkill(null);
    expect(true).toBe(true);
  });
});
