/**
 * Where is Chrome? `Bun.WebView` needs a real Chrome/Chromium binary; Bun's own
 * auto-detect only knows the standard install locations, so this adds the
 * `FROGGY_CHROME` override and the Playwright cache (which a dev box usually
 * has even when it has no system Chrome — this one does) and reports WHERE the
 * binary came from, because "no browser" and "the wrong browser" look identical
 * in the pane otherwise.
 *
 * Ported from invok, whose comments below record the bugs that shaped it.
 *
 * Pure: env, home and platform are inputs, so the table is unit-testable.
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

type ChromeSource = "FROGGY_CHROME" | "path" | "playwright";

export interface DetectedChrome {
  path: string;
  source: ChromeSource;
}

export interface ChromeDetectInput {
  env?: Record<string, string | undefined>;
  home?: string;
  platform?: NodeJS.Platform;
  /** Injectable for tests. */
  exists?: (p: string) => boolean;
  listDir?: (p: string) => string[];
}

const LINUX_CANDIDATES = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
  "/opt/google/chrome/chrome",
];

const DARWIN_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
];

const safeList = (list: (p: string) => string[], dir: string): string[] => {
  try {
    return list(dir);
  } catch {
    return [];
  }
};

/**
 * Playwright installs two things under one cache: the full browser as
 * `chromium-<rev>` and a stripped, windowless binary as
 * `chromium_headless_shell-<rev>`. The shell cannot show a window, so with it
 * there is no screencast and no human handoff — the half of `browser_*` that
 * a person watches. A plain descending sort picked it every time (`_` sorts
 * after `-` in ASCII), which is why the screencast looked broken on a box
 * that had a perfectly good Chromium installed beside it.
 *
 * So: rank explicitly — every full build before any headless shell — and
 * order revisions NUMERICALLY within a rank (`chromium-1148` is newer than
 * `chromium-999`, which a string sort gets backwards).
 */
const FULL_PREFIX = "chromium-";
const SHELL_PREFIX = "chromium_headless_shell-";

const revisionOf = (dir: string): number => {
  const digits = /(?<rev>\d+)$/u.exec(dir)?.groups?.["rev"];
  return digits === undefined ? -1 : Number(digits);
};

/** Full builds newest-first, then headless shells newest-first. */
export const rankChromiumDirs = (names: readonly string[]): string[] => {
  const rank = (prefix: string) =>
    names
      .filter((d) => d.startsWith(prefix))
      .toSorted((a, b) => revisionOf(b) - revisionOf(a));
  return [...rank(FULL_PREFIX), ...rank(SHELL_PREFIX)];
};

const binariesIn = (
  cache: string,
  dir: string,
  platform: NodeJS.Platform
): string[] => {
  const app = (bundle: string, name: string) =>
    path.join(cache, dir, bundle, `${name}.app`, "Contents", "MacOS", name);
  if (platform === "darwin") {
    return dir.startsWith(SHELL_PREFIX)
      ? [
          path.join(
            cache,
            dir,
            "chrome-headless-shell-mac",
            "chrome-headless-shell"
          ),
          path.join(
            cache,
            dir,
            "chrome-headless-shell-mac-arm64",
            "chrome-headless-shell"
          ),
        ]
      : [app("chrome-mac", "Chromium"), app("chrome-mac-arm64", "Chromium")];
  }
  return dir.startsWith(SHELL_PREFIX)
    ? [
        path.join(
          cache,
          dir,
          "chrome-headless-shell-linux64",
          "chrome-headless-shell"
        ),
      ]
    : [
        path.join(cache, dir, "chrome-linux64", "chrome"),
        path.join(cache, dir, "chrome-linux", "chrome"),
      ];
};

const playwrightCandidates = (
  home: string,
  platform: NodeJS.Platform,
  list: (p: string) => string[]
): string[] => {
  const cache =
    platform === "darwin"
      ? path.join(home, "Library", "Caches", "ms-playwright")
      : path.join(home, ".cache", "ms-playwright");
  return rankChromiumDirs(safeList(list, cache)).flatMap((dir) =>
    binariesIn(cache, dir, platform)
  );
};

export const detectChrome = (
  input: ChromeDetectInput = {}
): DetectedChrome | null => {
  const env = input.env ?? process.env;
  const home = input.home ?? homedir();
  const platform = input.platform ?? process.platform;
  const exists = input.exists ?? existsSync;
  const list = input.listDir ?? readdirSync;

  const override = env["FROGGY_CHROME"];
  if (override !== undefined && override !== "") {
    // A set-but-wrong override returns null rather than falling through to the
    // known paths. Silently using a different browser than the one configured
    // is how a typo becomes an hour of debugging the wrong layer.
    return exists(override)
      ? { path: override, source: "FROGGY_CHROME" }
      : null;
  }
  const known = platform === "darwin" ? DARWIN_CANDIDATES : LINUX_CANDIDATES;
  for (const candidate of known) {
    if (exists(candidate)) {
      return { path: candidate, source: "path" };
    }
  }
  for (const candidate of playwrightCandidates(home, platform, list)) {
    if (exists(candidate)) {
      return { path: candidate, source: "playwright" };
    }
  }
  return null;
};

/**
 * Extra Chrome flags. `--no-sandbox` on Linux: Ubuntu 24.04 restricts
 * unprivileged user namespaces (AppArmor), and without the flag Chrome dies
 * with "No usable sandbox!" before the pipe opens — verified on this box.
 * `--disable-dev-shm-usage` keeps a small /dev/shm from crashing the
 * renderer.
 */
export const chromeArgv = (
  platform: NodeJS.Platform = process.platform
): string[] =>
  platform === "linux"
    ? ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"]
    : ["--hide-scrollbars"];
