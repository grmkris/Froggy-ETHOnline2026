/**
 * Render the installed-app icons from the one favicon mark onto the body
 * colour, so the sizes cannot drift from each other or from the splash.
 * iOS composites transparency on black and applies its own mask, so every
 * file is opaque and square; the maskable variant keeps the mark inside the
 * safe zone. Run: `bun tools/app-icons.ts`.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const BACKGROUND = "#f5f6f2";
const root = path.join(import.meta.dir, "..", "apps", "web", "public");
const outputs: readonly {
  readonly file: string;
  readonly size: number;
  readonly scale: number;
}[] = [
  { file: "apple-touch-icon.png", size: 180, scale: 0.82 },
  { file: "icons/icon-192.png", size: 192, scale: 0.82 },
  { file: "icons/icon-512.png", size: 512, scale: 0.82 },
  { file: "icons/icon-1024.png", size: 1024, scale: 0.82 },
  { file: "icons/icon-maskable-512.png", size: 512, scale: 0.6 },
];

const mark = await readFile(path.join(root, "favicon.svg"), "utf-8");
const browser = await chromium.launch();
const render = async ({
  file,
  size,
  scale,
}: (typeof outputs)[number]): Promise<string> => {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const side = Math.round(size * scale);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${BACKGROUND};display:grid;place-items:center;overflow:hidden"><div style="width:${side}px;height:${side}px">${mark.replace(/width="64" height="64"/u, `width="${side}" height="${side}"`)}</div></body></html>`
  );
  await page.screenshot({
    path: path.join(root, file),
    omitBackground: false,
    type: "png",
  });
  await page.close();
  return `${file} ${size}×${size}`;
};
try {
  const done = await Promise.all(outputs.map(render));
  console.log(done.join("\n"));
} finally {
  await browser.close();
}
