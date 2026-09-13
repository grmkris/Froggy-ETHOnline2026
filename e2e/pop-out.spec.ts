import { expect, test } from "@playwright/test";

import { captureResponsive, captureScreen } from "./capture";

/**
 * The page leaves the column and comes back.
 *
 * No Chrome is started: the card in its "nothing open yet" state is enough
 * to prove it moves. Driving a real page is a manual check.
 */

test("the page can go to a split pane and back", async ({ page }, testInfo) => {
  await page.setViewportSize({ height: 860, width: 1400 });
  await page.goto("/chat");
  // Ask for the card without starting a Chrome: the card, with its "nothing
  // open yet" explanation, is all the layout needs.
  await page.getByRole("button", { name: "Show the browser" }).click();
  await captureResponsive(page, testInfo, "browser-inline");
  await page
    .getByRole("button", { name: "Show the page beside the conversation" })
    .click();
  await expect(
    page.getByRole("complementary", {
      name: "The shared browser, beside the conversation",
    })
  ).toBeVisible();
  await captureScreen(page, testInfo, "browser-split");
  await page
    .getByRole("button", { name: "Put the page back in the conversation" })
    .click();
  await expect(
    page.getByRole("complementary", {
      name: "The shared browser, beside the conversation",
    })
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show the page beside the conversation" })
    .click();
  const watchlistToggle = page.getByRole("button", {
    name: "Toggle watchlist pane",
  });
  await expect(watchlistToggle).toHaveAttribute("aria-pressed", "false");
  await watchlistToggle.click();
  await expect(
    page.getByRole("complementary", { name: "Watchlist pane" })
  ).toBeVisible();
  await expect(watchlistToggle).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("complementary", {
      name: "The shared browser, beside the conversation",
    })
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Show the page beside the conversation" })
  ).toBeVisible();
});

test("the page can go to its own window, and the tab knows", async ({
  context,
  page,
}, testInfo) => {
  await page.setViewportSize({ height: 860, width: 1400 });
  await page.goto("/chat");
  await page.getByRole("button", { name: "Show the browser" }).click();
  const opened = context.waitForEvent("page");
  await page
    .getByRole("button", { name: "Open the page in a new window" })
    .click();
  const popup = await opened;
  await popup.waitForLoadState();
  expect(popup.url()).toContain("/browser");
  await expect(popup.getByText("Froggy · the page")).toBeVisible();
  await expect(
    page.getByText("The page is open in another window.")
  ).toBeVisible();

  await captureResponsive(popup, testInfo, "browser-window");
  await popup.close();
  await expect(
    page.getByText("The page is open in another window.")
  ).toHaveCount(0);
});

test("browser resize is keyboard accessible and keeps chat readable across breakpoints", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/chat");
  await page
    .getByRole("button", { name: "Show the browser", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show the page beside the conversation" })
    .click();
  const pane = page.getByRole("complementary", {
    name: "The shared browser, beside the conversation",
  });
  const resize = page.getByRole("button", { name: "Resize the browser pane" });
  await resize.focus();
  await page.keyboard.press("Home");
  await expect(pane).toHaveCSS("width", "380px");
  await page.keyboard.press("ArrowLeft");
  await expect(pane).toHaveCSS("width", "396px");
  await page.keyboard.press("End");
  await expect(pane).toHaveCSS("width", "736px");
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(pane).toHaveCSS("width", "576px");
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(pane).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true })
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(pane).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true })
  ).toBeVisible();
});
