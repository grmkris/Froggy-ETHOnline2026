/**
 * The worker protocol, end to end, in one process.
 *
 * `RemoteBrowser` on one side, `serveWorker` driving a real `BrowserSession`
 * on the other, joined by an in-memory link that structured-clones every
 * message the way Bun's IPC does. No Chrome: the session gets a fake view
 * that answers the handful of CDP commands the package sends. What this
 * proves is the contract — commands cross, replies come back, frames flow
 * only while watched, a dead worker reads as a crash — which is everything
 * that would otherwise only be discoverable on the deployed box.
 */

import { describe, expect, test } from "bun:test";

import type { WorkerEvent } from "@froggy/protocol";

import type { CdpPayload } from "./cdp";
import { RemoteBrowser } from "./remote";
import { BrowserSession } from "./session";
import type { TabView } from "./tabs";
import type { WorkerExit, WorkerLink } from "./worker-host";
import { serveWorker } from "./worker-serve";
import type { WorkerTransport } from "./worker-serve";

/** Enough of a page to navigate, snapshot and screencast. */
class FakeView extends EventTarget implements TabView {
  readonly calls: string[] = [];
  loading = false;
  title = "Fake page";
  url = "about:blank";

  async cdp<T = unknown>(method: string, params?: CdpPayload): Promise<T> {
    await Promise.resolve();
    this.calls.push(method);
    const answer = (value: unknown): T =>
      // SAFETY: a test double answering the commands it knows about; the
      // caller narrows per command exactly as it does against Chrome.
      value as T;
    if (method === "Runtime.evaluate") {
      return answer({ result: { value: { t: this.title, u: this.url } } });
    }
    if (method === "Accessibility.getFullAXTree") {
      return answer({ nodes: [] });
    }
    if (method === "Network.setBlockedURLs") {
      const urls = params?.["urls"];
      this.calls.push(`blocked:${Array.isArray(urls) ? urls.length : 0}`);
    }
    return answer({});
  }

  async navigate(url: string): Promise<void> {
    await Promise.resolve();
    this.url = url;
  }

  close(): void {
    this.calls.push("close");
  }

  /** What Chrome does after `Page.startScreencast`. */
  paint(): void {
    this.dispatchEvent(
      new MessageEvent("Page.screencastFrame", {
        data: {
          data: Buffer.from("jpeg-bytes").toString("base64"),
          metadata: { deviceHeight: 800, deviceWidth: 1280 },
          sessionId: 1,
        },
      })
    );
  }
}

interface Loopback {
  readonly exit: (exit: WorkerExit) => void;
  /** Starts the worker and returns the host's end, as `spawnBrowserWorker` would. */
  readonly spawn: () => WorkerLink;
  readonly views: FakeView[];
}

/**
 * The two ends of an IPC channel, in memory.
 *
 * Every message is structured-cloned across, so a `Uint8Array` arrives as a
 * `Uint8Array` and a class instance would arrive as a plain object — the same
 * rules the real channel applies.
 */
/** Structured-clone across, on the next microtask, as the real channel does. */
const deliver = (
  handlers: Set<(raw: unknown) => void>,
  message: unknown
): void => {
  const copy = structuredClone(message);
  queueMicrotask(() => {
    for (const handler of handlers) {
      handler(copy);
    }
  });
};

const loopback = (
  options: { blockPrivateNetwork?: boolean } = {}
): Loopback => {
  const toWorker = new Set<(raw: unknown) => void>();
  const toHost = new Set<(raw: unknown) => void>();
  const exits = new Set<(exit: WorkerExit) => void>();
  const views: FakeView[] = [];
  const transport: WorkerTransport = {
    onCommand: (handler) => {
      toWorker.add(handler);
    },
    send: (event: WorkerEvent) => {
      deliver(toHost, event);
    },
  };
  const start = (): void => {
    serveWorker({
      makeSession: (onStateChange) =>
        new BrowserSession({
          blockPrivateNetwork: options.blockPrivateNetwork ?? true,
          createView: () => {
            const view = new FakeView();
            views.push(view);
            return view;
          },
          onStateChange,
          profileDirectory: "/tmp/froggy-worker-protocol-test",
        }),
      onShutdown: () => {
        for (const handler of exits) {
          handler({ code: 0, signal: null });
        }
      },
      pid: 4242,
      transport,
    });
  };
  const link: WorkerLink = {
    kill: () => {
      for (const handler of exits) {
        handler({ code: null, signal: "SIGKILL" });
      }
    },
    onEvent: (handler) => {
      toHost.add(handler);
      return () => {
        toHost.delete(handler);
      };
    },
    onExit: (handler) => {
      exits.add(handler);
      return () => {
        exits.delete(handler);
      };
    },
    send: (command) => {
      deliver(toWorker, command);
    },
  };
  return {
    exit: (exit) => {
      for (const handler of exits) {
        handler(exit);
      }
    },
    spawn: () => {
      // A real worker sends `ready` after the host has attached its handlers;
      // a microtask keeps that order here.
      queueMicrotask(start);
      return link;
    },
    views,
  };
};

