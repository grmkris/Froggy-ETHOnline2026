import { describe, expect, it } from "bun:test";

import { applySlash, parseSlash, slashMatches, STATUS_PROMPT } from "./slash";

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

describe("applySlash", () => {
  it("stops at once and sends status as the same ask chat uses", () => {
    const send: string[] = [];
    const stop: string[] = [];
    applySlash(
      { kind: "stop" },
      {
        send: (text) => {
          send.push(text);
        },
        stop: () => {
          stop.push("stop");
        },
      }
    );
    applySlash(
      { kind: "status" },
      {
        send: (text) => {
          send.push(text);
        },
        stop: () => {
          stop.push("stop");
        },
      }
    );
    applySlash(
      { kind: "unknown", name: "nope", reason: "no such command" },
      {
        send: (text) => {
          send.push(text);
        },
        stop: () => {
          stop.push("stop");
        },
      }
    );
    expect(stop).toEqual(["stop"]);
    expect(send).toEqual([STATUS_PROMPT]);
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
