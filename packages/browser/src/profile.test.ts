import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { clearStaleProfileLock } from "./profile";

let profile: string;

const exists = (name: string): boolean => {
  try {
    lstatSync(path.join(profile, name));
    return true;
  } catch {
    return false;
  }
};

/** Chrome writes the lock as a symlink to the string `<hostname>-<pid>`. */
const writeLock = (target: string): void => {
  symlinkSync(target, path.join(profile, "SingletonLock"));
  symlinkSync("12345", path.join(profile, "SingletonCookie"));
  symlinkSync(
    "/tmp/whatever/SingletonSocket",
    path.join(profile, "SingletonSocket")
  );
};

beforeEach(() => {
  profile = mkdtempSync(path.join(tmpdir(), "froggy-profile-"));
});

afterEach(() => {
  rmSync(profile, { force: true, recursive: true });
});

describe("clearStaleProfileLock", () => {
  it("does nothing to a profile that has never been used", () => {
    expect(clearStaleProfileLock(profile)).toEqual({
      cleared: [],
      heldBy: null,
    });
  });

  it("does nothing when the profile directory is absent", () => {
    const missing = path.join(profile, "not-here");
    expect(clearStaleProfileLock(missing)).toEqual({
      cleared: [],
      heldBy: null,
    });
  });

  it("clears a lock left by a dead process on this host", () => {
    // Pid 1 exists, so pick something implausible and unused.
    writeLock("testhost-4000000");

    const result = clearStaleProfileLock(profile, { host: "testhost" });

    expect(result.heldBy).toBeNull();
    expect(result.cleared).toEqual([
      "SingletonLock",
      "SingletonCookie",
      "SingletonSocket",
    ]);
    expect(exists("SingletonLock")).toBe(false);
  });

  it("clears a lock written by another host", () => {
    // A redeployed container gets a new hostname, so a lock from the old one is
    // stale by definition — this is the case that actually bites in production.
    writeLock("some-other-container-1");

    const result = clearStaleProfileLock(profile, { host: "testhost" });

    expect(result.cleared).toContain("SingletonLock");
  });

  it("leaves a lock alone while its holder is running", () => {
    writeLock(`testhost-${process.pid}`);

    const result = clearStaleProfileLock(profile, { host: "testhost" });

    expect(result.heldBy).toBe(`testhost-${process.pid}`);
    expect(result.cleared).toEqual([]);
    expect(exists("SingletonLock")).toBe(true);
  });

  it("ignores a lock that is not a symlink", () => {
    // Not a shape Chrome writes; removing it would be guessing.
    writeFileSync(path.join(profile, "SingletonLock"), "not a symlink");

    expect(clearStaleProfileLock(profile).cleared).toEqual([]);
    expect(exists("SingletonLock")).toBe(true);
  });

  it("clears a lock whose target is malformed", () => {
    mkdirSync(path.join(profile, "sub"));
    symlinkSync("garbage-with-no-pid", path.join(profile, "SingletonLock"));

    expect(clearStaleProfileLock(profile).cleared).toContain("SingletonLock");
  });
});
