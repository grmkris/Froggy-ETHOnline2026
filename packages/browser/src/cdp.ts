/**
 * The CDP seam.
 *
 * Every other file in this package talks to a `CdpTab` and nothing else, so the
 * transport — one WebSocket to a Browser Use browser, with a flattened target
 * session per tab — lives behind this interface and nowhere else.
 *
 * Commands are serialised per tab and every one carries a deadline. Ordering is
 * the point: a mouse release that overtakes its press is not a click, and a
 * snapshot that overtakes the navigation it describes is a lie.
 */

import { bestEffort } from "./best-effort";
import { CdpTimeoutError } from "./errors";

const DEFAULT_SEND_TIMEOUT_MS = 30_000;

const EMPTY_PAYLOAD: CdpPayload = {};

/**
 * A CDP payload, going out or coming in.
 *
 * Named rather than left as `unknown` because it is a real contract: the
 * DevTools Protocol is JSON objects both ways, and every command in this
 * package knows the shape it expects. It is not *parsed* here — a schema per
 * CDP method would be a second protocol definition to keep in sync with
 * Chrome's — so the narrowing happens at each call site, next to the command
 * whose documentation says what comes back.
 */
export type CdpPayload = Readonly<Record<string, unknown>>;

export interface CdpView extends EventTarget {
  readonly cdp: <T = unknown>(
    method: string,
    params?: CdpPayload
  ) => Promise<T>;
}

interface CdpSendOptions {
  readonly timeoutMs?: number;
}

export interface CdpTab {
  readonly on: (
    method: string,
    handler: (params: CdpPayload) => void
  ) => () => void;
  readonly send: <T = unknown>(
    method: string,
    params?: CdpPayload,
    options?: CdpSendOptions
  ) => Promise<T>;
}

/**
 * Race a command against a deadline.
 *
 * Every command carries one. Without it a wedged renderer — a synchronous
 * `alert()`, a page in a tight loop — stalls not just that call but every
 * command queued behind it, and the pane goes quiet with no error to show.
 */
const withDeadline = async <T>(
  method: string,
  work: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  const expiry = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    expiry.reject(new CdpTimeoutError(method, timeoutMs));
  }, timeoutMs);
  try {
    return await Promise.race([work, expiry.promise]);
  } finally {
    clearTimeout(timer);
  }
};

export const tabCdp = (view: CdpView): CdpTab => {
  // The serialisation point. Every command chains onto the previous one's
  // settlement, so the page never sees two of ours at once.
  let tail: Promise<unknown> = Promise.resolve();

  const send = async <T>(
    method: string,
    params?: CdpPayload,
    options: CdpSendOptions = {}
  ): Promise<T> => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
    const previous = tail;
    const next = (async () => {
      // A rejected predecessor must not poison the chain: every later command
      // would inherit the rejection and the tab would look permanently dead
      // after one bad call. So the wait for the previous command is
      // best-effort, and only this command's own result is returned.
      await bestEffort(previous);
      return await withDeadline(method, view.cdp<T>(method, params), timeoutMs);
    })();
    tail = next;
    return await next;
  };

  const on = (
    method: string,
    handler: (params: CdpPayload) => void
  ): (() => void) => {
    const listener = (event: Event): void => {
      // CDP events arrive as `MessageEvent`s. Anything else on this
      // EventTarget is not a protocol event, so it becomes an empty payload
      // rather than being forwarded as a lie about its shape.
      const data: unknown =
        event instanceof MessageEvent ? event.data : EMPTY_PAYLOAD;
      // SAFETY: `MessageEvent.data` on a CDP event is the protocol's parameter
      // object, typed `any` by the DOM lib. It is narrowed per-command at each
      // call site rather than parsed here — see docs/decisions/0004.
      handler(data as CdpPayload);
    };
    view.addEventListener(method, listener);
    return () => {
      view.removeEventListener(method, listener);
    };
  };

  return { on, send };
};
