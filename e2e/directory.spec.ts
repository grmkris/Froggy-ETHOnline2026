import { expect, test } from "@playwright/test";

/**
 * A stranger's 402 becomes payable only through the directory.
 *
 * The server's own oracle stands in for the stranger: probing it reads a
 * payable Hedera challenge and adding it lands an entry, which is what puts
 * the host on the allowlist the agent's fetch asks before it sends anything.
 */
test("probe, add, and see the entry in the directory", async ({
  page,
  baseURL,
}) => {
  const api = new URL(baseURL ?? "");
  api.port = String(Number(api.port) + 1);
  await page.goto("/settings");

  const url = new URL("/oracle/snapshot?symbol=USDC", api).href;
  await page.getByLabel("A URL that answers 402").fill(url);
  await page.getByRole("button", { name: "Probe" }).click();
  await expect(page.getByText(/asks to be paid/u)).toBeVisible();
  await expect(page.getByText("payable", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add to the directory" }).click();
  await expect(page.getByText("0.0500 tHBAR")).toBeVisible();
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
