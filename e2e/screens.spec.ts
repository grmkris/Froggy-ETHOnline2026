import { expect, test } from "@playwright/test";

/**
 * Every place, at three widths: no page error, nothing wider than the
 * viewport, and a picture of each for the eye that the assertions lack.
 */
const PLACES = ["/", "/wallet", "/services", "/agents", "/settings"] as const;
const SIZES = [
  { width: 1440, height: 1000 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const;

for (const place of PLACES) {
  for (const size of SIZES) {
    test(`${place} holds together at ${size.width}px`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => {
        errors.push(error.message);
      });
      await page.setViewportSize(size);
      await page.goto(place);
      await expect(
        page.getByRole("navigation", { name: "Primary" }).getByRole("link")
      ).toHaveCount(5);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
      await page.screenshot({
        fullPage: false,
        path: testInfo.outputPath(
          `${place === "/" ? "chat" : place.slice(1)}-${size.width}.png`
        ),
      });
      expect(errors).toEqual([]);
    });
  }
}
