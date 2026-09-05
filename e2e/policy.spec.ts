import { expect, test } from "@playwright/test";

test("editing the mandate changes the rule the agent is held to", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByText("ask above $1.00")).toBeVisible();

  await page.getByText("Edit the mandate").click();
  const threshold = page.getByLabel("Ask me above");
  await threshold.fill("0.25");
  await page.getByRole("button", { name: "Save mandate" }).click();

  // The server echoes the saved mandate back on the socket, and the summary
  // above the editor is drawn from that echo — not from the draft.
  await expect(page.getByText("ask above $0.25")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved");
});

test("deleting my data wipes the mandate and starts over", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Details" }).click();
  await page.getByText("Edit the mandate").click();
  await page.getByLabel("Ask me above").fill("0.5");
  await page.getByRole("button", { name: "Save mandate" }).click();
  await expect(page.getByText("ask above $0.50")).toBeVisible();

  await page.getByRole("tab", { name: "Wallet" }).click();
  await page.getByRole("button", { name: "Delete my data" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  // Back to defaults: the saved threshold is gone with everything else.
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByText("ask above $1.00")).toBeVisible();
});
