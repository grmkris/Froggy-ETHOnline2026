import { expect, test } from "@playwright/test";

test("account saves masked demo cards, replaces revisions and revokes credential access", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/settings#payment-methods");
  const panel = page.locator("#payment-methods");
  await panel.getByRole("button", { name: "Add payment method" }).click();
  await panel.getByLabel("Label", { exact: true }).fill("Demo shopping card");
  await panel
    .getByLabel("Your Linea funding address")
    .fill("0x2468246824682468246824682468246824682468");
  await panel.getByLabel("Cardholder name").fill("Synthetic Shopper");
  await panel
    .getByLabel("Card number", { exact: true })
    .fill("4242424242424242");
  await panel.getByLabel("Month", { exact: true }).fill("12");
  await panel.getByLabel("Year", { exact: true }).fill("2030");
  await panel.getByLabel("CVC", { exact: true }).fill("123");
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/payment-methods") &&
      response.request().method() === "POST"
  );
  await panel.getByRole("button", { name: "Save payment method" }).click();
  const reply = await saved;
  expect(reply.ok()).toBe(true);
  const body = await reply.text();
  expect(body).not.toContain("4242424242424242");
  expect(body).not.toContain("Synthetic Shopper");
  expect(body).not.toContain('"cvc"');
  await expect(panel.getByText("Demo shopping card")).toBeVisible();
  await expect(panel.getByText("Demo · simulated balance")).toBeVisible();
  await expect(panel.getByLabel("Card number", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(panel.getByText("Demo shopping card")).toBeVisible();
  await panel.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(panel.getByLabel("Card number", { exact: true })).toHaveValue(
    ""
  );
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await panel.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(panel.getByText("Revoked", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("payment-method entry fits a narrow screen and remains keyboard accessible", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings#payment-methods");
  const panel = page.locator("#payment-methods");
  const add = panel.getByRole("button", { name: "Add payment method" });
  await expect(add).toBeEnabled();
  await add.focus();
  await page.keyboard.press("Enter");
  await panel
    .getByLabel("Label", { exact: true })
    .fill("Synthetic mobile card");
  await panel.getByLabel("Cardholder name").focus();
  await page.keyboard.press("Tab");
  await expect(panel.getByLabel("Card number", { exact: true })).toBeFocused();
  await expect(
    panel.getByLabel("Card number", { exact: true })
  ).toHaveAttribute("type", "password");
  await expect(panel.getByLabel("CVC", { exact: true })).toHaveAttribute(
    "type",
    "password"
  );
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  );
  expect(fits).toBe(true);
  await panel.screenshot({ path: "/tmp/froggy-card-mobile.png" });
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(errors).toEqual([]);
});
