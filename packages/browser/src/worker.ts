/**
 * The browser worker process.
 *
 * One of these per signed-in user, spawned by `worker-host.ts`. It owns one
 * `BrowserSession`, one Chrome and one profile, and speaks the worker protocol
 * over Bun's IPC channel. Deliberately thin: every decision lives in
 * `serveWorker`, which the tests drive without a process.
 *
 * It exits when the host disconnects. A worker that outlived its server would
 * be a Chrome nobody can reach, holding a profile lock nobody can clear.
 */

import { BrowserSession } from "./session";
import { serveWorker } from "./worker-serve";

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const profileDirectory = argument("--profile");
if (profileDirectory === undefined) {
  throw new Error("browser worker: --profile is required");
}
const width = Number(argument("--width") ?? "1280");
const height = Number(argument("--height") ?? "800");
const blockPrivateNetwork = !process.argv.includes("--allow-private-network");

const { stop } = serveWorker({
  makeSession: (onStateChange) =>
    new BrowserSession({
      blockPrivateNetwork,
      onStateChange,
      profileDirectory,
      viewport: { height, width },
    }),
  onShutdown: () => {
    process.exit(0);
  },
  pid: process.pid,
  transport: {
    onCommand: (handler) => {
      process.on("message", handler);
    },
    send: (event) => {
      process.send?.(event);
    },
  },
});

// The host is gone: release Chrome gracefully so the profile survives, then go.
process.on("disconnect", () => {
  void stop(true);
});
process.on("SIGTERM", () => {
  void stop(true);
});