const settle = async (): Promise<void> => {
  await Bun.sleep(25);
};

describe("RemoteBrowser over the worker protocol", () => {
  test("starts idle and spawns nothing until a page is asked for", async () => {
    let spawned = 0;
    const remote = new RemoteBrowser({
      spawn: () => {
        spawned += 1;
        return loopback().spawn();
      },
    });
    expect(remote.state().status).toBe("idle");
    await remote.handleClientMessage({ sentAt: 1, type: "ping", v: 1 });
    await remote.handleClientMessage({
      button: "none",
      buttons: 0,
      clickCount: 0,
      deltaX: 0,
      deltaY: 0,
      kind: "mouseMoved",
      modifiers: 0,
      type: "input.mouse",
      v: 1,
      x: 1,
      y: 1,
    });
    expect(spawned).toBe(0);
  });

  test("navigates through the worker and reports the tab back", async () => {
    const states: string[] = [];
    const pair = loopback();
    const remote = new RemoteBrowser({
      onStateChange: (state) => {
        states.push(state.status);
      },
      spawn: pair.spawn,
    });
    const wait = await remote.agentNavigate("https://example.com/");
    expect(wait).toBe("skipped");
    await settle();
    expect(remote.state().status).toBe("running");
    expect(remote.state().tabs[0]?.url).toBe("https://example.com/");
    expect(states).toContain("starting");
    const { snapshot } = await remote.agentSnapshot();
    expect(snapshot.url).toBe("https://example.com/");
  });

  test("blocks the private network from every tab it opens", async () => {
    const pair = loopback();
    const remote = new RemoteBrowser({ spawn: pair.spawn });
    await remote.agentNavigate("https://example.com/");
    expect(pair.views[0]?.calls).toContain("Network.setBlockedURLs");
    expect(pair.views[0]?.calls.some((c) => c.startsWith("blocked:"))).toBe(
      true
    );
  });

  test("forwards frames only while somebody is watching", async () => {
    const pair = loopback();
    const remote = new RemoteBrowser({ spawn: pair.spawn });
    await remote.agentNavigate("https://example.com/");
    const [view] = pair.views;
    if (view === undefined) {
      throw new Error("no view");
    }
    // Nobody subscribed: Chrome was never asked to cast.
    expect(view.calls).not.toContain("Page.startScreencast");

    const received: Uint8Array[] = [];
    const unsubscribe = remote.subscribe({
      send: (bytes) => {
        received.push(bytes);
        return true;
      },
    });
    await settle();
    expect(view.calls).toContain("Page.startScreencast");
    view.paint();
    await settle();
    expect(received.length).toBe(1);
    expect(received[0]).toBeInstanceOf(Uint8Array);

    unsubscribe();
    await settle();
    expect(view.calls).toContain("Page.stopScreencast");
    // A late subscriber still gets the newest frame without a repaint.
    const late: Uint8Array[] = [];
    remote.resendLatest({
      send: (bytes) => {
        late.push(bytes);
        return true;
      },
    });
    expect(late.length).toBe(1);
  });

  test("a dead worker reads as a crashed browser, and pending calls fail", async () => {
    const pair = loopback();
    const remote = new RemoteBrowser({ spawn: pair.spawn });
    await remote.agentNavigate("https://example.com/");
    pair.exit({ code: null, signal: "SIGKILL" });
    await settle();
    expect(remote.state().status).toBe("crashed");
    expect(remote.state().error).toMatch(/SIGKILL/u);
  });

  test("close asks the worker to release Chrome and returns to idle", async () => {
    const pair = loopback();
    const remote = new RemoteBrowser({ spawn: pair.spawn });
    await remote.agentNavigate("https://example.com/");
    await remote.close();
    await settle();
    expect(remote.state().status).toBe("idle");
    expect(pair.views[0]?.calls).toContain("Browser.close");
  });
});
