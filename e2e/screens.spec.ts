import { expect, test } from "@playwright/test";

import { capturePage } from "./capture";

/**
 * Every place, at four widths: no page error, nothing wider than the
 * viewport, and a picture of each for the eye that the assertions lack.
 */
const PLACES = ["/", "/wallet", "/services", "/agents", "/settings"] as const;
const SIZES = [
  { width: 1440, height: 1000 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
] as const;

for (const place of PLACES) {
  for (const size of SIZES) {
    test(`${place} holds together at ${size.width}px`, async ({
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
      await page.goto(place);
      await expect(
        page.getByRole("navigation", { name: "Primary" }).getByRole("link")
      ).toHaveCount(5);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
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
      if (place === "/services" && size.width === 1440) {
        const choose = page.getByRole("button", {
          name: "Choose search the web",
        });
        const bounds = await choose.boundingBox();
        expect(bounds?.width).toBeGreaterThan(250);
        await expect(
          page.getByRole("heading", { name: "Your tasks" })
        ).toBeInViewport();
      }
      await capturePage(
        page,
        testInfo,
        place === "/" ? "chat" : place.slice(1)
      );
      expect(errors).toEqual([]);
    });
  }
}
