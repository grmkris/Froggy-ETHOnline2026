import { expect, test } from "@playwright/test";

import { captureScreen } from "./capture";

for (const width of [390, 1440]) {
  test(`monitoring setup, budget, pause and archive at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/watchlist");
    const budget = page.getByRole("region", { name: "Monitoring budget" });
    await budget.getByLabel("Monthly monitoring limit (USD)").fill("2");
    await budget.getByRole("button", { name: "Save budget" }).click();
    await expect(budget.getByText("Monitoring budget saved.")).toBeVisible();
    await expect(
      budget.getByLabel("Monthly monitoring limit (USD)")
    ).toHaveValue("2");
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What are you saving?").selectOption("product");
    await dialog
      .getByLabel("Website URL")
      .fill("https://example.com/green-shoe");
    await dialog.getByLabel("Name", { exact: true }).fill("Monitoring sample");
    await dialog.getByLabel(/Details/u).fill("Green · size 42");
    await dialog
      .getByRole("button", { name: "Save item", exact: true })
      .click();
    await expect(dialog.getByLabel("How often?")).toHaveValue("");
    await dialog.getByLabel("How often?").selectOption("daily");
    await dialog.getByLabel("Notify me when").selectOption("price_below");
    await dialog.getByLabel("Target price").fill("50");
    await dialog.getByLabel("Currency").fill("EUR");
    await dialog
      .getByRole("button", { name: "Enable monitoring", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("link", { name: /Monitoring sample/u }).click();
    const monitor = page.getByRole("region", {
      name: "Monitoring Monitoring sample",
    });
    await expect(monitor.getByText("Scheduled", { exact: true })).toBeVisible();
    await monitor.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(monitor.getByText("Paused", { exact: true })).toBeVisible();
    await page.reload();
    await expect(monitor.getByText("Paused", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await captureScreen(page, testInfo, `monitoring-${width}`);
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Restore item" })
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}
