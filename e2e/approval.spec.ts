import { expect, test } from "@playwright/test";

import { captureResponsive } from "./capture";
import { lowerApprovalThreshold } from "./mandate";

/** Wallet transfers keep their explicit approval and receipt flow. */
test("a wallet transfer asks, and the answer is on the receipt", async ({
  page,
}, testInfo) => {
  const leash = await lowerApprovalThreshold(page, 0.001);
  await page.goto("/chat");
  await leash.applied;

  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Send 0.004 USDC to 0x0000000000000000000000000000000000000001");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const ticket = page.getByLabel(/^Approve .* to /u);
  await expect(ticket).toBeVisible({ timeout: 20_000 });
  await expect(ticket.getByText("Your call", { exact: true })).toBeVisible();
  const ledger = ticket.getByRole("list", { name: "Spend breakdown" });
  await expect(ledger).toBeVisible();
  await expect(
    ledger.getByRole("listitem").filter({ hasText: "Product" })
  ).toBeVisible();
  await expect(
    ledger.getByRole("listitem").filter({ hasText: "Agent spend so far today" })
  ).toBeVisible();
  // The four answers, in the order every surface uses.
  await expect(ticket.getByRole("button")).toHaveText([
    "Stop the agent",
    "Not this time",
    "Allow for this session",
    /^Approve /u,
  ]);
  await captureResponsive(page, testInfo, "chat-approval");
  await ticket.getByRole("button", { name: /^Approve /u }).click();

  await expect(ticket).toHaveCount(0);
  const receipt = page.getByLabel(/^Receipt: Nothing was paid/u).first();
  await expect(receipt).toBeVisible({ timeout: 20_000 });
  await expect(receipt).toContainText(
    "This receipt exists so a demo cannot be mistaken for a purchase."
  );
  await expect(receipt).toContainText("stubbed");
  await expect(receipt).not.toContainText("Simulated");
  await expect(receipt).toContainText("you allowed it once");
  await captureResponsive(page, testInfo, "chat-receipt");
});

test("saying no files a refusal, and nothing is paid", async ({ page }) => {
  const leash = await lowerApprovalThreshold(page, 0.001);
  await page.goto("/chat");
  await leash.applied;

  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Send 0.004 USDC to 0x0000000000000000000000000000000000000001");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const ticket = page.getByLabel(/^Approve .* to /u);
  await expect(ticket).toBeVisible({ timeout: 20_000 });
  await ticket.getByRole("button", { name: "Not this time" }).click();

  const refused = page.getByLabel(/^Refused:/u).first();
  await expect(refused).toBeVisible({ timeout: 20_000 });
  await expect(refused).toContainText("You declined this spend");
  await expect(refused).toContainText("approval_denied");
});
