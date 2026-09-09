/**
 * The shared browser session: one Chrome, driven by two parties.
 *
 * The Chrome is Browser Use's, reached over CDP. This class owns everything on
 * Froggy's side of that socket — the tab registry, the screencast, the
 * arbitration gate and the snapshot cache — and is the only thing outside this
 * directory needs to hold. It never launches a browser: `createView` comes
 * from whatever holds the provider connection, which is `CloudBrowser` in the
 * app and a fixture in the tests.
 *
 * It knows nothing about money. That is deliberate and enforced in
 * `tools/graph.ts`: this package cannot import `@froggy/wallet`. The browser is
 * where hostile content lives, so the browser is the last place a signing key
 * should be reachable from.
 */

import type { BrowserPaymentId } from "@froggy/domain";
import type {
  BrowserClientMessage,
  BrowserPaymentReplay,
  BrowserPaymentRequest,
  BrowserPaymentResult,
  BrowserState,
} from "@froggy/protocol";

import { Arbitrator } from "./arbitration";
import type { WaitReason } from "./arbitration";
import { bestEffort } from "./best-effort";
import { BrowserStartError, looksLikeCrash } from "./errors";
import type { BrowserHandle } from "./handle";
import { dispatchInput } from "./input";
import { browserPaymentRefused } from "./payment-navigation";
import { Screencast } from "./screencast";
import type { FrameSubscriber } from "./screencast";
import { SnapshotCapture } from "./snapshot";
import type { Snapshot, SnapshotRef } from "./snapshot";
import { TabRegistry } from "./tabs";
import type { Tab, TabView } from "./tabs";

/** The size of the shared page, in device pixels. */
export interface Viewport {
  readonly height: number;
  readonly width: number;
}

const DEFAULT_VIEWPORT: Viewport = { height: 800, width: 1280 };

export interface BrowserSessionOptions {
  /**
   * Have Chrome refuse the private network from every tab. Defaults to on;
   * local development turns it off because the app itself is on `localhost`.
   */
  readonly blockPrivateNetwork?: boolean;
  readonly onStateChange?: (state: BrowserState) => void;
  readonly viewport?: Viewport;
}

/**
 * A session, plus the thing that hands it pages.
 *
 * `createView` is the only way a tab comes into existence, and the provider
 * connection supplies it. Nothing in this file knows how to start a browser,
 * which is what makes "Browser Use is the only browser" a property of the code
 * rather than of a configuration flag.
 */
export interface SessionViewOptions extends BrowserSessionOptions {
  readonly createView: () => TabView | Promise<TabView>;
}

export class BrowserSession implements BrowserHandle {
  readonly viewport: Viewport;

  private readonly options: SessionViewOptions;
  private readonly arbiter: Arbitrator;
  private readonly screencast: Screencast;
  private readonly tabs: TabRegistry;
  private readonly snapshots = new SnapshotCapture();
  private readonly paymentListeners = new Set<
    (request: BrowserPaymentRequest) => void
  >();
  private status: BrowserState["status"] = "idle";
  private error: string | null = null;
  /** De-dupes concurrent `start()`: the second caller awaits the first. */
  private starting: Promise<void> | null = null;

  constructor(options: SessionViewOptions) {
    this.options = options;
    this.viewport = options.viewport ?? DEFAULT_VIEWPORT;
    const publish = (): void => {
      this.options.onStateChange?.(this.state());
    };
    this.arbiter = new Arbitrator({ onStateChange: publish });
    this.tabs = new TabRegistry({
      blockPrivateNetwork: options.blockPrivateNetwork ?? true,
      createView: async () => await this.options.createView(),
      onPayment: (request) => {
        for (const listener of this.paymentListeners) {
          listener(request);
        }
      },
      onStateChange: () => {
        publish();
        void this.screencast.sync();
      },
    });
    this.screencast = new Screencast({
      activeTab: () => this.tabs.activeTab?.cdp ?? null,
      viewport: this.viewport,
    });
  }

  state(): BrowserState {
    return {
      activeTabId: this.tabs.activeTabId,
      error: this.error,
      interaction: this.arbiter.interaction.mode,
      // Queueing is the registry's business; a session is never in line.
      queue: null,
      status: this.status,
      tabs: this.tabs.list(),
      viewport: this.viewport,
    };
  }

  /**
   * Open the first page, on demand.
   *
   * Never called at process start: a workspace where nobody has asked for a
   * browser should not be paying for one, and a provider that will not answer
   * should surface when someone asks rather than as a startup error in a log
   * nobody reads.
   */
  async start(url?: string): Promise<void> {
    if (this.status === "running") {
      return;
    }
    // De-duped: a second caller awaits the first rather than paying for a
    // second browser. `browser_execute` and the pane's start button routinely
    // race on a cold session.
    this.starting ??= (async () => {
      try {
        await this.doStart(url);
      } finally {
        this.starting = null;
      }
    })();
    await this.starting;
  }

