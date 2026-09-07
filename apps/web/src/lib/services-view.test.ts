import { describe, expect, it } from "bun:test";

import { usdMicros } from "@froggy/domain";

import {
  artifactFilename,
  isSettling,
  readinessBadge,
  runLabel,
  safeLink,
  statusWords,
} from "./services-view";

describe("services view", () => {
  it("says a status in the person's words and knows which ones still move", () => {
    expect(statusWords("awaiting_approval").label).toBe(
      "Waiting for your answer"
    );
    expect(statusWords("uncertain").label).toBe("Payment uncertain");
    expect(isSettling("running")).toBe(true);
    expect(isSettling("done")).toBe(false);
  });

  it("calls a fixture simulated and nothing else ready", () => {
    expect(readinessBadge("demo").label).toBe("Simulated");
    expect(readinessBadge("configured").label).toBe("Ready");
    expect(readinessBadge("unavailable").label).toBe("Unavailable");
  });

  it("only follows http links", () => {
    expect(safeLink("https://a.example/x")).toBe("https://a.example/x");
    expect(safeLink("data:text/html,hi")).toBeUndefined();
    expect(safeLink("not a url")).toBeUndefined();
  });

  it("names a download by its kind", () => {
    expect(artifactFilename("audio/mpeg", "tsk_1")).toBe("froggy-tsk_1.mp3");
    expect(artifactFilename("image/png", "tsk_1")).toBe("froggy-tsk_1.png");
    expect(artifactFilename(null, "tsk_1")).toBe("froggy-tsk_1.bin");
  });

  it("labels a simulated run as one", () => {
    const card = {
      description: "",
      maxInput: 10,
      name: "web_search" as const,
      note: "",
      priceUsdMicros: usdMicros(30_000),
      provider: "You.com",
      status: "demo" as const,
      title: "Search the web",
    };
    expect(runLabel(card, "$0.03")).toBe("Try simulated · $0.03");
    expect(runLabel({ ...card, status: "configured" }, "$0.03")).toBe(
      "Run · $0.03"
    );
  });
});
