/**
 * Export a scale-normalised pose set, leaving the originals untouched.
 *
 * The generated poses came back with content heights from 963 to 1095 pixels
 * inside the same 1254 canvas. Poses that swap in place therefore read as the
 * character growing and shrinking between states, which is exactly the kind of
 * thing nobody notices in a contact sheet and everybody notices in the app.
 *
 * This measures each file's opaque bounding box, scales it so every pose has
 * the same content height, and centres it horizontally with a common baseline
 * — a mascot standing on the same floor in every state. Originals are the
 * source of truth and are never modified; these are a separate export set.
 *
 *   node design/preproduction/tools/normalize-poses.mjs [--check]
 *
 * There is no image library on this host, so the work happens in a browser
 * canvas, which also preserves the alpha channel correctly.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const srcDir = path.join(root, "brand/poses");
const outDir = path.join(srcDir, "normalized");

/** Canvas stays square and matches the source, so nothing downstream changes. */
const CANVAS = 1254;
/** Every pose ends up this tall, with its feet on the same line. */
const TARGET_H = 1000;
const BASELINE = 1140;

const entries = await readdir(srcDir);
const names = entries.filter((n) => n.endsWith(".png"));
if (names.length === 0) {
  console.error("no poses found");
  process.exit(2);
}
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<canvas id=c></canvas>");

const report = [];
for (const name of names) {
  const bytes = await readFile(path.join(srcDir, name));
  const result = await page.evaluate(
    async ([b64, canvasSize, targetH, baseline]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();

      // measure the opaque bounding box
      const probe = document.createElement("canvas");
      probe.width = img.width;
      probe.height = img.height;
      const pctx = probe.getContext("2d");
      pctx.drawImage(img, 0, 0);
      const { data } = pctx.getImageData(0, 0, img.width, img.height);
      let minX = img.width;
      let minY = img.height;
      let maxX = 0;
      let maxY = 0;
      for (let y = 0; y < img.height; y += 1) {
        for (let x = 0; x < img.width; x += 1) {
          if (data[(y * img.width + x) * 4 + 3] > 16) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const scale = targetH / bh;

      const out = document.createElement("canvas");
      out.width = canvasSize;
      out.height = canvasSize;
      const octx = out.getContext("2d");
      octx.imageSmoothingQuality = "high";
      const dw = bw * scale;
      const dh = bh * scale;
      octx.drawImage(
        img,
        minX,
        minY,
        bw,
        bh,
        (canvasSize - dw) / 2,
        baseline - dh,
        dw,
        dh
      );
      return {
        before: `${bw}x${bh}`,
        after: `${Math.round(dw)}x${Math.round(dh)}`,
        scale: Number(scale.toFixed(3)),
        png: out.toDataURL("image/png").split(",")[1],
      };
    },
    [bytes.toString("base64"), CANVAS, TARGET_H, BASELINE]
  );

  const outPath = path.join(outDir, name);
  const buffer = Buffer.from(result.png, "base64");
  if (process.argv.includes("--check")) {
    const current = await readFile(outPath).catch(() => null);
    if (current === null || !current.equals(buffer)) {
      console.error(`STALE: normalized/${name}`);
      process.exitCode = 1;
    }
  } else {
    await writeFile(outPath, buffer);
  }
  report.push({ name, ...result, png: undefined });
  console.log(
    `${name.replace(".png", "").padEnd(11)} ${result.before.padEnd(10)} -> ${result.after.padEnd(10)} x${result.scale}`
  );
}
await browser.close();

const heights = new Set(report.map((r) => r.after.split("x")[1]));
console.log(
  heights.size === 1
    ? `\nall ${report.length} poses now ${[...heights][0]}px tall on a common baseline`
    : `\nheights still differ: ${[...heights].join(", ")}`
);
