import { expect, test } from "@playwright/test";

/**
 * An outside agent is connected from the drawer and disconnected there.
 *
 * Minting shows the skill once with the token inside it; the list then
 * carries the name and its dates, and Disconnect empties it. The server side
 * of the same token is exercised in `apps/server/src/agents.test.ts`.
 */
test("connect an agent, read the skill once, disconnect it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Details" }).click();
  await page.getByRole("tab", { name: "Agents" }).click();
  await expect(page.getByText("No agent connected yet.")).toBeVisible();

  await page.getByLabel("A name for the agent").fill("Hermes on Contabo");
  await page.getByRole("button", { name: "Connect" }).click();
  const skill = page.getByLabel("Skill for your agent");
  await expect(skill).toBeVisible();
  await expect(skill).toHaveValue(/FROGGY_TOKEN="fgy_/u);
  await expect(skill).toHaveValue(/froggy-cli\.js/u);

  await page.getByRole("button", { name: "I pasted it" }).click();
  await expect(page.getByText("Hermes on Contabo")).toBeVisible();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText("No agent connected yet.")).toBeVisible();
});
