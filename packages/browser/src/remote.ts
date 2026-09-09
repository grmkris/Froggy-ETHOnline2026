/**
 * A browser in another process.
 *
 * `RemoteBrowser` is the host's handle on a `BrowserSession` that lives in a
 * worker. It implements the same interface, so the tools, the sockets and the
 * registry cannot tell which one they hold — the difference is that this one
 * spawns a process on first use, forwards frames byte for byte, and reports a
 * dead worker as a crashed browser rather than as a hung command.
 *
 * Spawning is lazy for the same reason `BrowserSession.start` is: a workspace
 * where nobody asked for a page should not be running a Chrome, and the cap on
 * concurrent browsers counts workers with a process behind them.
 */

import type { BrowserPaymentId } from "@froggy/domain";
import { decodeWorkerEvent } from "@froggy/protocol";
import type {
  BrowserClientMessage,
  BrowserPaymentReplay,
  BrowserPaymentRequest,
  BrowserPaymentResult,
  BrowserState,
  WorkerCommand,
  WorkerReply,
} from "@froggy/protocol";
import { Result } from "effect";

import type { WaitReason } from "./arbitration";
import { bestEffort } from "./best-effort";
import { BrowserSessionClosedError } from "./errors";
import type { BrowserHandle } from "./handle";
import { browserPaymentRefused } from "./payment-navigation";
import type { FrameSubscriber } from "./screencast";
import type { Viewport } from "./session";
import type { Snapshot } from "./snapshot";
import type { WorkerExit, WorkerLink } from "./worker-host";

export interface RemoteBrowserOptions {
  readonly onStateChange?: (state: BrowserState) => void;
  /** How long to wait for the worker's `ready`. Chrome is not started yet at that point. */
  readonly readyTimeoutMs?: number;
  /**
   * Longer than the worker's own CDP deadline (30 s), so a wedged renderer is
   * reported by the worker with the method's name rather than by this side
   * with only a command id.
   */
  readonly requestTimeoutMs?: number;
  readonly spawn: () => WorkerLink;
  readonly viewport?: Viewport;
}

const DEFAULT_VIEWPORT: Viewport = { height: 800, width: 1280 };
const DEFAULT_REQUEST_TIMEOUT_MS = 35_000;
const DEFAULT_READY_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 5000;

/** A command minus the envelope this class fills in. */
type Outgoing = Exclude<WorkerCommand, { readonly type: "frame.ack" }>;
/**
 * `Omit` over a union keeps only the keys every member shares, which would
 * collapse the commands to `{ type }`. Distributing it keeps each member's
 * own fields.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
type Request = DistributiveOmit<Outgoing, "id" | "v">;

interface Pending {
  readonly reject: (error: Error) => void;
  readonly resolve: (reply: WorkerReply) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Which client messages are worth a process.
 *
 * Input into a browser that is not running is a no-op, and spawning a Chrome
 * to deliver a keepalive or a stray click would defeat the cap.
 */
const startsBrowser = (message: BrowserClientMessage): boolean =>
  message.type === "browser.start" || message.type === "browser.navigate";

export class RemoteBrowser implements BrowserHandle {
  private readonly options: RemoteBrowserOptions;
  private readonly subscribers = new Set<FrameSubscriber>();
  private readonly paymentListeners = new Set<
    (request: BrowserPaymentRequest) => void
  >();
  private readonly pending = new Map<number, Pending>();
  private link: WorkerLink | null = null;
  private starting: Promise<WorkerLink> | null = null;
  private detachers: (() => void)[] = [];
  private nextId = 1;
  private latestFrame: Uint8Array | null = null;
  private closing = false;
  private last: BrowserState;

  constructor(options: RemoteBrowserOptions) {
    this.options = options;
    this.last = {
      activeTabId: null,
      error: null,
      interaction: "idle",
      queue: null,
      status: "idle",
      tabs: [],
      viewport: options.viewport ?? DEFAULT_VIEWPORT,
    };
  }

