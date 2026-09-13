import { writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { Schema } from "effect";

import { TokenSnapshotResult } from "../packages/protocol/src/trading-market";
import {
  WatchlistCaptured,
  WatchlistDetails,
} from "../packages/protocol/src/watchlist";
import recordedSnapshot from "./fixtures/landing-token-snapshot.json" with { type: "json" };
import { fundCredits } from "./fund-credits";
import { startMerchant } from "./merchant-fixture";

/** Chromium's encoder preserves the real viewport without a mockup or image overlay. */
const capture = async (page: Page, info: TestInfo, name: string) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  // Playwright waits for the screenshot paint lifecycle before Chromium encodes WebP.
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    animations: "disabled",
  });
  const session = await page.context().newCDPSession(page);
  const shot = await session.send("Page.captureScreenshot", {
    format: "webp",
    quality: 95,
    captureBeyondViewport: false,
  });
  await writeFile(
    info.outputPath(`${name}.webp`),
    Buffer.from(shot.data, "base64")
  );
  await session.detach();
};

test("landing screens come from local app flows", async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Find the cheapest USDC borrowing options and help me compare them.");
  await capture(page, info, "home");
  await fundCredits(page);
  const token = await page.evaluate(() =>
    localStorage.getItem("froggy.local-identity")
  );
  const headers = { authorization: `Bearer ${token}` };

  const merchant = await startMerchant();
  try {
    await page
      .getByRole("textbox", { name: "Message" })
      .fill(`Buy ${merchant.url} for at most five cents`);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const approval = page.getByLabel("Approve URL purchase", { exact: true });
    await expect(approval).toBeVisible({ timeout: 20_000 });
    await approval.getByRole("button", { name: /^Approve /u }).click();
    await expect(page.getByLabel(/^Receipt:/u).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("log")).toHaveAttribute("aria-busy", "false", {
      timeout: 20_000,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-slot="message-scroller-viewport"]').hover();
    await page.mouse.wheel(0, -2000);
    await page
      .getByLabel(/^Receipt:/u)
      .first()
      .scrollIntoViewIfNeeded();
    await capture(page, info, "chat-mobile");
    await page.setViewportSize({ width: 1440, height: 900 });
    // A second real task holds at approval, keeping the previous amount and receipt in view.
    await page
      .getByRole("textbox", { name: "Message" })
      .fill("Send 0.004 USDC to 0x0000000000000000000000000000000000000001");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByLabel(/^Approve .* to /u)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("log")).toHaveAttribute("aria-busy", "true");
    await page.getByText(/Froggy paused, waiting for your answer/u).waitFor();
    await page.locator('[data-slot="message-scroller-viewport"]').hover();
    await page.mouse.wheel(0, -2000);
    await expect(async () => {
      await page
        .getByLabel(/^Receipt:/u)
        .first()
        .scrollIntoViewIfNeeded();
      await expect(page.getByLabel(/^Receipt:/u).first()).toBeInViewport();
    }).toPass();
    await capture(page, info, "chat");
  } finally {
    await merchant.stop();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "Your money", exact: true }).click();
  await expect(
    page
      .getByRole("banner")
      .getByRole("button", { name: "Stop the run", exact: true })
  ).toBeVisible();
  await page.getByText("Credit limits", { exact: true }).click();
  await expect(page.getByLabel("Most per task (credits)")).toBeVisible();
  await expect(page.locator('[data-slot="credit-total"]')).toHaveText("100");
  await capture(page, info, "wallet");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Stop the run", exact: true })
    .click();

  const snapshot =
    Schema.decodeUnknownSync(TokenSnapshotResult)(recordedSnapshot);
  const savedResponse = await page.request.post("/api/watchlist/capture", {
    headers,
    data: {
      v: 2,
      title: "USDC · saved market research",
      notes:
        "Recorded Birdeye history on Base. Saved for research, not a live quote.",
      source: {
        _tag: "token",
        network: "eip155:8453",
        address: snapshot.address,
      },
      enrich: false,
      acceptedPrice: 0,
    },
  });
  expect(savedResponse.ok()).toBe(true);
  const saved = Schema.decodeUnknownSync(WatchlistCaptured)(
    await savedResponse.json()
  );
  // Replay recorded provider output, as in watchlist-capture.spec.ts. The saved
  // item and its metadata still come from the app; no market values are invented.
  await page.route(
    `**/api/watchlist/${saved.item.id}/details`,
    async (route) => {
      const response = await route.fetch();
      const details = Schema.decodeUnknownSync(WatchlistDetails)(
        await response.json()
      );
      await route.fulfill({ json: { ...details, snapshot } });
    }
  );
  await page.goto("/watchlist");
  await page
    .getByRole("link", { name: "USDC · saved market research", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Price history", exact: true })
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Price history", exact: true })
      .locator("svg.recharts-surface")
  ).toBeVisible();
  await capture(page, info, "watchlist");

  await page.goto("/browser");
  await expect(
    page.getByRole("button", { name: "Take the page", exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Browser Use is stubbed.", { exact: false })
  ).toBeVisible();
  await capture(page, info, "browser-unavailable");

  await page.goto("/agents");
  await page
    .getByText("Advanced: connect with a token", { exact: true })
    .click();
  await page.getByLabel("Agent name").fill("Research MCP client · local demo");
  await page.getByRole("button", { name: "Create connection" }).click();
  const credential = page.getByRole("textbox", { name: "Connection token" });
  await expect(credential).toHaveValue(/^fgy_/u);
  const secret = await credential.inputValue();
  const connected = await page.request.post("/mcp", {
    headers: { authorization: `Bearer ${secret}` },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(connected.ok()).toBe(true);
  await page
    .getByRole("button", { name: "Refresh status", exact: true })
    .click();
  const disconnect = page.getByRole("button", {
    name: "Disconnect Research MCP client · local demo",
    exact: true,
  });
  await disconnect.scrollIntoViewIfNeeded();
  await expect(disconnect).toBeInViewport();
  await expect(credential).toBeInViewport();
  await capture(page, info, "connections");
  // The publicly pictured token only ever authenticates this disposable stub server.
  await page
    .getByRole("button", {
      name: "Disconnect Research MCP client · local demo",
      exact: true,
    })
    .click();
  const revoked = await page.request.post("/mcp", {
    headers: { authorization: `Bearer ${secret}` },
    data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
  });
  expect(revoked.status()).toBe(401);
  expect(errors).toEqual([]);
});
