import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The person's tiles bind Froggy's engine in the same session.
 *
 * Lowering the per-spend cap in Account must refuse a spend that used to fit,
 * without a reload. A small `wallet_send` always asks. A service payment under
 * the ask line still runs on its own.
 */

const PAYEE = "0x0000000000000000000000000000000000000001";

const waitForRules = async (page: Page) => {
  await page.goto("/settings");
  await expect(page.getByText(/Your agent may pay up to/u)).toBeVisible({
    timeout: 20_000,
  });
};

const lowerPerSpend = async (page: Page) => {
  await waitForRules(page);
  await page.getByRole("button", { name: "Change these" }).click();
  await page.getByLabel("Most in one payment").fill("0.003");
  await page.getByLabel("Ask me above").fill("0.001");
  await page.getByRole("button", { name: "Save these rules" }).click();
  await expect(
    page.getByText("Saved. Your agent is held to these from now on.")
  ).toBeVisible({ timeout: 20_000 });
};

test("a service payment under the ask line runs without asking", async ({
  page,
}) => {
  await waitForRules(page);
  await page.goto("/chat");
  await page.getByText("Buy the lending snapshot").click();
  await expect(page.getByLabel(/^Approve .* to /u)).toHaveCount(0);
  const receipt = page.getByLabel(/^Receipt:/u).first();
  await expect(receipt).toBeVisible({ timeout: 20_000 });
  await expect(receipt).not.toContainText("per_tx_cap_exceeded");
});

test("lowering the per-spend cap refuses a spend that used to fit, without reload", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await lowerPerSpend(page);
  // Same live session: `/chat` is not in the primary nav (Home is), and a
  // full navigation still hits the workspace that `applyAllowance` already
  // updated — hydrate is once per process.
  await page.goto("/chat");
  await page.getByText("Buy the lending snapshot").click();
  const refused = page.getByLabel(/^Refused:/u).first();
  await expect(refused).toBeVisible({ timeout: 20_000 });
  await expect(refused).toContainText("per_tx_cap_exceeded");
});

test("a small wallet_send asks, and the ticket names the table", async ({
  page,
}) => {
  await waitForRules(page);
  await page.goto("/chat");
  await page
    .getByRole("textbox", { name: "Message" })
    .fill(`Send 0.50 USDC to ${PAYEE}`);
  await page.getByRole("button", { name: "Send" }).click();
  const ticket = page.getByLabel(/^Approve .* to /u);
  await expect(ticket).toBeVisible({ timeout: 20_000 });
  await expect(
    ticket.getByText("Paying a person is your decision, whatever the amount.", {
      exact: true,
    })
  ).toBeVisible();
});
