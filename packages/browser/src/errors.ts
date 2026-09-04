/**
 * Browser failures are values, not throws, everywhere they cross a boundary.
 *
 * A browser that will not start is an ordinary state of this product — a laptop
 * with no Chrome, a container with no display — and the pane has to render it.
 * Modelling that as an exception pushes the decision into a catch block far
 * from the code that knows what to say about it.
 */

export class BrowserStartError extends Error {
  readonly kind = "BrowserStartError";
  readonly hint: string | undefined;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "BrowserStartError";
    this.hint = hint;
  }
}

export class BrowserSessionClosedError extends Error {
  readonly kind = "BrowserSessionClosedError";

  constructor(message = "The browser session is closed.") {
    super(message);
    this.name = "BrowserSessionClosedError";
  }
}

export class CdpTimeoutError extends Error {
  readonly kind = "CdpTimeoutError";
  readonly method: string;
  readonly timeoutMs: number;

  constructor(method: string, timeoutMs: number) {
    super(`CDP ${method} did not answer within ${timeoutMs}ms`);
    this.name = "CdpTimeoutError";
    this.method = method;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Bun gives no handle on the spawned Chrome process, so a crash is only
 * observable as the shape of the error the next command fails with.
 */
const CRASH_PATTERN =
  /closed the pipe|view is closed|not connected|chrome exited/iu;

/**
 * Does this failure look like Chrome dying rather than a command failing?
 *
 * Takes an `Error` because every call site has already caught one; a caught
 * value that is not an `Error` is not a crash signal, it is a thrown string,
 * and treating it as one would mark the session dead over a bad `throw`.
 */
export const looksLikeCrash = (error: Error): boolean =>
  CRASH_PATTERN.test(error.message);
