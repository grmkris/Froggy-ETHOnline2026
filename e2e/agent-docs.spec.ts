import { expect, test } from "@playwright/test";

test("public install documents share the deployment origin and preserve the old skill URL", async ({
  request,
  baseURL,
}) => {
  const llm = await request.get("/llm.md");
  const skill = await request.get("/skill.md");
  const legacy = await request.get("/froggy/SKILL.md");
  await Promise.all(
    [llm, skill, legacy].map(async (response) => {
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain("text/markdown");
      const text = await response.text();
      expect(text).toContain(
        `claude mcp add --transport http froggy ${baseURL}/mcp`
      );
      expect(text).toContain(`curl -fsSL ${baseURL}/skill.md`);
      expect(text).toContain(`curl -fsSL ${baseURL}/froggy-cli.js`);
      expect(text).toContain('"mcpServers"');
      expect(text).not.toContain("your-froggy.example");
    })
  );
  expect(await skill.text()).toContain(await llm.text());
  expect(await legacy.text()).toBe(await skill.text());
  expect(await skill.text()).toMatch(/^---\nname: froggy/u);
});
