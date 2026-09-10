/**
 * Design review harness: open a page, exercise it, capture it at review widths.
 *
 * The brief's review loop is "start preview, open it, click a control, resize,
 * emulate reduced motion, capture an image, inspect console errors". This does
 * exactly that and nothing else, so a captured image always arrives with the
 * console log that was true while it was taken.
 *
 * Every viewport gets its own browser context. Parallel workers therefore never
 * share a profile, and none of them can reach a signed-in everyday browsing
 * session. The contexts are independent, so they run concurrently.
 *
 *   node design/preproduction/tools/review-shot.mjs <url|file> <out-dir> [--click sel] [--video]
 *
 * Exit status is 1 when any context logged a console error, so this can gate a
 * review rather than merely illustrate one. A screenshot cannot prove animation
 * timing; pass --video to also record playback.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, devices } from "@playwright/test";

/** The brief's review widths, plus the narrow stress check. */
const VIEWPORTS = [
  { name: "1440", options: { viewport: { width: 1440, height: 900 } } },
  { name: "768", options: { viewport: { width: 768, height: 1024 } } },
  { name: "390", options: { ...devices["iPhone 13"], isMobile: true } },
  { name: "320", options: { viewport: { width: 320, height: 640 } } },
  {
    name: "1440-reduced",
    options: {
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    },
  },
];

const args = process.argv.slice(2);
const [target, outArg] = args;
if (target === undefined || outArg === undefined) {
  console.error(
    "usage: review-shot.mjs <url|file> <out-dir> [--click sel] [--video]"
  );
  process.exit(2);
}

const clickAt = args.indexOf("--click");
const selector = clickAt === -1 ? null : args[clickAt + 1];
const video = args.includes("--video");
const url = /^https?:\/\//u.test(target)
  ? target
  : `file://${path.resolve(target)}`;
const outDir = path.resolve(outArg);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const browserVersion = browser.version();

/** One isolated context, driven through the whole loop, reporting what it observed. */
const review = async ({ name, options }) => {
  const contextOptions = { ...options };
  if (video) {
    contextOptions.recordVideo = { dir: outDir };
  }
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(url, { waitUntil: "networkidle" });
  if (selector !== null) {
    const control = page.locator(selector).first();
    if ((await control.count()) > 0) {
      await control.click();
    }
  }

  // Reduced motion is a claim about the document, so read it back rather than trusting the flag.
  const observed = await page.evaluate(() => ({
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    oklch: CSS.supports("color", "oklch(0.5 0.1 150)"),
    running: document
      .getAnimations()
      .filter((animation) => animation.playState === "running").length,
    scrollsSideways:
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  }));

  const shot = `${name}.png`;
  await page.screenshot({ path: path.resolve(outDir, shot), fullPage: true });
  await context.close();
  return { viewport: name, shot, ...observed, errors };
};

const runs = await Promise.all(VIEWPORTS.map(review));
await browser.close();

for (const run of runs) {
  console.log(
    `${run.viewport.padEnd(12)} oklch=${run.oklch} reduced=${run.reducedMotion} ` +
      `running=${run.running} sideways=${run.scrollsSideways} errors=${run.errors.length}`
  );
}

const report = {
  url,
  browser: browserVersion,
  at: new Date().toISOString(),
  runs,
};
await writeFile(
  path.resolve(outDir, "review.json"),
  `${JSON.stringify(report, null, 2)}\n`
);

const sideways = runs.filter((run) => run.scrollsSideways);
if (sideways.length > 0) {
  console.error(
    `horizontal scroll at: ${sideways.map((run) => run.viewport).join(", ")}`
  );
}
const failed = runs.filter((run) => run.errors.length > 0);
if (failed.length > 0) {
  console.error(
    `console errors at: ${failed.map((run) => run.viewport).join(", ")}`
  );
  process.exit(1);
}
