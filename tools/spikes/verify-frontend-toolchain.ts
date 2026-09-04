/**
 * Spike: can the web app drop Vite?
 *
 * Builds three static trees, serves them, and Playwright-probes each:
 *   vite     — current production pipeline
 *   bun-raw  — `bun build index.html` with no Tailwind compiler
 *   bun-tw   — same JS, CSS replaced by official `@tailwindcss/cli`
 *
 * Usage: bun tools/spikes/verify-frontend-toolchain.ts
 */
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const root = new URL("../../", import.meta.url).pathname.replace(/\/$/u, "");
const tmp = "/tmp/field01-toolchain";
const ports = { vite: 3230, bunRaw: 3231, bunTw: 3232 };

const run = async (
  command: string,
  args: string[],
  cwd = root
): Promise<void> => {
  const child = spawn(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const code: number = await new Promise((resolve) => {
    child.on("close", (value) => {
      resolve(value ?? 1);
    });
  });
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${code})\n${output}`);
  }
};

const serve = (dir: string, port: number) =>
  Bun.serve({
    async fetch(request) {
      const url = new URL(request.url);
      const pathname =
        url.pathname === "/" || !url.pathname.includes(".")
          ? "/index.html"
          : url.pathname;
      const file = Bun.file(`${dir}${pathname}`);
      if (!(await file.exists())) {
        return new Response("not found", { status: 404 });
      }
      return new Response(file);
    },
    port,
  });

const countCss = (path: string, needle: string): number =>
  readFileSync(path, "utf8").split(needle).length - 1;

interface Probe {
  readonly name: string;
  readonly heading: boolean;
  readonly architecture: boolean;
  readonly canvas: boolean;
  readonly headingFontPx: number;
  readonly primaryColor: string;
  readonly errors: readonly string[];
}

const probe = async (name: string, origin: string): Promise<Probe> => {
  console.info(`probing ${name} at ${origin}`);
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-gpu"],
    headless: true,
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForTimeout(2500);
  const mounted = await page.locator("#root >> nth=0").evaluate(
    (node) => node.childElementCount > 0
  );
  if (!mounted) {
    errors.push("React did not mount");
  }
  const heading = await page
    .getByRole("heading", {
      name: "A runtime for software that refuses to sit still.",
    })
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  const canvas = await page
    .locator("canvas")
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  const headingFontPx = await page
    .locator("h1")
    .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
    .catch(() => 0);
  const primaryColor = await page
    .locator("h1")
    .evaluate((node) => getComputedStyle(node).color)
    .catch(() => "unknown");
  await page.goto(`${origin}/architecture`, {
    waitUntil: "load",
    timeout: 20_000,
  });
  const architecture = await page
    .getByRole("heading", { name: "Small surfaces. Hard borders." })
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  await browser.close();
  return {
    architecture,
    canvas,
    errors,
    heading,
    headingFontPx,
    name,
    primaryColor,
  };
};

mkdirSync(tmp, { recursive: true });

console.info("building vite…");
await run("bunx", [
  "--bun",
  "vite",
  "build",
  "--outDir",
  `${tmp}/vite`,
  "--emptyOutDir",
], `${root}/apps/web`);

console.info("building bun-raw…");
await run(
  "bun",
  ["build", "./index.html", "--outdir", `${tmp}/bun-raw`, "--minify"],
  `${root}/apps/web`
);

console.info("compiling tailwind CLI css…");
await run("bunx", [
  "--bun",
  "@tailwindcss/cli",
  "-i",
  `${root}/packages/ui/src/styles/globals.css`,
  "-o",
  `${tmp}/tw.css`,
]);

cpSync(`${tmp}/bun-raw`, `${tmp}/bun-tw`, { recursive: true });
const bunCss = Array.from(
  new Bun.Glob("*.css").scanSync({ cwd: `${tmp}/bun-tw`, onlyFiles: true })
)[0];
if (bunCss === undefined) {
  throw new Error("bun-raw build produced no css");
}
writeFileSync(`${tmp}/bun-tw/${bunCss}`, readFileSync(`${tmp}/tw.css`));

const viteCss = Array.from(
  new Bun.Glob("assets/*.css").scanSync({ cwd: `${tmp}/vite`, onlyFiles: true })
)[0];
const bunRawCss = Array.from(
  new Bun.Glob("*.css").scanSync({ cwd: `${tmp}/bun-raw`, onlyFiles: true })
)[0];

console.info("css utility counts");
console.table({
  "vite .text-primary": countCss(
    `${tmp}/vite/${viteCss ?? ""}`,
    ".text-primary"
  ),
  "bun-raw .text-primary": countCss(
    `${tmp}/bun-raw/${bunRawCss ?? ""}`,
    ".text-primary"
  ),
  "bun-tw .text-primary": countCss(`${tmp}/bun-tw/${bunCss}`, ".text-primary"),
  "vite .min-h-screen": countCss(
    `${tmp}/vite/${viteCss ?? ""}`,
    ".min-h-screen"
  ),
  "bun-raw .min-h-screen": countCss(
    `${tmp}/bun-raw/${bunRawCss ?? ""}`,
    ".min-h-screen"
  ),
  "bun-tw .min-h-screen": countCss(`${tmp}/bun-tw/${bunCss}`, ".min-h-screen"),
});

const staticServers = [
  serve(`${tmp}/vite`, ports.vite),
  serve(`${tmp}/bun-raw`, ports.bunRaw),
  serve(`${tmp}/bun-tw`, ports.bunTw),
];

try {
  const results = [
    await probe("vite", `http://127.0.0.1:${ports.vite}`),
    await probe("bun-raw", `http://127.0.0.1:${ports.bunRaw}`),
    await probe("bun-tw", `http://127.0.0.1:${ports.bunTw}`),
  ];
  console.table(
    results.map((row) => ({
      architecture: row.architecture,
      canvas: row.canvas,
      errors: row.errors.length,
      heading: row.heading,
      headingFontPx: row.headingFontPx,
      name: row.name,
      primaryColor: row.primaryColor,
    }))
  );
  for (const row of results) {
    if (row.errors.length > 0) {
      console.info(`${row.name} errors:`, row.errors.slice(0, 5));
    }
  }

  const viteOk = results[0];
  const bunTw = results[2];
  const styled =
    bunTw !== undefined &&
    bunTw.heading &&
    bunTw.canvas &&
    bunTw.architecture &&
    bunTw.headingFontPx >= 32 &&
    bunTw.errors.length === 0;
  const viteStyled =
    viteOk !== undefined &&
    viteOk.heading &&
    viteOk.canvas &&
    viteOk.architecture &&
    viteOk.errors.length === 0;

  console.info(
    JSON.stringify(
      {
        bunTwCanReplaceVite: styled && viteStyled,
        note: styled
          ? "Bun JS + official Tailwind CLI CSS boots the SPA. Raw bun CSS does not emit utilities."
          : "Bun+Tailwind CLI did not match Vite's rendered result.",
      },
      null,
      2
    )
  );
} finally {
  for (const server of staticServers) {
    server.stop(true);
  }
}
