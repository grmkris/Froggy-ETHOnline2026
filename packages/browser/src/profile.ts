/**
 * Clearing a Chrome profile lock left by a process that is no longer alive.
 *
 * Chrome guards a profile directory with `SingletonLock`, and refuses to start
 * while it looks held. When Chrome exits cleanly it removes the lock; when it is
 * killed — a container restart, an OOM, a `docker kill` — the lock survives, and
 * every subsequent start dies immediately with nothing more informative than
 * "Chrome process closed the pipe".
 *
 * On a laptop that is an annoyance. Here the profile lives on a persistent
 * volume precisely so logins survive a redeploy, which means a killed container
 * leaves a lock the *next* container inherits: without this the browser works
 * once and then never again, and the only symptom is a pane that says the
 * browser crashed.
 *
 * Two details that make a naive version wrong:
 *
 *   - The lock is a **symlink whose target is a string**, `<hostname>-<pid>`.
 *     It does not point at anything real, so reading its contents follows the
 *     dangling link and throws `ENOENT`. It has to be `readlink`.
 *   - `SingletonCookie` and `SingletonSocket` sit beside it and are checked too,
 *     so removing only the lock leaves Chrome refusing for a different reason.
 */

import { lstatSync, readlinkSync, rmSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";

const SINGLETON_FILES = [
  "SingletonLock",
  "SingletonCookie",
  "SingletonSocket",
] as const;

/**
 * Is the process named by a lock target still running?
 *
 * A lock written by a *different* host cannot be ours — a new container gets a
 * new hostname, so that alone marks it stale. Within the same host, signal 0
 * asks the kernel whether the pid exists; `EPERM` means it exists and belongs to
 * someone else, which still counts as alive.
 */
const holderIsAlive = (target: string, currentHost: string): boolean => {
  const separator = target.lastIndexOf("-");
  if (separator <= 0) {
    return false;
  }
  const host = target.slice(0, separator);
  const pid = Number(target.slice(separator + 1));
  if (host !== currentHost || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // SAFETY: `process.kill` rejects only with a Node system error, and `EPERM`
    // is the case that matters — the process exists and belongs to someone
    // else, which still means the lock is genuinely held.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

export interface StaleLockResult {
  readonly cleared: readonly string[];
  /** Set when a lock was found and left alone because its holder is running. */
  readonly heldBy: string | null;
}

export const clearStaleProfileLock = (
  profileDirectory: string,
  deps: { readonly host?: string } = {}
): StaleLockResult => {
  const lockPath = path.join(profileDirectory, "SingletonLock");
  let target: string;
  try {
    // `lstat` first: a plain file here is not a lock we understand, and a
    // missing profile is the ordinary first-run case.
    if (!lstatSync(lockPath).isSymbolicLink()) {
      return { cleared: [], heldBy: null };
    }
    target = readlinkSync(lockPath);
  } catch {
    return { cleared: [], heldBy: null };
  }

  if (holderIsAlive(target, deps.host ?? hostname())) {
    return { cleared: [], heldBy: target };
  }

  const cleared: string[] = [];
  for (const name of SINGLETON_FILES) {
    const candidate = path.join(profileDirectory, name);
    // `lstatSync` rather than `existsSync` on the symlink itself: `existsSync`
    // follows the link, and these all dangle by design.
    try {
      lstatSync(candidate);
    } catch {
      continue;
    }
    try {
      rmSync(candidate, { force: true });
      cleared.push(name);
    } catch {
      // Best effort. A profile we cannot write to will fail at launch anyway,
      // and it will fail with the launch error rather than this one.
    }
  }
  return { cleared, heldBy: null };
};
