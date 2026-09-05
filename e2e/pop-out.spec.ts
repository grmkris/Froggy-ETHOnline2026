import { expect, test } from "@playwright/test";

/**
 * The page leaves the column and comes back.
 *
 * No Chrome is started: the card in its "nothing open yet" state is enough
 * to prove it moves. Driving a real page is a manual check.
 */

test("the page can go to a split pane and back", async ({ page }) => {
  await page.setViewportSize({ height: 860, width: 1400 });
  await page.goto("/");
  // Ask for the card without starting a Chrome: the card, with its "nothing
  // open yet" explanation, is all the layout needs.
  await page.getByRole("button", { name: "Show the browser" }).click();
  await page
    .getByRole("button", { name: "Show the page beside the conversation" })
    .click();
  await expect(
    page.getByRole("complementary", {
      name: "The shared browser, beside the conversation",
    })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Put the page back in the conversation" })
    .click();
  await expect(
    page.getByRole("complementary", {
      name: "The shared browser, beside the conversation",
    })
  ).toHaveCount(0);
});

test("the page can go to its own window, and the tab knows", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ height: 860, width: 1400 });
  await page.goto("/");
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

  await popup.close();
  await expect(
    page.getByText("The page is open in another window.")
  ).toHaveCount(0);
});
