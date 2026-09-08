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

  await page.goto("/");

  await expect(page.getByText("Froggy", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link")
  ).toHaveCount(3);

  await expect(
    page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("button", { name: "More" })
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("settings show what the session is connected as", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("Session", { exact: true })).toBeVisible();
  await expect(page.getByText("Signer", { exact: true })).toBeVisible();
});

test("the paid endpoint answers 402 before it answers anything else", async ({
  request,
}) => {
  const response = await request.get("/oracle/snapshot?symbol=USDC");

  // This is the Hedera qualification in one assertion: the resource is really
  // gated, not gated-looking.
  expect(response.status()).toBe(402);
  const parsed: unknown = await response.json();
  // SAFETY: the assertions below are the test. A 402 body that does not carry
  // these fields fails them, which is exactly what this spec exists to catch.
  const body = parsed as {
    accepts: { network: string; payTo: string; scheme: string }[];
    x402Version: number;
  };
  expect(body.x402Version).toBe(2);
  expect(body.accepts[0]?.network).toBe("hedera:testnet");
  expect(body.accepts[0]?.scheme).toBe("exact");
});
