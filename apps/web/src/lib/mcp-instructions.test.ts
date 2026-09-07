import { describe, expect, it } from "bun:test";

import {
  claudeCodeCommand,
  cursorConfig,
  hermesNote,
} from "./mcp-instructions";

describe("MCP instructions", () => {
  const url = "https://froggy.example/mcp";

  it("put the URL in every agent's own words", () => {
    expect(claudeCodeCommand(url)).toBe(
      "claude mcp add --transport http froggy https://froggy.example/mcp"
    );
    expect(JSON.parse(cursorConfig(url))).toEqual({
      mcpServers: { froggy: { url } },
    });
    expect(hermesNote(url)).toContain(url);
  });
});
