import { expect, test } from "@playwright/test";

import { captureScreen } from "./capture";

for (const width of [1440, 390, 320]) {
  test(`save, edit, attach and archive a product at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    await page.setViewportSize({ width, height: width === 320 ? 700 : 900 });
    await page.goto("/watchlist");
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What are you saving?").selectOption("product");
    await dialog.getByLabel("Website URL").fill("https://example.com/shoes");
    await dialog.getByLabel("Name", { exact: true }).fill("Weekend shoes");
    await dialog.getByLabel(/Details/u).fill("Size 42 · olive green");
    await dialog.getByRole("button", { name: "Save item" }).click();
    await dialog
      .getByRole("button", { name: "Save without monitoring" })
      .click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await page.getByRole("link", { name: /Weekend shoes/u }).click();
    await expect(
      page.getByRole("heading", { name: "Weekend shoes" })
    ).toBeVisible();
    await expect(
      page.getByText("Size 42 · olive green", { exact: true })
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit details" }).click();
    await dialog
      .getByLabel("Name", { exact: true })
      .fill("Olive weekend shoes");
    await dialog.getByRole("button", { name: "Save item" }).click();
    await expect(
      page.getByRole("heading", { name: "Olive weekend shoes" })
    ).toBeVisible();
    await captureScreen(page, testInfo, `watchlist-detail-${width}`);
    await page.getByRole("button", { name: "Ask Froggy about this" }).click();
    await expect(
      page.getByRole("button", { name: "Remove attached item" })
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    await captureScreen(page, testInfo, `home-attached-${width}`);
    await page.getByRole("button", { name: "Remove attached item" }).click();
    await expect(
      page.getByRole("button", { name: "Remove attached item" })
    ).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Watchlist", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Search saved items" })
      .fill("olive");
    await page.getByRole("link", { name: /Olive weekend shoes/u }).click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Restore item" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Restore item" }).click();
    await expect(
      page.getByRole("button", { name: "Archive", exact: true })
    ).toBeVisible();
    await page.getByRole("button", { name: "Ask Froggy about this" }).click();
    await page
      .getByRole("textbox", { name: "Message" })
      .fill("What details did I save?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      page.getByRole("log").getByRole("link", { name: "From your Watchlist" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Stop the run" })
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("log").getByRole("link", { name: "From your Watchlist" })
    ).toBeVisible();
    await expect(
      page
        .getByRole("log")
        .getByText("What details did I save?", { exact: false })
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const [network, name] of [
  ["eip155:4663", "Robinhood"],
  ["eip155:8453", "Base"],
  ["eip155:1", "Ethereum"],
] as const) {
  test(`token lookup and save preserve ${name} identity`, async ({ page }) => {
    await page.goto("/watchlist?discover=true");
    const discover = page.getByRole("region", { name: "Discover tokens" });
    await discover.getByLabel("Chain", { exact: true }).selectOption(network);
    await discover
      .getByLabel("Name, symbol or address")
      .fill("0x1111111111111111111111111111111111111111");
    await discover.getByRole("button", { name: "Look up" }).click();
    const result = discover.getByRole("region", { name: "Token results" });
    await expect(result.getByText(name, { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      result.getByText("Simulated data", { exact: true })
    ).toBeVisible();
    await result.getByRole("button", { name: /^Save /u }).click();
    const setup = page.getByRole("dialog");
    await expect(setup.getByLabel("How often?")).toHaveValue("");
    await setup
      .getByRole("button", { name: "Save without monitoring" })
      .click();
    await expect(
      result.getByRole("link", { name: /^Open saved /u })
    ).toBeVisible();
    await page.reload();
    const items = page.getByRole("region", { name: "Saved items" });
    await expect(items.getByRole("link")).toHaveCount(1);
    await expect(items.getByRole("link")).toContainText(name);
    await discover.getByLabel("Chain", { exact: true }).selectOption(network);
    await discover
      .getByLabel("Name, symbol or address")
      .fill("0x1111111111111111111111111111111111111111");
    await discover.getByRole("button", { name: "Look up" }).click();
    const saved = result.getByRole("link", { name: /^Open saved /u });
    await expect(saved).toBeVisible({ timeout: 20_000 });
    await saved.click();
    await expect(
      page.getByRole("region", { name: "Token snapshot" })
    ).toContainText("Simulated");
  });
}

test("creates a real scheduled reminder and cancels it", async ({ page }) => {
  await page.goto("/watchlist");
  await page.getByRole("button", { name: "Reminder", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Remind me to…").fill("Check my travel dates");
  const tomorrow = new Date(Date.now() + 86_400_000);
  const local = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}T09:00`;
  await dialog.getByLabel("When", { exact: true }).fill(local);
  await dialog.getByRole("button", { name: "Set reminder" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Cancel Check my travel dates" })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel Check my travel dates" })
  ).toHaveCount(0);
});