  close(): void {
    this.arbiter.dispose();
    this.screencast.stop();
    this.tabs.dispose();
    this.status = "idle";
    this.options.onStateChange?.(this.state());
  }

  dropCachedFrame(): void {
    this.screencast.dropCachedFrame();
  }

  subscribe(subscriber: FrameSubscriber): () => void {
    return this.screencast.subscribe(subscriber);
  }

  resendLatest(subscriber: FrameSubscriber): void {
    this.screencast.resendLatest(subscriber);
  }

  /**
   * The panic path.
   *
   * Callers must abort the agent run *before* calling this. Flipping the gate
   * alone only buys 1.5 seconds — the next queued tool call waits out the quiet
   * window and takes the page straight back, which looks exactly like the
   * button not working.
   */
  async takePage(): Promise<void> {
    this.arbiter.noteHumanInput();
    void this.tabs.cancelPayment();
    await bestEffort(this.tabs.activeTab?.cdp.send("Page.stopLoading"));
  }

  noteHumanInput(): void {
    this.tabs.cancelReplays();
    this.arbiter.noteHumanInput();
  }

  async handleClientMessage(message: BrowserClientMessage): Promise<void> {
    switch (message.type) {
      case "input.key":
      case "input.mouse":
      case "input.text": {
        // Credit the human first, so the mode has already flipped by the time
        // the page reacts and the badge never lags the pointer.
        this.noteHumanInput();
        const tab = this.tabs.activeTab;
        if (tab !== null) {
          await this.guard(dispatchInput(tab.cdp, message));
        }
        return;
      }
      case "browser.start": {
        await this.start(message.url);
        return;
      }
      case "browser.navigate": {
        this.noteHumanInput();
        await this.navigate(message.url);
        return;
      }
      case "browser.activate-tab": {
        void this.tabs.cancelPayment();
        this.tabs.activateTab(message.tabId);
        return;
      }
      case "browser.close-tab": {
        this.tabs.closeTab(message.tabId);
        return;
      }
      case "browser.take": {
        await this.takePage();
        break;
      }
      case "browser.resume": {
        // Persistent ownership is implemented by CloudBrowser. Local arbitration expires.
        break;
      }
      case "ping": {
        // Answered by the socket, never here. Routing a keepalive through input
        // handling would flip arbitration to `human` on every interval and
        // starve the agent permanently.
        break;
      }
      // `ping` is handled by the socket, never here: routing a keepalive
      // through input would flip arbitration to `human` on every interval and
      // starve the agent permanently. Anything else unrecognised is ignored
      // rather than thrown — the socket is version-gated already, and tearing
      // down a screencast over one odd frame is the worse failure.
      default: {
        break;
      }
    }
  }

  // -- agent-facing surface ------------------------------------------------

  async navigate(url: string): Promise<void> {
    await this.start();
    const tab = this.tabs.activeTab;
    if (tab === null) {
      throw new BrowserStartError("No tab to navigate.");
    }
    await this.guard(tab.view.navigate(url));
    tab.url = tab.view.url;
    tab.title = tab.view.title;
    tab.loading = tab.view.loading;
    this.options.onStateChange?.(this.state());
  }

  async agentNavigate(url: string): Promise<WaitReason> {
    const { wait } = await this.arbiter.withAgentControl(async () => {
      await this.navigate(url);
    });
    return wait;
  }

  async agentSnapshot(): Promise<{ snapshot: Snapshot; wait: WaitReason }> {
    await this.start();
    const { value, wait } = await this.arbiter.withAgentControl(async () => {
      const tab = this.tabs.activeTab;
      if (tab === null) {
        throw new BrowserStartError("No tab to snapshot.");
      }
      return await this.snapshots.capture(tab.cdp);
    });
    return { snapshot: value, wait };
  }

  async agentClick(ref: string): Promise<{ ok: boolean; note: string }> {
    const resolved = this.snapshots.resolve(ref);
    if (resolved === null) {
      // A ref that misses is the correct outcome of a stale snapshot, and the
      // model is told so plainly rather than left to infer it from a failure.
      return {
        note: `${ref} is not in the current snapshot. Take a fresh snapshot and use a ref from it.`,
        ok: false,
      };
    }
    const { value } = await this.arbiter.withAgentControl(
      async () => await this.clickNode(resolved)
    );
    return value;
  }

