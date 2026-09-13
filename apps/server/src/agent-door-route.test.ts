import { describe, expect, it } from "bun:test";

import { serveAgentDoor } from "./agent-door-route";

describe("retired anonymous agent bundle", () => {
  it("returns migration guidance with HTTP 410 instead of executable signing code", async () => {
    const response = serveAgentDoor("https://froggy.test");
    expect(response.status).toBe(410);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.text();
    expect(body).toContain("https://froggy.test/mcp");
    expect(body).toContain("https://froggy.test/skill.md");
    expect(body).not.toContain("PRIVATE_KEY");
  });
});