  state(): BrowserState {
    return this.last;
  }

  subscribe(subscriber: FrameSubscriber): () => void {
    this.subscribers.add(subscriber);
    this.resendLatest(subscriber);
    if (this.subscribers.size === 1 && this.link !== null) {
      void bestEffort(
        this.request(this.link, { type: "watch", watching: true })
      );
    }
    return () => {
      if (
        this.subscribers.delete(subscriber) &&
        this.subscribers.size === 0 &&
        this.link !== null
      ) {
        void bestEffort(
          this.request(this.link, { type: "watch", watching: false })
        );
      }
    };
  }

  resendLatest(subscriber: FrameSubscriber): void {
    if (this.latestFrame !== null) {
      subscriber.send(this.latestFrame);
    }
  }

  async handleClientMessage(message: BrowserClientMessage): Promise<void> {
    if (message.type === "ping") {
      return;
    }
    if (this.link === null && !startsBrowser(message)) {
      return;
    }
    const link = await this.ensure();
    await this.request(link, { message, type: "client" });
  }

  async agentNavigate(url: string): Promise<WaitReason> {
    const reply = await this.call({ type: "agent.navigate", url });
    return reply.kind === "navigated" ? reply.wait : "skipped";
  }

  async agentSnapshot(): Promise<{ snapshot: Snapshot; wait: WaitReason }> {
    const reply = await this.call({ type: "agent.snapshot" });
    if (reply.kind !== "snapshot") {
      throw new Error(
        "The browser worker answered a snapshot with something else."
      );
    }
    return { snapshot: reply.snapshot, wait: reply.wait };
  }

  async agentClick(ref: string): Promise<{ ok: boolean; note: string }> {
    const reply = await this.call({ ref, type: "agent.click" });
    return reply.kind === "clicked"
      ? { note: reply.note, ok: reply.ok }
      : { note: "The browser worker did not report the click.", ok: false };
  }

  async agentType(text: string): Promise<void> {
    await this.call({ text, type: "agent.type" });
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
    if (this.link === null) {
      return null;
    }
    const reply = await this.request(this.link, { type: "payment.pending" });
    return reply.kind === "payment.pending" ? reply.payment : null;
  }

  async replayPayment(
    payment: BrowserPaymentReplay
  ): Promise<BrowserPaymentResult> {
    if (this.link === null) {
      return browserPaymentRefused("The browser tab is no longer open.");
    }
    const reply = await this.call({ payment, type: "payment.replay" }, 60_000);
    if (reply.kind !== "payment.result") {
      throw new Error("The browser worker did not report the payment result.");
    }
    return reply.result;
  }

  async cancelPayment(id: BrowserPaymentId): Promise<void> {
    if (this.link !== null) {
      await this.request(this.link, { paymentId: id, type: "payment.cancel" });
    }
  }

  async takePage(): Promise<void> {
    if (this.link !== null) {
      await this.request(this.link, { type: "take" });
    }
  }

  /**
   * Ask the worker to release Chrome gracefully, then make sure it is gone.
   *
   * The graceful half is what flushes the profile to disk; the kill is for a
   * worker that no longer answers, which is exactly the one that must not be
   * left holding the profile lock.
   */
  async close(): Promise<void> {
    const { link } = this;
    if (link === null) {
      return;
    }
    this.closing = true;
    const exited = Promise.withResolvers<null>();
    const detach = link.onExit(() => {
      exited.resolve(null);
    });
    await bestEffort(
      this.request(
        link,
        { graceful: true, type: "shutdown" },
        SHUTDOWN_TIMEOUT_MS
      )
    );
    const timer = setTimeout(() => {
      link.kill();
      exited.resolve(null);
    }, SHUTDOWN_TIMEOUT_MS);
    try {
      await exited.promise;
    } finally {
      clearTimeout(timer);
      detach();
    }
  }

  // -- internals -----------------------------------------------------------

  private publish(state: BrowserState): void {
    this.last = state;
    this.options.onStateChange?.(state);
  }

