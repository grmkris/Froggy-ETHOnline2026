/**
 * Generate the motion prototype from the mark, so geometry cannot drift.
 *
 * `brand/frog-mark.svg` is the single source of the frog's geometry. The
 * prototype needs it inline and stamped once per instance, for two reasons:
 * a `file://` review cannot fetch a sibling SVG, and — the one that actually
 * bites — CSS selectors cannot reach inside the shadow tree that `<use>`
 * creates, so `[data-state="idle"] .body { animation: … }` silently never
 * matches and every rig animation stays dead. That failure looks exactly like
 * "the keyframes are wrong". The review harness caught it as running=0.
 *
 * Each stamp gets its clipPath ids suffixed, because duplicated ids would make
 * every eyelid in the page clip against the first frog's.
 *
 * Processes every `*.template.html` under prototype/ and screens/.
 *
 *   node design/preproduction/tools/build-prototype.mjs [--check]
 *
 * --check exits 1 if any generated file is stale, so a gate can catch a mark
 * that was edited without rebuilding.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const MARKER = "<!-- FROG -->";

const mark = await readFile(path.join(root, "brand/frog-mark.svg"), "utf-8");
const found = /<g id="frog"[^>]*>[\s\S]*?<\/g>\s*(?=<\/svg>)/u.exec(mark);
if (found === null) {
  console.error('brand/frog-mark.svg: no <g id="frog" …> block found');
  process.exit(2);
}
const geometry = found[0].trimEnd();

/** Every board that stamps the mascot: prototype/, screens/ and the DS bundle. */
const templates = [];
for (const dir of ["prototype", "screens", "ds-bundle/brand"]) {
  const entries = await readdir(path.join(root, dir)).catch(() => []);
  for (const name of entries) {
    if (name.endsWith(".template.html")) {
      templates.push(path.join(dir, name));
    }
  }
}
if (templates.length === 0) {
  console.error(
    "no *.template.html found under prototype/, screens/ or ds-bundle/brand/"
  );
  process.exit(2);
}

/** One rig instance: the halo the states animate, plus the mark with unique ids. */
const stamp = (index) => {
  const body = geometry
    .replaceAll('id="lid-left"', `id="lid-left-${index}"`)
    .replaceAll("url(#lid-left)", `url(#lid-left-${index})`)
    .replaceAll('id="lid-right"', `id="lid-right-${index}"`)
    .replaceAll("url(#lid-right)", `url(#lid-right-${index})`)
    .replaceAll('id="maw"', `id="maw-${index}"`)
    .replaceAll("url(#maw)", `url(#maw-${index})`)
    .replace(/id="frog"/u, `id="frog-${index}"`)
    .split("\n")
    .map((line) => (line.trim().length > 0 ? `        ${line.trim()}` : line))
    .join("\n");
  return `<circle class="halo" cx="32" cy="34" r="30" />\n${body}`;
};

/*
 * A generated file that the formatter also owns is a gate that fails forever:
 * oxfmt rewrites it, --check calls it stale, and the loop never settles. That
 * happened three times while this workspace was built, each time because a new
 * board was added and .prettierignore was not. So the generator refuses to
 * write an output the formatter would touch.
 */
const ignore = await readFile(
  path.join(root, "../../.prettierignore"),
  "utf-8"
);
const ignored = new Set(
  ignore
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
);

const header =
  "<!-- GENERATED from brand/frog-mark.svg by tools/build-prototype.mjs. " +
  "Edit the mark or the template, then rebuild. -->\n";

const check = process.argv.includes("--check");
let stale = 0;
for (const relative of templates) {
  const template = await readFile(path.join(root, relative), "utf-8");
  const stamps = template.split(MARKER).length - 1;
  if (stamps === 0) {
    console.error(`${relative}: missing the ${MARKER} marker`);
    process.exit(2);
  }
  // Ids are unique per file, so each board is self-contained.
  let index = 0;
  const content =
    header +
    template.replaceAll(MARKER, () => {
      index += 1;
      return stamp(index - 1);
    });
  const out = path.join(root, relative.replace(".template.html", ".html"));
  const shown = path.relative(root, out);
  const fromRepoRoot = `design/preproduction/${shown}`;
  if (!ignored.has(fromRepoRoot)) {
    console.error(
      `${shown} is generated but not listed in .prettierignore.\n` +
        `Add this line, or the formatter and this generator will fight forever:\n` +
        `  ${fromRepoRoot}`
    );
    process.exit(2);
  }
  if (check) {
    const current = await readFile(out, "utf-8").catch(() => "");
    if (current === content) {
      console.log(`in sync: ${shown} (${stamps} stamps)`);
    } else {
      console.error(`STALE: ${shown} — run build-prototype.mjs`);
      stale += 1;
    }
  } else {
    await writeFile(out, content);
    console.log(`wrote ${shown} — ${stamps} stamps, ${content.length} bytes`);
  }
}
if (stale > 0) {
  process.exit(1);
}
