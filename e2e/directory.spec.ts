import { expect, test } from "@playwright/test";

/** The retired Froggy seller is never offered as an external payable host. */
test("the old tool door cannot be added as a payable directory entry", async ({
  page,
  baseURL,
}) => {
  const api = new URL(baseURL ?? "");
  api.port = String(Number(api.port) + 1);
  await page.goto("/settings");
  await page
    .getByLabel("A URL that answers 402")
    .fill(new URL("/oracle/snapshot?symbol=USDC", api).href);
  await page.getByRole("button", { name: "Probe" }).click();
  await expect(page.getByText(/answered 410, not 402/u)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to the directory" })
  ).toHaveCount(0);
});

test("a page that is not for sale says so", async ({ page, baseURL }) => {
  const api = new URL(baseURL ?? "");
  api.port = String(Number(api.port) + 1);
  await page.goto("/settings");
  await page
    .getByLabel("A URL that answers 402")
    .fill(new URL("/health", api).href);
  await page.getByRole("button", { name: "Probe" }).click();
  await expect(page.getByText(/answered 200, not 402/u)).toBeVisible();
});
