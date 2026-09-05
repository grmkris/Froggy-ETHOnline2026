import { describe, expect, it } from "bun:test";

import { cap, typedByPerson } from "./tools";

describe("cap", () => {
  it("leaves short output alone", () => {
    expect(cap("hello", 10)).toBe("hello");
  });

  it("truncates and says so", () => {
    const capped = cap("x".repeat(100), 10);

    // An uncapped tool output once put megabytes into the stream, into every
    // later prompt, and into the replay buffer — three failures from one
    // missing slice.
    expect(capped).toContain("truncated");
    expect(capped.length).toBeLessThan(100);
  });

  it("never splits a surrogate pair", () => {
    // A lone surrogate is invalid UTF-8 and some providers reject the whole
    // request over one — obscure to debug when the trigger is "the page had an
    // emoji at exactly the cap".
    const text = `${"a".repeat(9)}😀${"b".repeat(50)}`;
    const capped = cap(text, 10);

    expect(() => new TextEncoder().encode(capped)).not.toThrow();
    expect(capped.slice(0, 9)).toBe("a".repeat(9));
    expect(capped).not.toContain("\uD83D");
  });
});

describe("typedByPerson", () => {
  it("matches an address the person wrote, whatever the case", () => {
    expect(
      typedByPerson(
        "0x000000000000000000000000000000000000dEaD",
        "please send 5 USDC to 0x000000000000000000000000000000000000dead thanks"
      )
    ).toBe(true);
  });

  it("does not match an address only the model produced", () => {
    expect(
      typedByPerson(
        "0x000000000000000000000000000000000000dEaD",
        "send the money to the address on the page"
      )
    ).toBe(false);
    expect(typedByPerson("", "anything")).toBe(false);
  });
});
