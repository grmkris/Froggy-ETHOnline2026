import { expect, test } from "@playwright/test";

/**
 * An outside agent is connected on the Agents page and disconnected there.
 *
 * Minting shows the token separately from the reusable skill; the list then
 * carries the name and its dates, and Disconnect empties it. The server side
 * of the same token is exercised in `apps/server/src/agents.test.ts`.
 */
test("connect an agent, read the skill once, disconnect it", async ({
  page,
}) => {
  let listAttempts = 0;
  let disconnectAttempts = 0;
  await page.route("**/api/agents", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    listAttempts += 1;
    if (listAttempts === 1) {
      await route.fulfill({ status: 503 });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/agents/*", async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    disconnectAttempts += 1;
    if (disconnectAttempts === 1) {
      await route.fulfill({ status: 503 });
      return;
    }
    await route.continue();
  });
  await page.goto("/agents");
  await expect(page.getByRole("alert")).toContainText("Couldn’t load");
  await page.getByRole("button", { name: "Retry loading agents" }).click();
  await expect(page.getByText("No connections yet.")).toBeVisible();

  await page
    .getByText("Advanced: connect with a token", { exact: true })
    .click();
  await page.getByLabel("Agent name").fill("Hermes on Contabo");
  await page.getByRole("button", { name: "Create connection" }).click();
  const skill = page.getByLabel("Skill for your agent");
  await expect(skill).toBeVisible();
  // The token is its own field now; the skill carries the server and no secret.
  await expect(
    page.getByRole("textbox", { name: "Connection token" })
  ).toHaveValue(/^fgy_/u);
  await expect(skill).not.toHaveValue(/fgy_/u);
  await expect(skill).toHaveValue(/froggy-cli\.js/u);
  await expect(skill).toHaveValue(/\/mcp/u);

  const connectionToken = await page
    .getByRole("textbox", { name: "Connection token" })
    .inputValue();
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Wallet" })
    .click();
  await expect(page).toHaveURL(/\/wallet$/u);
  await expect(
    page.getByRole("heading", { name: "Wallet", exact: true })
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: /^More/u })
    .click();
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Agents" })
    .click();
  await expect(page).toHaveURL(/\/agents$/u);
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true })
  ).toBeVisible();
  await page
    .getByText("Advanced: connect with a token", { exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Connection token" })
  ).toHaveValue(connectionToken);
  await page.getByRole("button", { name: "I pasted it" }).click();
  await expect(
    page.getByRole("textbox", { name: "Connection token" })
  ).toHaveCount(0);
  await expect(page.getByText("Hermes on Contabo")).toBeVisible();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t confirm the disconnect"
  );
  await expect(page.getByText("Hermes on Contabo")).toBeVisible();
  await page
    .getByRole("button", { name: "Retry disconnecting Hermes on Contabo" })
    .click();
  expect(disconnectAttempts).toBe(2);
  await expect(page.getByText("No connections yet.")).toBeVisible();
});
