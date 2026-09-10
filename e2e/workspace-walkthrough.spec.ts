import { expect, test } from "@playwright/test";

import { capturePage, captureScreen } from "./capture";

for (const size of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`walk through the wallet, services and agent setup at ${size.width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.setViewportSize(size);
    await page.goto("/wallet");
    await expect(
      page.getByText("Total unavailable", { exact: true })
    ).toBeVisible();
    await page.getByText("Where it is", { exact: true }).click();
    await capturePage(page, testInfo, "wallet-breakdown");
    await page.getByRole("button", { name: "Add funds", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Add funds" })).toBeVisible();
    await captureScreen(page, testInfo, "add-funds");
    await page.keyboard.press("Escape");

    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Explore" }).click();
    await page.goto("/services");
    await page.getByRole("button", { name: "Choose search the web" }).click();
    await page
      .getByLabel("Your request")
      .fill("Find useful sources for planning a weekend in Berlin.");
    await capturePage(page, testInfo, "service-request");
    await page.getByRole("button", { name: "Try simulated · $0.01" }).click();
    const tasks = page.getByRole("region", { name: "Service tasks" });
    await expect(tasks).toContainText("DEMO — Search the web");
    await expect(
      page.getByRole("heading", { name: "Your tasks" })
    ).toBeInViewport();
    await captureScreen(page, testInfo, "service-result");

    // The secondary places live in the rail at desktop width and in the top
    // bar below it — exactly one of the two exists at any given width.
    await page.getByRole("link", { name: "Connections" }).click();
    await expect(
      page.getByRole("button", { name: "Copy for your agent" })
    ).toBeVisible();
    await expect(page.getByLabel("Agent name")).toBeHidden();
    await capturePage(page, testInfo, "agent-instructions");
    await page
      .getByText("Advanced: connect with a token", { exact: true })
      .click();
    await page.getByLabel("Agent name").fill("My research assistant");
    await page.getByLabel("Agent name").scrollIntoViewIfNeeded();
    await captureScreen(page, testInfo, "agent-token-form");
    await page.getByRole("button", { name: "Create connection" }).click();
    await expect(
      page.getByRole("textbox", { name: "Connection token" })
    ).toBeVisible();
    await page.getByRole("button", { name: "I pasted it" }).click();
    await page
      .getByText("Advanced: connect with a token", { exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Connected agents" })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("heading", { name: "My research assistant" })
    ).toBeVisible();
    await captureScreen(page, testInfo, "agent-connected");
    await page
      .getByRole("button", { name: "Disconnect My research assistant" })
      .click();
    await expect(
      page.getByRole("heading", { name: "My research assistant" })
    ).toHaveCount(0);

    await page.getByRole("link", { name: "Account" }).click();
    await page.getByRole("button", { name: "Delete my data" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await captureScreen(page, testInfo, "delete-confirmation");
    await page.getByRole("button", { name: "Keep it" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
