/**
 * Tabs.
 *
 * A tab is one CDP target session on the provider's browser. Targets are
 * auto-attached as they appear, so a page that calls `window.open` arrives here
 * as a tab like any other, with its opener and its JavaScript context intact.
 */

import { TabId } from "@froggy/domain";
import type { BrowserPaymentId } from "@froggy/domain";
import type {
  BrowserPaymentReplay,
  BrowserPaymentRequest,
  BrowserPaymentResult,
  BrowserWalletContext,
  BrowserWalletEvent,
  BrowserWalletObservation,
  BrowserWalletReply,
  TabSummary,
} from "@froggy/protocol";

import { bestEffort } from "./best-effort";
import { tabCdp } from "./cdp";
import type { CdpPayload, CdpTab } from "./cdp";
import { browserPaymentRefused, PaymentNavigation } from "./payment-navigation";
import { PRIVATE_URL_PATTERNS } from "./private-network";
import { WalletBridge } from "./wallet-bridge";

export interface TabView extends EventTarget {
  readonly attached?: boolean;
  readonly ready?: () => Promise<void>;
  readonly activate?: () => Promise<void>;
  readonly cdp: <T = unknown>(
    method: string,
    params?: CdpPayload
  ) => Promise<T>;
  readonly close: () => void;
  readonly navigate: (url: string) => Promise<void>;
  readonly loading: boolean;
  readonly title: string;
  readonly url: string;
}

export interface Tab {
  readonly cdp: CdpTab;
  readonly id: TabId;
  loading: boolean;
  title: string;
  url: string;
  readonly view: TabView;
}

export interface TabRegistryDeps {
  /**
   * Have Chrome refuse requests into the private network from every tab.
   * Off only for local development, where the app itself is on `localhost`.
   */
  readonly blockPrivateNetwork: boolean;
  /** Further Chrome URL patterns refused by every tab; see `BrowserSessionOptions.blockedUrls`. */
  readonly blockedUrls: readonly string[];
  readonly createView: () => TabView | Promise<TabView>;
  readonly onStateChange: () => void;
  readonly onPayment: (request: BrowserPaymentRequest) => void;
  /**
   * Inject the wallet into every tab, on this chain. Null leaves pages with no
   * wallet at all, which is what a deployment without an EVM network wants.
   */
  readonly wallet: {
    readonly chainIdHex: string;
    readonly onCall: (observation: BrowserWalletObservation) => void;
  } | null;
}

/**
 * Title and URL are polled, not pushed, and debounced.
 *
 * Bun consumes `Page.frameNavigated` for its own bookkeeping, so the events
 * that would normally carry this never arrive. `Page.domContentEventFired`
 * tells us *that* something changed; a short evaluate tells us what. The
 * debounce exists because a redirect chain fires several times in a row and
 * each one would otherwise cost a round trip.
 */
const TITLE_DEBOUNCE_MS = 300;

const BLANK_PAGE = "about:blank";

export class TabRegistry {
  private readonly deps: TabRegistryDeps;
  private readonly tabs = new Map<TabId, Tab>();
  private readonly payments = new Map<TabId, PaymentNavigation>();
  private readonly bridges = new Map<TabId, WalletBridge>();
  private readonly refreshTimers = new Map<
    TabId,
    ReturnType<typeof setTimeout>
  >();
  private active: TabId | null = null;

  constructor(deps: TabRegistryDeps) {
    this.deps = deps;
  }

  get activeTabId(): TabId | null {
    return this.active;
  }

  get activeTab(): Tab | null {
    return this.active === null ? null : (this.tabs.get(this.active) ?? null);
  }

  get(id: TabId): Tab | null {
    return this.tabs.get(id) ?? null;
  }

  list(): readonly TabSummary[] {
    return [...this.tabs.values()].map((tab) => ({
      id: tab.id,
      loading: tab.loading,
      title: tab.title,
      url: tab.url,
    }));
  }

  /**
   * Open a tab and navigate it.
   *
   * The navigate is not optional: a target that has loaded nothing paints
   * nothing, so a tab that is never navigated looks broken rather than empty.
   */
  async openTab(url: string = BLANK_PAGE): Promise<Tab> {
    const view = await this.deps.createView();
    return await this.adoptTab(view, url);
  }

