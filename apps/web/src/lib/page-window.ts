/**
 * The page in its own window, and how the tab that opened it knows.
 *
 * Two same-origin documents share a `BroadcastChannel`. The window claims the
 * page when it opens and releases it when it goes; a tab that arrives late
 * asks, and a window that is still there answers. While a window holds the
 * page the tab drops its browser socket, so the server casts to one watcher
 * rather than two.
 */

const CHANNEL = "froggy-browser";
const WINDOW_FEATURES = "popup,width=1320,height=900";

type Signal = "ask" | "claim" | "release";

const isSignal = (value: unknown): value is Signal =>
  value === "ask" || value === "claim" || value === "release";

export interface PageWindowLink {
  readonly close: () => void;
  readonly post: (signal: Signal) => void;
  readonly subscribe: (listener: (signal: Signal) => void) => () => void;
}

export const openPageWindow = (): Window | null =>
  globalThis.open("/browser", "froggy-browser", WINDOW_FEATURES);

export const pageWindowLink = (): PageWindowLink => {
  const channel = new BroadcastChannel(CHANNEL);
  // Bound once: a broadcast channel takes one argument, unlike a window.
  const broadcast = channel.postMessage.bind(channel);
  const listeners = new Set<(signal: Signal) => void>();
  channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (isSignal(event.data)) {
      for (const listener of listeners) {
        listener(event.data);
      }
    }
  });
  return {
    close: () => {
      listeners.clear();
      channel.close();
    },
    post: (signal) => {
      broadcast(signal);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
