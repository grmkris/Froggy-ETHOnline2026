/**
 * Assert what the UI-feedback page claims, rather than trusting the CSS.
 *
 * Four behaviours the brief cares about, and each is a thing that looks fine
 * in a screenshot while being wrong:
 *   - the wake/reveal actually runs, once, and is silent under reduced motion;
 *   - success is reachable ONLY by the confirmed event, never by asking twice;
 *   - the approval's answer buttons are clickable on the first frame;
 *   - reduced motion stops every one of them.
 *
 *   node design/preproduction/tools/check-feedback.mjs
 */

import path from "node:path";

import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const feedback = `file://${path.join(root, "prototype/ui-feedback.html")}`;
const motion = `file://${path.join(root, "prototype/motion-states.html")}`;

const browser = await chromium.launch();
const problems = [];
const ok = [];

const running = async (page) =>
  await page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.playState === "running").length
  );

for (const reduced of [false, true]) {
  const options = reduced ? { reducedMotion: "reduce" } : {};
  const context = await browser.newContext(options);
  const label = reduced ? "reduced" : "normal";

  // --- wake / reveal ---
  const wake = await context.newPage();
  await wake.goto(motion, { waitUntil: "networkidle" });
  await wake.click("#play-wake");
  const wakeRunning = await running(wake);
  if (reduced ? wakeRunning !== 0 : wakeRunning === 0) {
    problems.push(`${label}: wake/reveal running=${wakeRunning}`);
  } else {
    ok.push(`${label}: wake/reveal running=${wakeRunning}`);
  }
  await wake.close();

  const page = await context.newPage();
  await page.goto(feedback, { waitUntil: "networkidle" });

  // --- success only on the confirmed event ---
  await page.click("#pay");
  const pending = await page.getAttribute("#pay", "data-phase");
  await page.click("#pay");
  const stillPending = await page.getAttribute("#pay", "data-phase");
  if (pending === "pending" && stillPending === "pending") {
    ok.push(`${label}: asking twice leaves it pending`);
  } else {
    problems.push(`${label}: asking twice moved the button to ${stillPending}`);
  }
  await page.click("#confirm");
  const done = await page.getAttribute("#pay", "data-phase");
  if (done === "done") {
    ok.push(`${label}: confirmed event settles it`);
  } else {
    problems.push(
      `${label}: confirmed event did not settle the button (${done})`
    );
  }

  // --- the answers do not wait for the entrance ---
  await page.click("#replay-ask");
  const approve = page.getByRole("button", { name: "Approve €135.40" });
  const clickable = await approve.isEnabled();
  const box = await approve.boundingBox();
  if (!clickable || box === null || box.height < 20) {
    problems.push(`${label}: approve unreachable during the entrance`);
  } else {
    ok.push(`${label}: approve is clickable during the entrance`);
  }

  // --- reveal, and reduced motion ---
  await page.click("#replay-reveal");
  const revealRunning = await running(page);
  if (reduced ? revealRunning !== 0 : revealRunning === 0) {
    problems.push(`${label}: result reveal running=${revealRunning}`);
  } else {
    ok.push(`${label}: result reveal running=${revealRunning}`);
  }

  // --- handoff changes hands, in words as well as colour ---
  await page.click("#to-human");
  const mode = await page.getAttribute("#drive", "data-mode");
  const text = await page.textContent("#drive-text");
  if (mode !== "human" || !text?.includes("You are driving")) {
    problems.push(`${label}: handoff did not change hands (${mode})`);
  } else {
    ok.push(`${label}: handoff says it in words too`);
  }

  await page.close();
  await context.close();
}

await browser.close();
for (const line of ok) {
  console.log(`  ok   ${line}`);
}
for (const line of problems) {
  console.error(`  FAIL ${line}`);
}
if (problems.length > 0) {
  process.exit(1);
}
console.log(`\n${ok.length} checks passed`);
