import { describe, expect, it } from "bun:test";

import {
  GENERIC_SKILL,
  SKILL_TOKEN_PLACEHOLDER,
  SKILL_URL_PLACEHOLDER,
  skillText,
} from "./skill";

describe("the skill text", () => {
  it("is committed at skills/froggy/SKILL.md exactly as this file renders it", async () => {
    const committed = await Bun.file(
      new URL("../../../skills/froggy/SKILL.md", import.meta.url).pathname
    ).text();
    expect(committed).toBe(GENERIC_SKILL);
  });

  it("fills a person's server and token in, and never leaves the placeholders behind", () => {
    const mine = skillText({ token: "fgy_abc", url: "https://froggy.test" });
    expect(mine).toContain('FROGGY_TOKEN="fgy_abc"');
    expect(mine).toContain("https://froggy.test/froggy-cli.js");
    expect(mine).not.toContain(SKILL_TOKEN_PLACEHOLDER);
    expect(mine).not.toContain(SKILL_URL_PLACEHOLDER);
  });
});
