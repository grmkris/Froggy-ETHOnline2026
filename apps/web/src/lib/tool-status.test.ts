import { describe, expect, it } from "bun:test";

import type { ToolCall, ToolState } from "./tool-call";
import { toolStatus } from "./tool-status";
import type { ToolSummary } from "./tool-summary";

const call = (name: string, state: ToolState): ToolCall => ({
  errorText: null,
  input: {},
  name,
  output: null,
  state,
  toolCallId: "call-1",
});

const outcome = (kind: ToolSummary["outcome"]): ToolSummary => ({
  detail: null,
  headline: "x",
  outcome: kind,
  stubbed: false,
});

describe("toolStatus", () => {
  it("is running while the input streams or the tool works", () => {
    expect(
      toolStatus(call("browser_snapshot", "input-streaming"), null, {
        asking: false,
      })
    ).toMatchObject({ live: true, phase: "running" });
    expect(
      toolStatus(call("browser_snapshot", "input-available"), null, {
        asking: true,
      })
    ).toMatchObject({ live: true, phase: "running" });
  });

  it("is waiting for the person when a money tool runs under an open approval", () => {
    expect(
      toolStatus(call("x402_fetch", "input-available"), null, { asking: true })
    ).toEqual({
      label: "waiting for you",
      live: true,
      phase: "waiting",
    });
  });

  it("settles by what the tool said", () => {
    expect(
      toolStatus(call("x402_fetch", "output-available"), outcome("ok"), {
        asking: false,
      }).phase
    ).toBe("done");
    expect(
      toolStatus(call("x402_fetch", "output-available"), outcome("refused"), {
        asking: false,
      }).phase
    ).toBe("refused");
    expect(
      toolStatus(call("x402_fetch", "output-available"), outcome("asked"), {
        asking: false,
      })
    ).toMatchObject({ label: "not allowed", phase: "refused" });
    expect(
      toolStatus(call("browser_type", "output-available"), null, {
        asking: false,
      }).phase
    ).toBe("done");
  });

  it("names a failure and a declined approval", () => {
    expect(
      toolStatus(call("x402_fetch", "output-error"), null, { asking: false })
        .phase
    ).toBe("failed");
    expect(
      toolStatus(call("x402_fetch", "output-denied"), null, { asking: true })
        .phase
    ).toBe("denied");
  });
});
