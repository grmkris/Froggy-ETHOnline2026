import { describe, expect, it } from "bun:test";

import { chatErrorText } from "./chat-error";

describe("chatErrorText", () => {
  it("reads the server's sentence out of its JSON body", () => {
    expect(chatErrorText('{"error":"The day\'s turns are spent."}')).toBe(
      "The day's turns are spent."
    );
  });

  it("keeps a message that is not that body", () => {
    expect(chatErrorText("Failed to fetch")).toBe("Failed to fetch");
    expect(chatErrorText('{"detail":"nope"}')).toBe('{"detail":"nope"}');
  });
});
