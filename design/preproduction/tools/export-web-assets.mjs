/**
 * Export web-sized copies of the vignettes into the app's public directory.
 *
 * The originals are 1254px and roughly 600KB each, which is right for a source
 * asset and wrong for decoration in an empty state: five of them would add
 * about 3MB to every deploy to render at 96px. This writes 192px copies — 2x
 * the display size — and leaves the originals untouched as the source of truth.
 *
 *   node design/preproduction/tools/export-web-assets.mjs [--check]
 *
 * No image library on this host, so the resize happens in a browser canvas,
 * which also preserves the alpha channel.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const srcDir = path.join(root, "brand/vignettes");
const outDir = path.resolve(root, "../../apps/web/public/vignettes");
const SIZE = 192;

const entries = await readdir(srcDir);
const names = entries.filter((name) => name.endsWith(".png"));
if (names.length === 0) {
  console.error("no vignettes found");
  process.exit(2);
}
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<canvas></canvas>");

let stale = 0;
for (const name of names) {
  const bytes = await readFile(path.join(srcDir, name));
  const png = await page.evaluate(
    async ([b64, size]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      context.imageSmoothingQuality = "high";
      context.drawImage(img, 0, 0, size, size);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [bytes.toString("base64"), SIZE]
  );
  const buffer = Buffer.from(png, "base64");
  const out = path.join(outDir, name);
  if (process.argv.includes("--check")) {
    const current = await readFile(out).catch(() => null);
    if (current === null || !current.equals(buffer)) {
      console.error(`STALE: public/vignettes/${name}`);
      stale += 1;
    }
  } else {
    await writeFile(out, buffer);
    const saved = Math.round((1 - buffer.length / bytes.length) * 100);
    console.log(
      `${name.padEnd(13)} ${Math.round(bytes.length / 1024)}KB -> ${Math.round(buffer.length / 1024)}KB (-${saved}%)`
    );
  }
}
await browser.close();
if (stale > 0) {
  process.exit(1);
}
