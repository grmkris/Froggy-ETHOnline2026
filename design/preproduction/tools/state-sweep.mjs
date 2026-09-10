/**
 * Capture the mascot in every contract state, so the poses can be judged.
 *
 * The review harness proves the page is healthy; this proves the states are
 * distinguishable, and that reduced motion really stops every loop. Both
 * matter: a state that only reads as itself while moving fails the
 * reduced-motion requirement, and a "running" animation count can be
 * non-zero while the pose it produces is invisible. This script exists
 * because that happened twice — CSS cannot reach inside an SVG <use> shadow
 * tree, and an eyelid animated outside the eye reports as running while
 * covering nothing.
 *
 *   node design/preproduction/tools/state-sweep.mjs <out-dir>
 *
 * States are visited in order through the real buttons, so the awaits below are
 * deliberately sequential: this is one page being driven through an ordered
 * sequence, not five independent captures. `no-await-in-loop` is switched off
 * for this directory in oxlint.config.ts, with the reasoning recorded there.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const STATES = ["idle", "working", "needs-user", "success", "stopped"];
const target = path.resolve(
  import.meta.dirname,
  "../prototype/motion-states.html"
);
const outDir = path.resolve(process.argv[2] ?? ".");
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();

const sweep = async (reduced) => {
  const options = {
    viewport: { width: 900, height: 700 },
    deviceScaleFactor: 2,
  };
  if (reduced) {
    options.reducedMotion = "reduce";
  }
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`file://${target}`, { waitUntil: "networkidle" });

  const row = page.locator(".sizes");
  const suffix = reduced ? "-reduced" : "";
  const seen = [];

  const capture = async (state) => {
    await page.click(`#state-${state}`);
    // Land mid-animation rather than on frame zero, so a loop shows as a loop
    // and the one-shot is caught while it is still playing.
    await page.waitForTimeout(state === "success" ? 220 : 400);
    await row.screenshot({ path: path.join(outDir, `${state}${suffix}.png`) });
    seen.push({
      state,
      running: await page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length
      ),
      label: await page.textContent("#label"),
    });
  };

  for (const state of STATES) {
    await capture(state);
  }
  await context.close();
  return { reduced, errors, seen };
};

const normal = await sweep(false);
const reduced = await sweep(true);
await browser.close();

for (const run of [normal, reduced]) {
  console.log(run.reduced ? "-- reduced motion --" : "-- normal --");
  for (const row of run.seen) {
    console.log(
      `  ${row.state.padEnd(11)} running=${String(row.running).padEnd(3)} "${row.label}"`
    );
  }
  if (run.errors.length > 0) {
    console.error("  page errors:", run.errors);
    process.exitCode = 1;
  }
}

const stillMoving = reduced.seen.filter((row) => row.running > 0);
if (stillMoving.length > 0) {
  console.error(
    `reduced motion still animating: ${stillMoving.map((row) => row.state).join(", ")}`
  );
  process.exitCode = 1;
}

// stopped must be genuinely still, and success must be mid-flight when sampled.
const stopped = normal.seen.find((row) => row.state === "stopped");
const success = normal.seen.find((row) => row.state === "success");
if (stopped.running !== 0) {
  console.error(`stopped should be still, saw ${stopped.running} running`);
  process.exitCode = 1;
}
if (success.running === 0) {
  console.error(
    "success one-shot was not running when sampled — check the selector"
  );
  process.exitCode = 1;
}
console.log(
  "\nposes captured; reduced motion silent; stopped still; success one-shot live"
);
