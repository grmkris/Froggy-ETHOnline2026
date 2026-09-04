/**
 * Popup adoption.
 *
 * This file exists solely because `Bun.WebView` cannot attach to a target it
 * did not create. When a page calls `window.open`, Chrome makes a window we do
 * not own: invisible to the screencast, undriveable by the agent, and still
 * very much on screen for anyone watching. So we notice it, re-open its URL as
 * a tab we *do* own, and close the orphan.
 *
 * The cost is real and worth stating: the popup's JavaScript context is lost.
 * `window.opener` is gone and a popup opened by a form POST arrives as a bare
 * GET. An OAuth popup that only works via `postMessage` back to its opener will
 * not complete. A raw CDP client attaching to the target natively would not
 * have this problem — that is the trade this build accepted in exchange for
 * `Bun.WebView`.
 */

import { bestEffort } from "./best-effort";
import type { CdpPayload, CdpTab } from "./cdp";

interface TargetInfo {
  readonly openerId?: string;
  readonly targetId: string;
  readonly type: string;
  readonly url: string;
}

export interface PopupAdoptionDeps {
  /** Re-open the popup's URL as a tab we own. */
  readonly adopt: (url: string) => Promise<void>;
  /**
   * Shared across every tab's watcher. Target discovery is per CDP session, so
   * a popup is announced once per open tab; without a shared set, three tabs
   * means three copies of the same popup.
   */
  readonly seen: Set<string>;
}

const isAdoptable = (info: TargetInfo): boolean =>
  info.type === "page" &&
  info.openerId !== undefined &&
  /^https?:/u.test(info.url);

export const watchPopupTargets = (
  cdp: CdpTab,
  deps: PopupAdoptionDeps
): (() => void) => {
  const claim = (info: TargetInfo): boolean => {
    // Claimed synchronously, before the first await. Two sessions announcing
    // the same popup in the same tick would otherwise both pass the check and
    // adopt it twice.
    if (deps.seen.has(info.targetId)) {
      return false;
    }
    deps.seen.add(info.targetId);
    return true;
  };

  const handle = (params: CdpPayload): void => {
    // SAFETY: `Target.targetCreated` and `Target.targetInfoChanged` both carry
    // a `targetInfo` object per the DevTools Protocol; `isAdoptable` re-checks
    // the fields it actually reads, so a Chrome that omitted it is a no-op
    // rather than a crash.
    const info = (params as { targetInfo?: TargetInfo }).targetInfo;
    if (info === undefined || !isAdoptable(info)) {
      return;
    }
    if (!claim(info)) {
      return;
    }
    void (async () => {
      await bestEffort(deps.adopt(info.url));
      await bestEffort(
        cdp.send("Target.closeTarget", { targetId: info.targetId })
      );
    })();
  };

  const offCreated = cdp.on("Target.targetCreated", handle);
  // A popup that starts on `about:blank` is not adoptable yet — there is
  // nothing to re-open. It becomes adoptable when it navigates somewhere real,
  // which arrives as a change rather than a creation.
  const offChanged = cdp.on("Target.targetInfoChanged", handle);

  void bestEffort(cdp.send("Target.setDiscoverTargets", { discover: true }));

  return () => {
    offCreated();
    offChanged();
    void bestEffort(cdp.send("Target.setDiscoverTargets", { discover: false }));
  };
};
