import { expect, test } from "@playwright/test";

import { captureResponsive } from "./capture";
import { lowerApprovalThreshold } from "./mandate";

/**
 * The stream as the person reads it: tool cards that say what happened in
 * words, an answer rendered as markdown while it arrives, and a log that is
 * busy while the model works. The scripted model closes with a bold line and
 * a table, so all of this runs with no key.
 */
test("a turn streams into the log as cards and markdown, with no browser errors", async ({
  page,
}, testInfo) => {
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
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("What's the cheapest USDC borrow right now?");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const log = page.getByRole("log");
  // Tool cards read as sentences, not as function names.
  await expect(log.getByText("Asked The Graph about USDC")).toBeVisible({
    timeout: 20_000,
  });
  await expect(log.getByText(/Requested a paid resource at/u)).toBeVisible({
    timeout: 20_000,
  });
  await expect(log.getByText("Checked the wallet")).toBeVisible({
    timeout: 20_000,
  });

  // The closing words are markdown, rendered as they stream. Streamdown
  // marks bold with a data attribute rather than a `strong` element.
  await expect(
    log.locator('[data-streamdown="strong"]', { hasText: "scripted model" })
  ).toBeVisible({ timeout: 20_000 });
  const markdownTable = log.locator('[data-streamdown="table"]');
  await expect(markdownTable).toBeVisible();
  await expect(
    markdownTable.getByRole("cell", { name: "wallet_status" })
  ).toBeVisible();

  // Then the turn settles and the log says so.
  await expect(
    page.getByRole("button", { exact: true, name: "Send" })
  ).toBeVisible({ timeout: 20_000 });
  await expect(log).toHaveAttribute("aria-busy", "false");
  await captureResponsive(page, testInfo, "chat-completed");
  expect(browserErrors).toEqual([]);
});

/**
 * The scripted turn is over before a test can look at it, so the one moment
 * it reliably holds still is while it waits for the person: the log is busy,
 * and the money tool under the open ticket says who it is waiting for.
 */
test("while an approval is open the log is busy and the paying tool says it is waiting", async ({
  page,
}) => {
  const leash = await lowerApprovalThreshold(page, 0.001);
  await page.goto("/");
  await leash.applied;

  await page.getByText("Buy the lending snapshot").click();
  const ticket = page.getByLabel(/^Approve .* to /u);
  await expect(ticket).toBeVisible({ timeout: 20_000 });

  const log = page.getByRole("log");
  await expect(log).toHaveAttribute("aria-busy", "true");
  const paying = log.getByRole("button", {
    name: /Requested a paid resource at/u,
  });
  await expect(paying).toContainText("waiting for you");

  await ticket.getByRole("button", { name: "Allow once" }).click();
  await expect(paying).toContainText("done", { timeout: 20_000 });
  await expect(log).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
});

test("a tool card sums up its answer and opens to the raw exchange", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("What's the cheapest USDC borrow right now?");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const card = page.getByRole("button", {
    name: /Asked The Graph about USDC/u,
  });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("done", { timeout: 20_000 });
  // The summary line reads the tool's own answer back in words.
  await expect(page.getByText(/indexes fresh/u)).toBeVisible();

  await card.click();
  await expect(page.getByText('"symbol": "USDC"')).toBeVisible();
});
