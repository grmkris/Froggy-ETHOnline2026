import { expect, test } from "@playwright/test";

import {
  AgentTokenId,
  OAuthClientId,
  OAuthGrantId,
} from "../packages/domain/src/id";

for (const path of ["/", "/wallet", "/agents"]) {
  test(`copy agent instructions and recover clipboard denial on ${path}`, async ({
    page,
    context,
    baseURL,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(path);
    await page.getByRole("button", { name: "Copy for your agent" }).click();
    await expect(
      page.getByText("Copied. Paste this into your agent’s chat.")
    ).toBeVisible();
    const prompt = `Read ${baseURL}/llm.md and follow it to connect yourself to my Froggy wallet as an MCP server; then tell me what you can do.`;
    expect(
      await page.evaluate(async () => await navigator.clipboard.readText())
    ).toBe(prompt);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            await Promise.reject(new Error("denied"));
          },
        },
      });
    });
    await page.getByRole("button", { name: "Copy for your agent" }).click();
    await expect(page.getByRole("alert")).toContainText("Couldn’t copy");
    await expect(page.getByLabel("Instructions for your agent")).toHaveValue(
      prompt
    );
    expect(errors).toEqual([]);
  });
}

test("only unrevoked grants and tokens replace the copy action with a count", async ({
  page,
}) => {
  const token = {
    id: AgentTokenId.generate(),
    label: "Legacy",
    createdAt: Date.now(),
    lastUsedAt: null,
    revokedAt: null,
  };
  const grant = {
    id: OAuthGrantId.generate(),
    clientId: OAuthClientId.generate(),
    clientName: "MCP",
    scopes: ["services"],
    createdAt: Date.now(),
    lastUsedAt: null,
    revokedAt: null,
  };
  let active = 0;
  await page.route("**/api/agents", async (route) => {
    await route.fulfill({
      json: {
        agents: [{ ...token, revokedAt: active >= 1 ? null : Date.now() }],
        grants: [{ ...grant, revokedAt: active >= 2 ? null : Date.now() }],
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Copy for your agent" })
  ).toBeVisible();
  active = 1;
  await page.goto("/wallet");
  await expect(
    page.getByRole("link", { name: "1 agent connected" })
  ).toHaveAttribute("href", `/agents/${token.id}`);
  await expect(
    page.getByRole("button", { name: "Copy for your agent" })
  ).toHaveCount(0);
  active = 2;
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "2 agents connected" })
  ).toHaveAttribute("href", "/agents");
  await expect(
    page.getByRole("button", { name: "Copy for your agent" })
  ).toHaveCount(0);
});
