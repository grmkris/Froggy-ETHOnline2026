/**
 * Spawning a browser worker.
 *
 * The worker gets an explicit environment: the path, a home, a temp dir, the
 * Chrome override — and none of the server's secrets. The process that
 * renders hostile pages is the one process that must not hold the Privy
 * secret, the Hedera key or the database URL, and an allowlist is how that is
 * a property of the spawn rather than a hope about what Chrome reads.
 */

import type { WorkerCommand } from "@froggy/protocol";

import type { Viewport } from "./session";

export interface WorkerExit {
  readonly code: number | null;
  readonly signal: string | null;
}

/** One end of the IPC channel, as the host sees it. */
export interface WorkerLink {
  readonly kill: () => void;
  readonly onEvent: (handler: (raw: unknown) => void) => () => void;
  readonly onExit: (handler: (exit: WorkerExit) => void) => () => void;
  readonly send: (command: WorkerCommand) => void;
}

export interface SpawnWorkerOptions {
  readonly blockPrivateNetwork: boolean;
  readonly profileDirectory: string;
  readonly viewport: Viewport;
}

const WORKER_ENTRY = `${import.meta.dir}/worker.ts`;

const INHERITED_ENV: readonly string[] = [
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "FROGGY_CHROME",
  "XDG_CACHE_HOME",
];

const workerEnv = () => {
  const inherited: [string, string][] = [];
  for (const name of INHERITED_ENV) {
    const value = process.env[name];
    if (value !== undefined) {
      inherited.push([name, value]);
    }
  }
  return { ...Object.fromEntries(inherited), FROGGY_BROWSER_WORKER: "1" };
};

export const spawnBrowserWorker = (options: SpawnWorkerOptions): WorkerLink => {
  const eventHandlers = new Set<(raw: unknown) => void>();
  const exitHandlers = new Set<(exit: WorkerExit) => void>();
  const child = Bun.spawn(
    [
      process.execPath,
      WORKER_ENTRY,
      "--profile",
      options.profileDirectory,
      "--width",
      String(options.viewport.width),
      "--height",
      String(options.viewport.height),
      ...(options.blockPrivateNetwork ? [] : ["--allow-private-network"]),
    ],
    {
      env: workerEnv(),
      ipc(message: unknown) {
        for (const handler of eventHandlers) {
          handler(message);
        }
      },
      onExit(_subprocess, exitCode, signalCode) {
        const exit: WorkerExit = {
          code: exitCode,
          signal: signalCode === null ? null : String(signalCode),
        };
        for (const handler of exitHandlers) {
          handler(exit);
        }
      },
      serialization: "advanced",
      stderr: "inherit",
      stdout: "inherit",
    }
  );
  return {
    kill: () => {
      child.kill();
    },
    onEvent: (handler) => {
      eventHandlers.add(handler);
      return () => {
        eventHandlers.delete(handler);
      };
    },
    onExit: (handler) => {
      exitHandlers.add(handler);
      return () => {
        exitHandlers.delete(handler);
      };
    },
    send: (command) => {
      child.send(command);
    },
  };
};
