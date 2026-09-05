import { describe, expect, it } from "bun:test";

import { effectiveMode, initialPopOut, reducePopOut } from "./pop-out-machine";

describe("reducePopOut", () => {
  it("lets the tab choose between inline and split", () => {
    const split = reducePopOut(initialPopOut, {
      mode: "split",
      type: "choose",
    });
    expect(split.mode).toBe("split");
    expect(reducePopOut(split, { mode: "inline", type: "choose" }).mode).toBe(
      "inline"
    );
  });

  it("a window wins while it holds the page, then hands it back", () => {
    const split = reducePopOut(initialPopOut, {
      mode: "split",
      type: "choose",
    });
    const held = reducePopOut(split, { type: "window-claimed" });
    expect(held.mode).toBe("window");
    // Choosing while a window holds the page only records the preference.
    const wished = reducePopOut(held, { mode: "inline", type: "choose" });
    expect(wished.mode).toBe("window");
    expect(reducePopOut(wished, { type: "window-released" }).mode).toBe(
      "inline"
    );
  });

  it("falls back to inline on a narrow screen", () => {
    const split = reducePopOut(initialPopOut, {
      mode: "split",
      type: "choose",
    });
    expect(effectiveMode(split, false)).toBe("inline");
    expect(effectiveMode(split, true)).toBe("split");
  });
});
