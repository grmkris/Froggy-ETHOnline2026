import { describe, expect, it } from "bun:test";

import { chromeArgv, detectChrome, rankChromiumDirs } from "./chrome-detect";

describe("rankChromiumDirs", () => {
  it("ranks every full build above every headless shell", () => {
    // The bug this exists to prevent: Playwright installs both under one cache,
    // `_` sorts after `-` in ASCII, and a plain descending sort therefore picks
    // the windowless shell every time — no window, so no screencast and no
    // human handoff, on a box with a perfectly good Chromium beside it.
    const ranked = rankChromiumDirs([
      "chromium_headless_shell-1234",
      "chromium-1148",
    ]);

    expect(ranked[0]).toBe("chromium-1148");
  });

  it("orders revisions numerically, not lexically", () => {
    const ranked = rankChromiumDirs([
      "chromium-999",
      "chromium-1148",
      "chromium-1000",
    ]);

    expect(ranked).toEqual(["chromium-1148", "chromium-1000", "chromium-999"]);
  });

  it("ignores unrelated cache entries", () => {
    expect(rankChromiumDirs(["ffmpeg-1011", "firefox-1400"])).toEqual([]);
  });
});

const listNothing = (): string[] => [];

describe("detectChrome", () => {
  it("prefers an explicit override", () => {
    const found = detectChrome({
      env: { FROGGY_CHROME: "/opt/my-chrome" },
      exists: (path) => path === "/opt/my-chrome",
      home: "/home/x",
      listDir: listNothing,
      platform: "linux",
    });

    expect(found).toEqual({ path: "/opt/my-chrome", source: "FROGGY_CHROME" });
  });

  it("reports nothing when the override points at nothing", () => {
    // Deliberately does *not* fall through to the known paths: silently using a
    // different browser than the one configured turns a typo into an hour of
    // debugging the wrong layer.
    const found = detectChrome({
      env: { FROGGY_CHROME: "/opt/typo" },
      exists: () => false,
      home: "/home/x",
      listDir: listNothing,
      platform: "linux",
    });

    expect(found).toBeNull();
  });

  it("falls back to a system install", () => {
    const found = detectChrome({
      env: {},
      exists: (path) => path === "/usr/bin/chromium",
      home: "/home/x",
      listDir: listNothing,
      platform: "linux",
    });

    expect(found).toEqual({ path: "/usr/bin/chromium", source: "path" });
  });

  it("finds a Playwright cache when there is no system Chrome", () => {
    const found = detectChrome({
      env: {},
      exists: (path) => path.includes("chromium-1148"),
      home: "/home/x",
      listDir: () => ["chromium-1148", "chromium_headless_shell-1234"],
      platform: "linux",
    });

    expect(found?.source).toBe("playwright");
    expect(found?.path).toContain("chromium-1148");
  });

  it("reports nothing when there is no browser anywhere", () => {
    const found = detectChrome({
      env: {},
      exists: () => false,
      home: "/home/x",
      listDir: listNothing,
      platform: "linux",
    });

    expect(found).toBeNull();
  });
});

describe("chromeArgv", () => {
  it("disables the sandbox on Linux", () => {
    // Ubuntu 24.04 restricts unprivileged user namespaces under AppArmor, and
    // without this Chrome dies with "No usable sandbox!" before the pipe opens.
    expect(chromeArgv("linux")).toContain("--no-sandbox");
    expect(chromeArgv("linux")).toContain("--disable-dev-shm-usage");
  });

  it("leaves the sandbox alone elsewhere", () => {
    expect(chromeArgv("darwin")).not.toContain("--no-sandbox");
  });
});