  async agentType(text: string): Promise<void> {
    await this.arbiter.withAgentControl(async () => {
      const tab = this.tabs.activeTab;
      if (tab === null) {
        throw new BrowserStartError("No tab to type into.");
      }
      await tab.cdp.send("Input.insertText", { text });
    });
  }

  subscribePayments(
    listener: (request: BrowserPaymentRequest) => void
  ): () => void {
    this.paymentListeners.add(listener);
    return () => {
      this.paymentListeners.delete(listener);
    };
  }

  async pendingPayment(): Promise<BrowserPaymentRequest | null> {
    return await this.tabs.pendingPayment();
  }

  async replayPayment(
    payment: BrowserPaymentReplay
  ): Promise<BrowserPaymentResult> {
    if (this.status !== "running") {
      return browserPaymentRefused("The browser tab is no longer open.");
    }
    const { value } = await this.arbiter.withAgentControl(
      async () => await this.tabs.replayPayment(payment)
    );
    return value;
  }

  async cancelPayment(id: BrowserPaymentId): Promise<void> {
    await this.tabs.cancelPayment(id);
  }

  async openTab(url?: string): Promise<Tab> {
    return await this.tabs.openTab(url);
  }

  async adoptTab(view: TabView): Promise<void> {
    await this.tabs.adoptTab(view);
  }

  // -- internals -----------------------------------------------------------

  private async clickNode(
    ref: SnapshotRef
  ): Promise<{ ok: boolean; note: string }> {
    const tab = this.tabs.activeTab;
    if (tab === null) {
      return { note: "No active tab.", ok: false };
    }
    await bestEffort(
      tab.cdp.send("DOM.scrollIntoViewIfNeeded", {
        backendNodeId: ref.backendNodeId,
      })
    );
    const box = await tab.cdp
      .send<{ model?: { content: readonly number[] } }>("DOM.getBoxModel", {
        backendNodeId: ref.backendNodeId,
      })
      .catch(() => null);
    const quad = box?.model?.content;
    if (quad === undefined || quad.length < 8) {
      return {
        note: `${ref.role} "${ref.label}" has no layout box.`,
        ok: false,
      };
    }
    // The content quad is four corners as eight numbers; its centroid is where
    // a real click would land. Summing by stride keeps this honest under
    // `noUncheckedIndexedAccess` without eight assertions claiming knowledge
    // the length check above only half provides.
    const centroid = (offset: number): number => {
      let total = 0;
      for (let corner = 0; corner < 4; corner += 1) {
        total += quad[offset + corner * 2] ?? 0;
      }
      return total / 4;
    };
    const x = centroid(0);
    const y = centroid(1);
    const before = tab.url;
    const dispatch = async (
      type: "mousePressed" | "mouseReleased"
    ): Promise<void> => {
      await bestEffort(
        tab.cdp.send(
          "Input.dispatchMouseEvent",
          { button: "left", buttons: 1, clickCount: 1, type, x, y },
          // Three seconds, not thirty: a synchronous `alert()` suspends the
          // renderer and the dispatch reply never arrives, so the click has to
          // give up early and report what it saw rather than hang the turn.
          { timeoutMs: 3000 }
        )
      );
    };
    // Strictly ordered: a release that overtakes its press is not a click.
    await dispatch("mousePressed");
    await dispatch("mouseReleased");
    return {
      note:
        tab.url === before
          ? `Clicked ${ref.role} "${ref.label}".`
          : `Clicked ${ref.role} "${ref.label}"; the page navigated to ${tab.url}.`,
      ok: true,
    };
  }

  private async doStart(url?: string): Promise<void> {
    this.status = "starting";
    this.error = null;
    this.options.onStateChange?.(this.state());
    try {
      await this.tabs.openTab(url);
      this.status = "running";
      this.options.onStateChange?.(this.state());
      await this.screencast.sync();
    } catch (error) {
      this.status = "crashed";
      this.error = error instanceof Error ? error.message : String(error);
      this.options.onStateChange?.(this.state());
      throw error;
    }
  }

  /**
   * A dropped provider connection is only visible as the shape of the error
   * the next command fails with. Recognising it here is what lets the pane say
   * "crashed" instead of showing a live-looking browser that answers nothing.
   */
  private async guard<T>(work: Promise<T>): Promise<T> {
    try {
      return await work;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (this.status === "running" && looksLikeCrash(failure)) {
        this.status = "crashed";
        this.error = failure.message;
        this.arbiter.dispose();
        this.screencast.stop();
        this.options.onStateChange?.(this.state());
      }
      throw error;
    }
  }
}
