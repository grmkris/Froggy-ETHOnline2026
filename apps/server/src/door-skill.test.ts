import { describe, expect, it } from "bun:test";

import { doorSkillText, GENERIC_DOOR_SKILL } from "./door-skill";
import { SKILL_URL_PLACEHOLDER } from "./skill";

describe("anonymous-door migration skill", () => {
  it("matches the committed migration instructions", async () => {
    const committed = await Bun.file(
      new URL("../../../skills/froggy-door/SKILL.md", import.meta.url).pathname
    ).text();
    expect(committed).toBe(GENERIC_DOOR_SKILL);
  });

  it("directs old installs to authenticated MCP and owner-funded credits", () => {
    const mine = doorSkillText({ url: "https://froggy.test" });
    expect(mine).toContain("https://froggy.test/mcp");
    expect(mine).toContain("HTTP 410");
    expect(mine).toContain("agents cannot buy credits or change limits");
    expect(mine).toContain("Never print a private key");
    expect(mine).not.toContain("FROGGY_HEDERA_PRIVATE_KEY");
    expect(mine).not.toContain(SKILL_URL_PLACEHOLDER);
  });
});
