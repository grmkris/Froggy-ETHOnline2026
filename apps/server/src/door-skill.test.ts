import { describe, expect, it } from "bun:test";

import { doorSkillText, GENERIC_DOOR_SKILL } from "./door-skill";
import { SKILL_URL_PLACEHOLDER } from "./skill";

describe("the agent door's skill text", () => {
  it("is committed at skills/froggy-door/SKILL.md exactly as this file renders it", async () => {
    const committed = await Bun.file(
      new URL("../../../skills/froggy-door/SKILL.md", import.meta.url).pathname
    ).text();
    expect(committed).toBe(GENERIC_DOOR_SKILL);
  });

  it("fills a real origin in and names all three tools", () => {
    const mine = doorSkillText({ url: "https://froggy.test" });
    expect(mine).toContain("https://froggy.test/froggy-mcp.js");
    expect(mine).toContain("froggy_catalogue");
    expect(mine).toContain("froggy_buy");
    expect(mine).toContain("froggy_receipt");
    expect(mine).not.toContain(SKILL_URL_PLACEHOLDER);
  });

  it("tells the agent to read a refusal rather than retry, and to ask before spending", () => {
    const mine = doorSkillText({ url: "https://froggy.test" });
    expect(mine).toContain("Buying twice costs twice");
    expect(mine).toContain("get an answer before calling");
  });

  it("carries no key, and never tells the caller to paste one", () => {
    const mine = doorSkillText({ url: "https://froggy.test" });
    expect(mine).toContain("Never print the key");
    expect(mine).not.toMatch(/0x[\da-f]{40,}/iu);
  });
});
