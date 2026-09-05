/**
 * Work that outlives the request that started it.
 *
 * Bun kills the process on an unhandled rejection, so every bare
 * `void (async …)()` is a process-killer waiting for its dependency to have a
 * bad day. That is not hypothetical here: a Postgres service that had not
 * finished provisioning made a publish-the-wallet-state task reject, and the
 * server 502'd on every route including `/health`.
 *
 * So detached work goes through here. It logs and continues. This is not a
 * blanket "ignore errors" — a failure that must stop something is awaited by
 * whoever needs it stopped, and the paths that move money throw for real. This
 * is for publishes and best-effort grants, where the right outcome of a
 * failure is a line in the log and a UI that says less than it hoped to.
 */

const message = (error: Error): string => error.message;

export const detached = (label: string, work: () => Promise<void>): void => {
  // An IIFE with try/catch rather than `.catch()`: the same thing, in the
  // shape the repository's lint rules ask for.
  void (async () => {
    try {
      await work();
    } catch (error) {
      console.warn(
        `${label} failed:`,
        error instanceof Error ? message(error) : "unknown error"
      );
    }
  })();
};
