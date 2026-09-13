import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { fundCredits } from "./fund-credits";

const PAYEE = "0x0000000000000000000000000000000000000001";
const waitForRules = async (page: Page) => {
  await page.goto("/settings");
  await expect(page.getByText(/Your agent may pay up to/u)).toBeVisible({
    timeout: 20_000,
  });
};

const runSearch = async (page: Page, prompt: string) => {
  await page.goto("/services?service=web_search");
  await page.getByLabel("Your request").fill(prompt);
  await page.getByRole("button", { name: "Try simulated · 1 credit" }).click();
};

test("a funded service runs within credit limits without a wallet approval", async ({
  page,
}) => {
  await page.goto("/wallet");
  await fundCredits(page);
  await runSearch(page, "A prepaid task");
  await expect(
    page.getByText("1 credit used", { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByLabel(/^Approve .* to /u)).toHaveCount(0);
});

test("lowering the credit cap refuses a task that used to fit", async ({
  page,
}) => {
  await page.goto("/wallet");
  await fundCredits(page);
  await runSearch(page, "Within the original credit cap");
  await expect(
    page.getByText("1 credit used", { exact: true }).first()
  ).toBeVisible();
  await page.goto("/wallet");
  await page.getByText("Credit limits", { exact: true }).click();
  await page.getByLabel("Most per task (credits)").fill("0.5");
  await page.getByRole("button", { name: "Save credit limits" }).click();
  await expect(page.getByText("Credit limits saved.")).toBeVisible();
  await runSearch(page, "Refused by the new credit cap");
  await expect(page.getByText(/credit_task_cap/u).first()).toBeVisible();
  await expect(page.getByLabel(/^Approve .* to /u)).toHaveCount(0);
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
