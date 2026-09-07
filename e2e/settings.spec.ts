import { expect, test } from "@playwright/test";

/**
 * Delete my data means the receipts too: a paid task leaves one in the
 * wallet's activity, and after the deletion the activity is empty again.
 */
test("deleting my data wipes the receipts and starts over", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Buy the lending snapshot").click();
  await page.goto("/wallet");
  const activity = page.getByRole("region", { name: "Activity" });
  await expect(activity.getByText("Nothing spent or refused yet.")).toHaveCount(
    0,
    { timeout: 20_000 }
  );

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete my data" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForLoadState("load");

  await page.goto("/wallet");
  await expect(
    page
      .getByRole("region", { name: "Activity" })
      .getByText("Nothing spent or refused yet.")
  ).toBeVisible();
});
