import { expect, test } from "@playwright/test";

/**
 * The wallet is the first screen: the total, the three places the money is,
 * the buttons, and the sentence that says why funds cannot be added on a
 * build with no Privy. The drawer's Wallet tab carries the same facts.
 */
test("the wallet comes first, and says what the person holds", async ({
  page,
}) => {
  await page.goto("/");
  const wallet = page.getByRole("region", { name: "Wallet" });
  await expect(wallet).toBeVisible();
  await expect(wallet.getByText("USDC on Base Sepolia")).toBeVisible();
  await expect(wallet.getByText("Your Hedera account")).toBeVisible();
  await expect(
    wallet.getByText("Opens with your first top-up", { exact: false })
  ).toBeVisible();
  await expect(
    wallet.getByText("Service credit", { exact: true })
  ).toBeVisible();
  await expect(wallet.getByText("$0.50").first()).toBeVisible();
  await expect(
    wallet.getByRole("button", { name: "Top up credit $1" })
  ).toBeVisible();
  await expect(
    wallet.getByRole("button", { name: "Connect an agent" })
  ).toBeVisible();
  await expect(wallet.getByRole("button", { name: "Add funds" })).toHaveCount(
    0
  );
  await expect(
    wallet.getByText(
      "Adding funds needs a Privy sign-in; this build runs a local identity."
    )
  ).toBeVisible();

  await page.getByRole("button", { name: "Details" }).click();
  await page.getByRole("tab", { name: "Wallet" }).click();
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByText("Service credit", { exact: true })
  ).toBeVisible();
  await expect(
    drawer.getByText("opened at the first Hedera payment")
  ).toBeVisible();
});
