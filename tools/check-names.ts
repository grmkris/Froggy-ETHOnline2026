/**
 * Froggy is a standalone project. Names of earlier internal projects must not
 * appear anywhere in the tree — not in code, comments, docs or config — and a
 * check that only runs in review is a check that gets skipped, so this one is
 * part of `bun run check`.
 *
 * "harness" is also an ordinary word (a test harness, Hedera's own "Hedera
 * Harness" track), so it is flagged only in the shapes a project name takes:
 * capitalised, as a path segment, or possessive.
 */

const FORBIDDEN: readonly RegExp[] = [
  /\bhumanhook\b/iu,
  /\binvok\b/iu,
  /\bboter\b/iu,
  /code\/harness\b|harness\/packages|\bharness's|~\/\.harness|\bHarness\b/u,
];

/** Phrases in which a flagged word is somebody else's product name. */
const ALLOWED_PHRASES: readonly RegExp[] = [
  /Hedera Harness/gu,
  /Source Harness/gu,
  /Harness and Tokenization/gu,
  /Harness Improvement/gu,
  /hedera-harness/gu,
];

const SKIP = new Set(["bun.lock", "tools/check-names.ts"]);

const tracked = await Bun.$`git ls-files -z`.text();
const files = tracked
  .split("\0")
  .filter((path) => path !== "" && !SKIP.has(path));

const contents = await Promise.all(
  files.map(async (path) => ({
    path,
    text: await Bun.file(path)
      .text()
      .catch(() => null),
  }))
);

const hits: string[] = [];
for (const { path, text } of contents) {
  if (text === null) {
    continue;
  }
  for (const [index, raw] of text.split("\n").entries()) {
    let line = raw;
    for (const phrase of ALLOWED_PHRASES) {
      line = line.replaceAll(phrase, "");
    }
    if (FORBIDDEN.some((pattern) => pattern.test(line))) {
      hits.push(`${path}:${index + 1}: ${raw.trim().slice(0, 120)}`);
    }
  }
}

if (hits.length > 0) {
  console.error(
    `Name check failed (${hits.length} lines name a prior project):`
  );
  for (const hit of hits) {
    console.error(`  ${hit}`);
  }
  process.exit(1);
}
console.log(`Name check passed (${files.length} tracked files)`);
