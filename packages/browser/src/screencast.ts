/**
 * The screencast: Chrome's `Page.startScreencast` turned into binary frames.
 *
 * The invariant that matters more than anything else in this file: **ack every
 * frame, unconditionally, before deciding whether to send it.** Chrome stalls
 * the stream after two unacked frames. If the ack is made conditional on the
 * socket having room, then the first time a client falls behind the stream
 * stops for good and the pane freezes with no error anywhere.
 */

import { encodeScreencastFrame } from "@froggy/protocol";
import type { FrameMeta } from "@froggy/protocol";

import { bestEffort } from "./best-effort";
import type { CdpPayload, CdpTab } from "./cdp";

/** `send` returns false when the subscriber is backed up and dropped the frame. */
export interface FrameSubscriber {
  readonly send: (encoded: Uint8Array) => boolean;
}

/**
 * `Page.screencastFrame`, as far as this file reads it.
 *
 * Every field is optional because the payload arrives from Chrome rather than
 * from us: a tab tearing down has been observed emitting an event with metadata
 * and no image data, and decoding that yields a zero-byte JPEG the client then
 * fails to paint.
 */
interface ScreencastFrameEvent {
  readonly data?: string;
  readonly metadata?: {
    readonly deviceHeight?: number;
    readonly deviceWidth?: number;
  };
  readonly sessionId?: number;
}

export interface ScreencastDeps {
  /** Which tab to cast. Re-read on every `sync`, so tab switches follow. */
  readonly activeTab: () => CdpTab | null;
  readonly now?: () => number;
  readonly viewport: { readonly height: number; readonly width: number };
}

/**
 * A frame is only a frame if it carries base64 image data. Chrome has been
 * known to emit an event with metadata and no payload while a tab is tearing
 * down, and decoding that produces a zero-byte JPEG the client then fails on.
 */
/** A frame is only a frame if it carries image data. */
const imageDataOf = (frame: ScreencastFrameEvent): string | null =>
  frame.data !== undefined && frame.data.length > 0 ? frame.data : null;

const ACK_TIMEOUT_MS = 2000;
const JPEG_QUALITY = 60;

export class Screencast {
  private readonly deps: ScreencastDeps;
  private readonly subscribers = new Set<FrameSubscriber>();
  private latestFrame: Uint8Array | null = null;
  private castTab: CdpTab | null = null;
  private detach: (() => void) | null = null;
  /** Serialises `sync`; two interleaved runs used to orphan each other's listener. */
  private syncChain: Promise<void> = Promise.resolve();

  constructor(deps: ScreencastDeps) {
    this.deps = deps;
  }

  subscribe(subscriber: FrameSubscriber): () => void {
    this.subscribers.add(subscriber);
    this.resendLatest(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /**
   * Push the newest frame at one subscriber. Called on subscribe so a fresh
   * pane paints immediately instead of staying blank until the page repaints,
   * and on socket `drain` so a client that fell behind catches up to *now*
   * rather than replaying the backlog it missed.
   */
  resendLatest(subscriber: FrameSubscriber): void {
    if (this.latestFrame !== null) {
      subscriber.send(this.latestFrame);
    }
  }

  /** The one bulk allocation in this package; shed it under memory pressure. */
  dropCachedFrame(): void {
    this.latestFrame = null;
  }

  /**
   * Reconcile which tab is being cast, serialised.
   *
   * Two interleaved runs used to overwrite each other's detach function,
   * orphaning a listener that then acked frames forever for a tab nobody was
   * watching. Chaining every reconcile behind the last removes that entirely.
   */
  async sync(): Promise<void> {
    const previous = this.syncChain;
    const next = (async () => {
      await bestEffort(previous);
      await this.reconcile();
    })();
    this.syncChain = next;
    await next;
  }

  stop(): void {
    this.detach?.();
    this.detach = null;
    const tab = this.castTab;
    this.castTab = null;
    this.latestFrame = null;
    void bestEffort(tab?.send("Page.stopScreencast"));
  }

  private async reconcile(): Promise<void> {
    const target = this.deps.activeTab();
    if (target === this.castTab) {
      return;
    }

    // Detach the listener BEFORE awaiting the stop. A dead tab's stop can hang,
    // and a still-attached listener would go on acking frames forever.
    this.detach?.();
    this.detach = null;
    const previous = this.castTab;
    this.castTab = target;
    if (previous !== null) {
      await bestEffort(previous.send("Page.stopScreencast"));
    }
    if (target === null) {
      return;
    }

    this.detach = target.on("Page.screencastFrame", (params) => {
      this.onFrame(target, params);
    });
    await target.send("Page.startScreencast", {
      everyNthFrame: 1,
      format: "jpeg",
      maxHeight: this.deps.viewport.height,
      maxWidth: this.deps.viewport.width,
      quality: JPEG_QUALITY,
    });
  }

  private onFrame(tab: CdpTab, params: CdpPayload): void {
    // SAFETY: the fields are `Page.screencastFrame`'s and every one is declared
    // optional, so this assertion claims nothing the payload has not earned —
    // see docs/decisions/0004.
    const frame = params as ScreencastFrameEvent;
    const data = imageDataOf(frame);
    if (data === null) {
      return;
    }
    // Unconditional, immediate, fire-and-forget. Short deadline because at frame
    // rate each ack otherwise parks an entry in the command queue.
    void bestEffort(
      tab.send(
        "Page.screencastFrameAck",
        { sessionId: frame.sessionId },
        { timeoutMs: ACK_TIMEOUT_MS }
      )
    );

    const jpeg = new Uint8Array(Buffer.from(data, "base64"));
    const meta: FrameMeta = {
      // Falling back to the configured viewport rather than zero: a frame with
      // no metadata still has pixels, and a zero-sized canvas would drop it.
      h: frame.metadata?.deviceHeight ?? this.deps.viewport.height,
      ts: (this.deps.now ?? Date.now)(),
      w: frame.metadata?.deviceWidth ?? this.deps.viewport.width,
    };
    const encoded = encodeScreencastFrame(meta, jpeg);
    this.latestFrame = encoded;
    for (const subscriber of this.subscribers) {
      subscriber.send(encoded);
    }
  }
}
