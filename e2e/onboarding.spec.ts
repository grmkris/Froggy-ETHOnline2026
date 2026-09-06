import { expect, test } from "@playwright/test";

/**
 * The wallet section of the drawer, on a build with no Privy: the service
 * credit in dollars, where the Hedera account will come from, and why funds
 * cannot be added here. The live sentence and button need a Privy sign-in,
 * which no browser test has.
 */
test("the drawer says what the person holds and what adding funds needs", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Details" }).click();
  await page.getByRole("tab", { name: "Wallet" }).click();
  await expect(page.getByText("Service credit", { exact: true })).toBeVisible();
  await expect(page.getByText("$0.50").first()).toBeVisible();
  await expect(
    page.getByText("opened at the first Hedera payment")
  ).toBeVisible();
  await expect(
    page.getByText(
      "Adding funds needs a Privy sign-in; this build runs a local identity."
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add funds" })).toHaveCount(0);
});
