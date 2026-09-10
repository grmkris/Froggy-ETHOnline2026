/**
 * Gate the fixtures against the discipline they claim.
 *
 * A fixture is the one artifact in this workspace that could be mistaken for
 * real data, so the rules it promises are checked rather than trusted:
 * simulated and stubbed markers present, states drawn from the state matrix,
 * example-only domains, timestamps carrying an offset, no banned claim
 * anywhere, and no uncertain settlement that offers a second debit.
 *
 *   node design/preproduction/tools/check-fixtures.mjs
 *
 * Exits 1 and names every violation.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "fixtures");

/** From flows/STATE_MATRIX.md. A fixture may not invent a state. */
const STATES = new Set([
  "empty",
  "loading",
  "partial-result",
  "no-result",
  "provider-unavailable",
  "auth-expired",
  "blocked",
  "needs-user",
  "rejected",
  "cancelled",
  "failed",
  "completed",
]);

/** Never true of anything, and never printable next to a number. */
const BANNED = [
  "risk-free",
  "riskless",
  "guaranteed",
  "safe bag",
  "can't lose",
  "cannot lose",
  "audited so it is safe",
  "100% safe",
];

const SETTLEMENTS = new Set([
  "confirmed",
  "pending",
  "uncertain",
  "failed",
  "stubbed",
]);

const problems = [];
const entries = await readdir(dir);
const names = entries.filter((name) => name.endsWith(".json"));
if (names.length === 0) {
  console.error("no fixtures found");
  process.exit(2);
}

for (const name of names) {
  const raw = await readFile(path.join(dir, name), "utf-8");
  const at = (message) => problems.push(`${name}: ${message}`);
  let fixture;
  try {
    fixture = JSON.parse(raw);
  } catch (error) {
    at(`not valid JSON — ${error.message}`);
    continue;
  }

  if (fixture.simulated !== true) {
    at("missing `simulated: true`");
  }
  if (fixture.stubbed !== true) {
    at("missing `stubbed: true` — a fixture must never pass for a real run");
  }
  if (!(fixture.scenario?.length > 0)) {
    at("missing `scenario`");
  }
  if (
    !Array.isArray(fixture.demonstrates) ||
    fixture.demonstrates.length === 0
  ) {
    at("missing `demonstrates`");
  }

  const lower = raw.toLowerCase();
  for (const phrase of BANNED) {
    if (lower.includes(phrase)) {
      at(`contains a banned claim: "${phrase}"`);
    }
  }

  // Any host-looking token must be an example domain.
  for (const host of raw.match(/[a-z0-9-]+\.[a-z]{2,}(?![a-z])/gu) ?? []) {
    if (
      !host.endsWith(".example") &&
      !host.endsWith(".json") &&
      !host.endsWith(".md")
    ) {
      at(`non-example domain: ${host}`);
    }
  }

  for (const [index, step] of (fixture.steps ?? []).entries()) {
    const where = `step ${index}`;
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/u.test(
        step.at ?? ""
      )
    ) {
      at(
        `${where}: \`at\` must be ISO 8601 with an offset, saw ${JSON.stringify(step.at)}`
      );
    }
    if (!STATES.has(step.state)) {
      at(
        `${where}: state ${JSON.stringify(step.state)} is not in the state matrix`
      );
    }
    if (step.settlement !== undefined && !SETTLEMENTS.has(step.settlement)) {
      at(`${where}: unknown settlement ${JSON.stringify(step.settlement)}`);
    }
    if (
      (step.settlement === "uncertain" || step.settlement === "pending") &&
      step.offersSecondDebit !== false
    ) {
      at(
        `${where}: ${step.settlement} settlement must state offersSecondDebit: false`
      );
    }
    if (step.settlement === "confirmed" && step.reference === undefined) {
      at(`${where}: a confirmed settlement needs a reference`);
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem);
  }
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(
  `${names.length} fixtures pass: markers, states, domains, timestamps, claims`
);
