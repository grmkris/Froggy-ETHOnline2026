import { expect, test } from "@playwright/test";

import { lowerApprovalThreshold } from "./mandate";

/**
 * The approval round trip, end to end, with no key in sight.
 *
 * The scripted model pays the oracle a fraction of a cent, which is under
 * every default cap. Lowering the threshold below that makes the same turn
 * ask — and the answer, given from the pinned ticket, is what the receipt
 * records.
 */
test("a spend over the threshold asks, and the answer is on the receipt", async ({
  page,
}) => {
  const leash = await lowerApprovalThreshold(page, 0.001);
  await page.goto("/");
  await leash.applied;

  await page.getByText("Buy the lending snapshot").click();

  const ticket = page.getByLabel(/^Approve .* to /u);
  await expect(ticket).toBeVisible({ timeout: 20_000 });
  await expect(ticket.getByText("Your call", { exact: true })).toBeVisible();
  // The four answers, in the order every surface uses.
  await expect(ticket.getByRole("button")).toHaveText([
    "Stop the agent",
    "Not this time",
    "Allow for this session",
    "Allow once",
  ]);
  await ticket.getByRole("button", { name: "Allow once" }).click();

  await expect(ticket).toHaveCount(0);
  const receipt = page.getByLabel(/^Receipt: Paid/u).first();
  await expect(receipt).toBeVisible({ timeout: 20_000 });
  await expect(receipt).toContainText("you allowed it once");
});

test("saying no files a refusal, and nothing is paid", async ({ page }) => {
  const leash = await lowerApprovalThreshold(page, 0.001);
  await page.goto("/");
  await leash.applied;

  await page.getByText("Buy the lending snapshot").click();
  const ticket = page.getByLabel(/^Approve .* to /u);
  await expect(ticket).toBeVisible({ timeout: 20_000 });
  await ticket.getByRole("button", { name: "Not this time" }).click();

  const refused = page.getByLabel(/^Refused:/u).first();
  await expect(refused).toBeVisible({ timeout: 20_000 });
  await expect(refused).toContainText("You declined this spend");
  await expect(refused).toContainText("approval_denied");
});
