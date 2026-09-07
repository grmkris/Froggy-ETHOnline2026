import { describe, expect, it } from "bun:test";

import { parseSlash, slashMatches } from "./slash";

describe("parseSlash", () => {
  it("leaves a message alone", () => {
    expect(parseSlash("send 5 USDC")).toBeNull();
    expect(parseSlash("  what does /status mean?")).toBeNull();
  });

  it("reads the verbs, whatever the case", () => {
    expect(parseSlash("/STOP ")).toEqual({ kind: "stop" });
    expect(parseSlash("/status")).toEqual({ kind: "status" });
  });
});

describe("slashMatches", () => {
  it("lists every command for a bare slash and narrows as you type", () => {
    expect(slashMatches("/").map((entry) => entry.name)).toEqual([
      "stop",
      "status",
    ]);
    expect(slashMatches("/st").map((entry) => entry.name)).toEqual([
      "stop",
      "status",
    ]);
    expect(slashMatches("/x")).toEqual([]);
    expect(slashMatches("hello")).toEqual([]);
  });
});