  async adoptTab(view: TabView, url?: string): Promise<Tab> {
    const id = TabId.generate();
    if (view.attached !== true) {
      await view.navigate(BLANK_PAGE);
    }
    const cdp = tabCdp(view);
    const tab: Tab = { cdp, id, loading: true, title: "", url: view.url, view };
    this.tabs.set(id, tab);
    view.addEventListener(
      "close",
      () => {
        this.closeTab(id);
      },
      { once: true }
    );
    this.active = id;
    await bestEffort(cdp.send("Page.enable"));
    const payment = new PaymentNavigation({
      cdp,
      currentUrl: () => view.url,
      isActive: () => this.active === id,
      navigate: async (target) => {
        await view.navigate(target);
      },
      onPayment: this.deps.onPayment,
      tabId: id,
    });
    this.payments.set(id, payment);
    // Boot on about:blank so the first real request is observed and blocked
    // where necessary, rather than attaching after it has already completed.
    await (view.attached === true
      ? payment.start()
      : bestEffort(payment.start()));
    const blocked = [
      ...(this.deps.blockPrivateNetwork ? PRIVATE_URL_PATTERNS : []),
      ...this.deps.blockedUrls,
    ];
    if (blocked.length > 0) {
      // Enforced by Chrome for every request the tab makes, so a redirect or a
      // subresource cannot reach what a check on the typed URL never saw.
      await bestEffort(cdp.send("Network.enable"));
      await bestEffort(cdp.send("Network.setBlockedURLs", { urls: blocked }));
    }
    if (this.deps.wallet !== null) {
      // Before `ready()`: the binding and the provider script must be in
      // place before the first document's scripts run, or the dapp's wallet
      // discovery happens against an empty window.
      const bridge = new WalletBridge({
        cdp,
        chainIdHex: this.deps.wallet.chainIdHex,
        onCall: this.deps.wallet.onCall,
        tabId: id,
      });
      this.bridges.set(id, bridge);
      await (view.attached === true
        ? bridge.start()
        : bestEffort(bridge.start()));
    }
    cdp.on("Page.domContentEventFired", () => {
      this.scheduleRefresh(tab);
    });
    await view.ready?.();
    if (url !== undefined && url !== BLANK_PAGE) {
      await view.navigate(url);
    }
    this.scheduleRefresh(tab);
    this.deps.onStateChange();
    return tab;
  }

  activateTab(id: TabId): boolean {
    if (!this.tabs.has(id)) {
      return false;
    }
    this.active = id;
    void bestEffort(this.tabs.get(id)?.view.activate?.());
    this.deps.onStateChange();
    return true;
  }

  closeTab(id: TabId): boolean {
    const tab = this.tabs.get(id);
    if (tab === undefined) {
      return false;
    }
    this.clearRefresh(id);
    this.payments.get(id)?.dispose();
    this.payments.delete(id);
    this.bridges.get(id)?.dispose();
    this.bridges.delete(id);
    try {
      tab.view.close();
    } catch {
      // A tab whose Chrome window is already gone still has to leave the map,
      // or the pane keeps offering a tab that cannot be activated.
    }
    this.tabs.delete(id);
    if (this.active === id) {
      this.active = this.pickActiveAfterRemoval();
    }
    this.deps.onStateChange();
    return true;
  }

  async pendingPayment(): Promise<BrowserPaymentRequest | null> {
    const payment =
      this.active === null ? undefined : this.payments.get(this.active);
    return (await payment?.pending()) ?? null;
  }

  async replayPayment(
    input: BrowserPaymentReplay
  ): Promise<BrowserPaymentResult> {
    const payment =
      this.active === null ? undefined : this.payments.get(this.active);
    return payment === undefined
      ? browserPaymentRefused("The browser tab is no longer open.")
      : await payment.replayPayment(input);
  }

  async cancelPayment(id?: BrowserPaymentId): Promise<void> {
    await Promise.all(
      [...this.payments.values()].map(async (payment) => {
        await payment.cancel(id);
      })
    );
  }

  cancelReplays(): void {
    for (const payment of this.payments.values()) {
      payment.cancelReplay();
    }
  }

  async replyWalletCall(
    tabId: TabId,
    contextId: string,
    reply: BrowserWalletReply
  ): Promise<boolean> {
    const bridge = this.bridges.get(tabId);
    return bridge === undefined ? false : await bridge.reply(contextId, reply);
  }

  /** Raise an EIP-1193 event in one tab, or in every tab. */
  async emitWalletEvent(
    event: BrowserWalletEvent,
    tabId?: TabId
  ): Promise<void> {
    const bridges =
      tabId === undefined
        ? [...this.bridges.values()]
        : [this.bridges.get(tabId)].filter(
            (bridge): bridge is WalletBridge => bridge !== undefined
          );
    await Promise.all(bridges.map(async (bridge) => await bridge.emit(event)));
  }

  walletContexts(tabId: TabId): readonly BrowserWalletContext[] {
    return this.bridges.get(tabId)?.liveContexts() ?? [];
  }

  dispose(): void {
    // A snapshot of the keys, because `closeTab` deletes from the map it is
    // iterating and a live iterator would skip tabs.
    const ids = new Set(this.tabs.keys());
    for (const id of ids) {
      this.closeTab(id);
    }
  }

  private pickActiveAfterRemoval(): TabId | null {
    const next = [...this.tabs.keys()].at(-1);
    return next ?? null;
  }

  private clearRefresh(id: TabId): void {
    const timer = this.refreshTimers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.refreshTimers.delete(id);
    }
  }

  private scheduleRefresh(tab: Tab): void {
    this.clearRefresh(tab.id);
    this.refreshTimers.set(
      tab.id,
      setTimeout(() => {
        this.refreshTimers.delete(tab.id);
        void this.refresh(tab);
      }, TITLE_DEBOUNCE_MS)
    );
  }

  private async refresh(tab: Tab): Promise<void> {
    if (!this.tabs.has(tab.id)) {
      return;
    }
    try {
      const result = await tab.cdp.send<{
        result: { value?: { t?: string; u?: string } };
      }>("Runtime.evaluate", {
        expression: "({ u: location.href, t: document.title })",
        returnByValue: true,
      });
      const { value } = result.result;
      tab.url = value?.u ?? tab.url;
      tab.title = value?.t ?? tab.title;
      tab.loading = tab.view.loading;
      this.deps.onStateChange();
    } catch {
      // A tab that cannot be read keeps its last known title. Blanking it on
      // every transient failure would make the tab strip flicker on any slow page.
    }
  }
}
