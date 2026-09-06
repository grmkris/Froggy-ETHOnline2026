import { describe, expect, it } from "bun:test";

import { sendsOnKey } from "./keymap";

describe("sendsOnKey", () => {
  it("sends on Enter alone", () => {
    expect(
      sendsOnKey({ isComposing: false, key: "Enter", shiftKey: false })
    ).toBe(true);
  });

  it("breaks a line on Shift+Enter", () => {
    expect(
      sendsOnKey({ isComposing: false, key: "Enter", shiftKey: true })
    ).toBe(false);
  });

  it("lets an input method confirm its composition", () => {
    expect(
      sendsOnKey({ isComposing: true, key: "Enter", shiftKey: false })
    ).toBe(false);
  });

  it("ignores every other key", () => {
    expect(sendsOnKey({ isComposing: false, key: "a", shiftKey: false })).toBe(
      false
    );
  });
});
