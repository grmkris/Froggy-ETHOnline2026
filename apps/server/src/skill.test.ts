import { describe, expect, it } from "bun:test";

import { GENERIC_SKILL, SKILL_URL_PLACEHOLDER, skillText } from "./skill";

describe("the skill text", () => {
  it("is committed at skills/froggy/SKILL.md exactly as this file renders it", async () => {
    const committed = await Bun.file(
      new URL("../../../skills/froggy/SKILL.md", import.meta.url).pathname
    ).text();
    expect(committed).toBe(GENERIC_SKILL);
  });

  it("fills a person's server in, names the three ways in, and carries no secret", () => {
    const mine = skillText({ url: "https://froggy.test" });
    expect(mine).toContain(
      "claude mcp add --transport http froggy https://froggy.test/mcp"
    );
    expect(mine).toContain("https://froggy.test/froggy-cli.js");
    expect(mine).toContain(
      "login --url=https://froggy.test --all-tools --manual"
    );
    expect(mine.indexOf("MCP by URL")).toBeLessThan(
      mine.indexOf("The CLI, signed in")
    );
    expect(mine.indexOf("The CLI, signed in")).toBeLessThan(
      mine.indexOf("A token, for an unattended agent")
    );
    expect(mine).not.toContain(SKILL_URL_PLACEHOLDER);
    expect(mine).not.toContain("fgy_");
  });
});
