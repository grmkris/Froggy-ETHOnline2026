/**
 * Tabs.
 *
 * Under `Bun.WebView` a tab *is* a WebView instance — Bun owns the Chrome
 * process and hands back one view per window it opened. That has one
 * consequence that shapes this file and `popups.ts`: Bun cannot attach to a
 * target it did not create, so a page that calls `window.open` produces a
 * window we do not own.
 */

import { TabId } from "@froggy/domain";
import type { TabSummary } from "@froggy/protocol";

import { bestEffort } from "./best-effort";
import { webViewCdp } from "./cdp";
import type { CdpPayload, CdpTab } from "./cdp";

export interface TabView extends EventTarget {
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
  readonly createView: () => TabView;
  readonly onStateChange: () => void;
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
   * The navigate is not optional: `Bun.WebView` only establishes its CDP
   * session once the view has loaded something, so a view that is never
   * navigated has no `cdp()` to call and looks broken rather than empty.
   */
  async openTab(url: string = BLANK_PAGE): Promise<Tab> {
    const view = this.deps.createView();
    const id = TabId.generate();
    await view.navigate(url);
    const cdp = webViewCdp(view);
    const tab: Tab = { cdp, id, loading: true, title: "", url, view };
    this.tabs.set(id, tab);
    await bestEffort(cdp.send("Page.enable"));
    cdp.on("Page.domContentEventFired", () => {
      this.scheduleRefresh(tab);
    });
    this.active = id;
    this.scheduleRefresh(tab);
    this.deps.onStateChange();
    return tab;
  }

  activateTab(id: TabId): boolean {
    if (!this.tabs.has(id)) {
      return false;
    }
    this.active = id;
    this.deps.onStateChange();
    return true;
  }

  closeTab(id: TabId): boolean {
    const tab = this.tabs.get(id);
    if (tab === undefined) {
      return false;
    }
    this.clearRefresh(id);
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
