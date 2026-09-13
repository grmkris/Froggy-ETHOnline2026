import { expect, test } from "@playwright/test";

import type { BrowserState } from "../packages/protocol/src/browser";

/** Captures the actual browser chrome around an explicitly synthetic merchant. */
test("landing media captures the shared browser and a saved watchlist item", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/browser/viewer", async (route) => {
    await route.fulfill({
      json: { v: 1, url: "https://live.browser-use.com/froggy-landing-demo" },
    });
  });
  await page.route(
    "https://live.browser-use.com/froggy-landing-demo",
    async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Demo merchant</title><style>body{background:#f2f0e5;color:#214436;margin:0;font:16px system-ui}header{padding:28px 35px;border-bottom:1px solid #ced8c4;display:flex;justify-content:space-between}main{padding:55px 40px}small{letter-spacing:2px;font-size:11px}h1{font-size:48px;letter-spacing:-2px;line-height:1.1;max-width:420px;margin:22px 0}p{line-height:1.7;max-width:400px}.product{margin-top:35px;padding:35px;border-radius:20px;background:#dce8ce;display:flex;align-items:center;gap:28px}.plant{font-size:100px}strong{font-size:24px;display:block}.note{padding:18px;background:#214436;color:#fff;font-size:12px}button{background:#214436;color:#fff;border:0;padding:14px 20px;border-radius:40px;margin-top:20px}</style></head><body><div class="note">DEMONSTRATION STORE · No real purchase or browser session</div><header><b>little things.</b><span>For a happier desk</span></header><main><small>A LITTLE GREEN GOES A LONG WAY</small><h1>Make room for something good.</h1><p>A small companion for the place where your big ideas begin.</p><div class="product"><span class="plant" aria-hidden="true">🌱</span><div><strong>The desk garden</strong><p>Example product · $24.00</p><button>View details</button></div></div></main></body></html>`,
      });
    }
  );
  await page.routeWebSocket("**/ws/browser", (socket) => {
    const state: BrowserState = {
      activeTabId: null,
      error: null,
      interaction: "human",
      queue: null,
      status: "running",
      tabs: [],
      viewport: { width: 1280, height: 800 },
      cloud: {
        control: "human",
        viewerReady: true,
        expiresAt: Date.now() + 3_600_000,
        idleExpiresAt: Date.now() + 600_000,
        stubbed: true,
      },
    };
    socket.send(JSON.stringify({ v: 1, type: "browser.state", state }));
  });
  await page.goto("/browser");
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Make room for something good." })
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("browser.png") });
  await page.goto("/watchlist");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What are you saving?").selectOption("product");
  await dialog
    .getByLabel("Website URL")
    .fill("https://example.com/desk-garden");
  await dialog
    .getByLabel("Name", { exact: true })
    .fill("The desk garden · demo");
  await dialog
    .getByLabel(/Details/u)
    .fill(
      "A little green for the workspace. Demonstration item, no monitoring or purchase enabled."
    );
  await dialog.getByRole("button", { name: "Save item" }).click();
  await dialog.getByRole("button", { name: "Save without monitoring" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: /The desk garden/u })
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("watchlist.png") });
});
