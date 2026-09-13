import { expect, test } from "@playwright/test";
import { Schema } from "effect";

import { ServiceTicket } from "../packages/protocol/src/services";
import { captureScreen } from "./capture";
import { fundCredits } from "./fund-credits";

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
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Add something by hand" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What are you saving?").selectOption("product");
    await dialog.getByLabel("Website URL").fill("https://example.com/shoes");
    await dialog.getByLabel("Name", { exact: true }).fill("Weekend shoes");
    await dialog.getByLabel(/Details/u).fill("Size 42 · olive green");
    await dialog.getByRole("button", { name: "Save item" }).click();
    await expect(dialog.getByText("Saved", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
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
      .getByRole("textbox", { name: "Address, link or token name" })
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
  test(`token search uses ${name} and tracking keeps one address`, async ({
    page,
  }) => {
    // The provider stub intentionally returns no tokens. This marked UI
    // fixture supplies a result card while purchase and tracking use app flows.
    await page.route("**/api/services/tasks", async (route) => {
      const response = await route.fetch();
      const result = Schema.decodeUnknownSync(
        Schema.Struct({
          v: Schema.Literal(1),
          tasks: Schema.Array(ServiceTicket),
        })
      )(await response.json());
      await route.fulfill({
        json: {
          ...result,
          tasks: result.tasks.map((task) =>
            task.data?.operation === "market_search"
              ? {
                  ...task,
                  data: {
                    ...task.data,
                    stubbed: true,
                    limitations: [
                      "Simulated search result for browser verification. No market prices are supplied.",
                    ],
                    tokens: [
                      {
                        address: "0x1111111111111111111111111111111111111111",
                        name: "Simulated search token",
                        symbol: "FIXTURE",
                        decimals: null,
                        priceUsd: null,
                        liquidityUsd: null,
                        volume24hUsd: null,
                        priceChange24hPercent: null,
                        lastTradeAt: null,
                        listedAt: null,
                        listingSource: null,
                      },
                    ],
                  },
                }
              : task
          ),
        },
      });
    });
    await page.goto("/watchlist?track=true");
    await fundCredits(page);
    const input = page.getByRole("textbox", {
      name: "Address, link or token name",
    });
    await input.fill("froggy");
    await page
      .getByRole("group", { name: "Search on" })
      .getByRole("button", { name, exact: true })
      .click();
    const request = page.waitForRequest(
      (entry) =>
        entry.url().endsWith("/api/services/run") && entry.method() === "POST"
    );
    await input.press("Enter");
    const sent = await request;
    expect(sent.postDataJSON()).toMatchObject({
      input: { network },
    });
    const result = page.getByRole("region", { name: "Token results" });
    await expect(result.getByText(name, { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await result
      .getByRole("button", { name: /^Track /u })
      .first()
      .click();
    await expect(
      result.getByRole("link", { name: /^Open saved /u }).first()
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Saved items" }).getByRole("link")
    ).toHaveCount(1);
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Saved items" }).getByRole("link")
    ).toHaveCount(1);
  });
}

test("creates a real scheduled reminder and cancels it", async ({ page }) => {
  await page.goto("/watchlist");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Set a reminder" }).click();
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