  private async call(
    request: Request,
    timeoutMs?: number
  ): Promise<WorkerReply> {
    const link = await this.ensure();
    return await this.request(link, request, timeoutMs);
  }

  private async request(
    link: WorkerLink,
    request: Request,
    timeoutMs = this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  ): Promise<WorkerReply> {
    const id = this.nextId;
    this.nextId += 1;
    const { promise, reject, resolve } = Promise.withResolvers<WorkerReply>();
    const timer = setTimeout(() => {
      this.pending.delete(id);
      reject(
        new Error(
          `The browser worker did not answer ${request.type} within ${timeoutMs}ms.`
        )
      );
    }, timeoutMs);
    this.pending.set(id, { reject, resolve, timer });
    link.send({ ...request, id, v: 1 });
    return await promise;
  }

  private async ensure(): Promise<WorkerLink> {
    if (this.link !== null) {
      return this.link;
    }
    if (this.starting !== null) {
      // A second caller joins the spawn in progress rather than starting one.
      return await this.starting;
    }
    this.starting = this.spawn();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async spawn(): Promise<WorkerLink> {
    const link = this.options.spawn();
    const ready = Promise.withResolvers<null>();
    this.detachers = [
      link.onEvent((raw) => {
        this.onEvent(raw, () => {
          ready.resolve(null);
        });
      }),
      link.onExit((exit) => {
        this.onExit(exit);
      }),
    ];
    const readyTimeoutMs =
      this.options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    const timer = setTimeout(() => {
      ready.reject(
        new Error(
          `The browser worker did not become ready within ${readyTimeoutMs}ms.`
        )
      );
    }, readyTimeoutMs);
    try {
      await ready.promise;
    } catch (error) {
      link.kill();
      this.detachAll();
      throw error;
    } finally {
      clearTimeout(timer);
    }
    this.link = link;
    this.closing = false;
    if (this.subscribers.size > 0) {
      await bestEffort(this.request(link, { type: "watch", watching: true }));
    }
    return link;
  }

  private onEvent(raw: unknown, onReady: () => void): void {
    const decoded = decodeWorkerEvent(raw);
    if (Result.isFailure(decoded)) {
      return;
    }
    const event = decoded.success;
    switch (event.type) {
      case "payment.required": {
        for (const listener of this.paymentListeners) {
          listener(event.payment);
        }
        return;
      }
      case "ready": {
        onReady();
        return;
      }
      case "state": {
        this.publish(event.state);
        return;
      }
      case "frame": {
        this.latestFrame = event.bytes;
        for (const subscriber of this.subscribers) {
          subscriber.send(event.bytes);
        }
        // Credit returned after the fan-out: the socket layer does not block,
        // so this is the moment the frame has left this process.
        this.link?.send({ type: "frame.ack", v: 1 });
        return;
      }
      case "reply": {
        const pending = this.take(event.id);
        pending?.resolve(event.result);
        return;
      }
      case "failure": {
        const pending = this.take(event.id);
        const error = new Error(event.error.message);
        error.name = event.error.name;
        pending?.reject(error);
        break;
      }
      default: {
        break;
      }
    }
  }

  private take(id: number): Pending | undefined {
    const pending = this.pending.get(id);
    if (pending !== undefined) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
    }
    return pending;
  }

  private onExit(exit: WorkerExit): void {
    this.detachAll();
    this.link = null;
    this.latestFrame = null;
    const reason =
      exit.signal === null
        ? `The browser worker exited with code ${exit.code ?? "unknown"}.`
        : `The browser worker was killed by ${exit.signal}.`;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new BrowserSessionClosedError(reason));
    }
    this.pending.clear();
    if (this.closing) {
      this.closing = false;
      this.publish({ ...this.last, error: null, status: "idle", tabs: [] });
      return;
    }
    this.publish({ ...this.last, error: reason, status: "crashed", tabs: [] });
  }

  private detachAll(): void {
    for (const detach of this.detachers.splice(0)) {
      detach();
    }
  }
}
