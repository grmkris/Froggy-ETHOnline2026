import { expect, test } from "@playwright/test";

test("boots the workspace with the primary pill and no browser errors", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
  });

  await page.goto("/chat");

  await expect(page.getByText("Froggy", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  // Three destinations plus the two demoted places, and nothing behind a More.
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link")
  ).toHaveCount(3);
  await expect(
    page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("button", { name: /^More/u })
  ).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("settings show what the session is connected as", async ({ page }) => {
  await page.goto("/settings");
  await page.getByText("Technical details", { exact: true }).click();
  await expect(page.getByText("Session", { exact: true })).toBeVisible();
  await expect(page.getByText("Signer", { exact: true })).toBeVisible();
});

test("the retired paid tool door explains authenticated credit access", async ({
  request,
  page,
}) => {
  const response = await request.get("/oracle/snapshot?symbol=USDC");
  expect(response.status()).toBe(410);
  expect(await response.text()).toContain("credits");
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("/demo/x402");
  await expect(
    page.getByText("100 credits = $1", { exact: false })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /credits|wallet/iu }).first()
  ).toHaveAttribute("href", "/wallet");
  expect(errors).toEqual([]);
});
