import { expect, test } from "@playwright/test";

import { capturePage } from "./capture";

/**
 * Every place, at four widths: no page error, nothing wider than the
 * viewport, and a picture of each for the eye that the assertions lack.
 */
const PLACES = [
  { path: "/", name: "chat" },
  { path: "/watchlist", name: "watchlist" },
  { path: "/wallet", name: "wallet" },
  { path: "/inbox?feed=updates", name: "updates" },
  { path: "/activity", name: "activity" },
  { path: "/activity?tab=agents", name: "connections" },
  { path: "/activity?tab=tools", name: "tools" },
  { path: "/settings", name: "settings" },
] as const;
const SIZES = [
  { width: 1440, height: 1000 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
] as const;

for (const place of PLACES) {
  for (const size of SIZES) {
    test(`${place.path} holds together at ${size.width}px`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });
      page.on("pageerror", (error) => {
        errors.push(error.message);
      });
      await page.setViewportSize(size);
      await page.goto(place.path);
      // Three destinations, plus the two demoted places once the rail is up.
      await expect(
        page.getByRole("navigation", { name: "Primary" }).getByRole("link")
      ).toHaveCount(3);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      if (place.path === "/") {
        await expect(page.locator('[data-pose="idle"]').first()).toBeVisible();
      }
      await expect(
        page.getByText("reconnecting…", { exact: true })
      ).toHaveCount(0);
      await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
      const clipped = await page
        .locator("main > article")
        .evaluateAll((nodes) =>
          nodes.some((node) => node.scrollWidth > node.clientWidth)
        );
      expect(clipped).toBe(false);
      if (place.name === "tools" && size.width === 1440) {
        await expect(
          page.getByRole("button", { name: "Choose search the web" })
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "Your tasks" })
        ).toBeInViewport();
      }
      await capturePage(page, testInfo, place.name);
      expect(errors).toEqual([]);
    });
  }
}
