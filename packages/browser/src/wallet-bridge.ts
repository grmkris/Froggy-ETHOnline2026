/**
 * The bridge between the injected wallet and the server, one per tab.
 *
 * Chrome does the two things a page cannot fake. `Runtime.addBinding` gives
 * the page a function whose calls arrive here as `Runtime.bindingCalled` with
 * the id of the execution context that made them, and
 * `Runtime.executionContextCreated` tells us that context's origin and frame
 * before any script in it runs. So a call's origin is read from Chrome, never
 * from the payload, and the reply is evaluated into exactly that context by
 * its `uniqueId` — a different frame, or the same frame after a navigation,
 * cannot receive an answer meant for another.
 *
 * This class decides nothing. It decodes, caps, attributes, forwards, and
 * delivers. Whether a request is answered, and with what, is the server's.
 */

import type { TabId } from "@froggy/domain";
import {
  BROWSER_WALLET_BINDING,
  BROWSER_WALLET_CALL_LIMIT,
  BrowserWalletCall,
} from "@froggy/protocol";
import type {
  BrowserWalletContext,
  BrowserWalletEvent,
  BrowserWalletObservation,
  BrowserWalletReply,
} from "@froggy/protocol";
import { Result, Schema } from "effect";

import { bestEffort } from "./best-effort";
import type { CdpPayload, CdpTab } from "./cdp";
import {
  DEFAULT_PROVIDER_IDENTITY,
  WALLET_EVENT_GLOBAL,
  WALLET_REPLY_GLOBAL,
  walletProviderScript,
} from "./wallet-provider-script";

export interface WalletBridgeDeps {
  readonly cdp: CdpTab;
  readonly tabId: TabId;
  readonly chainIdHex: string;
  readonly onCall: (observation: BrowserWalletObservation) => void;
  readonly now?: () => number;
}

interface LiveContext {
  readonly numericId: number;
  readonly context: BrowserWalletContext;
}

const decodeCall = Schema.decodeUnknownResult(
  Schema.fromJsonString(BrowserWalletCall)
);
/** Enough of a malformed call to answer it: the id, if the page gave one. */
const decodeCallId = Schema.decodeUnknownResult(
  Schema.fromJsonString(Schema.Struct({ id: Schema.String }))
);

const asRecord = (value: unknown): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  // SAFETY: a non-null object from a CDP event payload, read key by key by
  // the caller with each value narrowed before use — see docs/decisions/0004.
  return value as Readonly<Record<string, unknown>>;
};

export class WalletBridge {
  private readonly deps: WalletBridgeDeps;
  private readonly detach: (() => void)[] = [];
  /** Live main-world contexts, by Chrome's numeric id (what `bindingCalled` carries). */
  private readonly contexts = new Map<number, LiveContext>();
  private topFrameId: string | null = null;
  private topOrigin: string | null = null;
  private disposed = false;

  constructor(deps: WalletBridgeDeps) {
    this.deps = deps;
  }

  /**
   * Install before the tab is released to run: binding first, then the script
   * that captures it, then the frame tree that tells top frames from iframes.
   */
  async start(): Promise<void> {
    const { cdp } = this.deps;
    this.detach.push(
      cdp.on("Runtime.executionContextCreated", (params) => {
        this.contextCreated(params);
      }),
      cdp.on("Runtime.executionContextDestroyed", (params) => {
        const id = params["executionContextId"];
        if (typeof id === "number") {
          this.contexts.delete(id);
        }
      }),
      cdp.on("Runtime.executionContextsCleared", () => {
        this.contexts.clear();
      }),
      cdp.on("Runtime.bindingCalled", (params) => {
        this.bindingCalled(params);
      })
    );
    await cdp.send("Runtime.enable");
    await cdp.send("Runtime.addBinding", { name: BROWSER_WALLET_BINDING });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      runImmediately: true,
      source: walletProviderScript({
        ...DEFAULT_PROVIDER_IDENTITY,
        binding: BROWSER_WALLET_BINDING,
        chainIdHex: this.deps.chainIdHex,
      }),
    });
    const tree = await cdp.send<{
      frameTree?: { frame?: { id?: string; securityOrigin?: string } };
    }>("Page.getFrameTree");
    this.topFrameId = tree.frameTree?.frame?.id ?? null;
    this.topOrigin = tree.frameTree?.frame?.securityOrigin ?? null;
  }

  /** Every live main-world context, top frame first. */
  liveContexts(): readonly BrowserWalletContext[] {
    return [...this.contexts.values()]
      .map((live) => live.context)
      .toSorted((a, b) => Number(b.isTop) - Number(a.isTop));
  }

  /**
   * Deliver one reply into the context that asked. False when that context is
   * gone — the frame navigated or closed — which the caller records as
   * undeliverable rather than retrying somewhere else.
   */
  async reply(contextId: string, reply: BrowserWalletReply): Promise<boolean> {
    if (this.disposed) {
      return false;
    }
    const live = [...this.contexts.values()].some(
      (entry) => entry.context.contextId === contextId
    );
    if (!live) {
      return false;
    }
    return await this.call(
      contextId,
      WALLET_REPLY_GLOBAL,
      JSON.stringify(reply)
    );
  }

  /** Raise an EIP-1193 event in every live context, or in one. */
  async emit(event: BrowserWalletEvent, contextId?: string): Promise<void> {
    if (this.disposed) {
      return;
    }
    const targets =
      contextId === undefined
        ? this.liveContexts().map((context) => context.contextId)
        : [contextId];
    const json = JSON.stringify(event);
    await Promise.all(
      targets.map(
        async (target) =>
          await bestEffort(this.call(target, WALLET_EVENT_GLOBAL, json))
      )
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const off of this.detach) {
      off();
    }
    this.detach.length = 0;
    this.contexts.clear();
  }

  private async call(
    contextId: string,
    global: string,
    json: string
  ): Promise<boolean> {
    try {
      const result = await this.deps.cdp.send<{
        exceptionDetails?: unknown;
      }>(
        "Runtime.evaluate",
        {
          // The JSON is passed as one string literal: nothing in it is code.
          expression: `window[${JSON.stringify(global)}](${JSON.stringify(json)})`,
          returnByValue: true,
          uniqueContextId: contextId,
        },
        { timeoutMs: 5000 }
      );
      return result.exceptionDetails === undefined;
    } catch {
      return false;
    }
  }

  private contextCreated(params: CdpPayload): void {
    const context = asRecord(params["context"]);
    const aux = asRecord(context["auxData"]);
    const { id: numericId, origin, uniqueId } = context;
    const { frameId } = aux;
    if (
      typeof numericId !== "number" ||
      typeof uniqueId !== "string" ||
      typeof origin !== "string" ||
      typeof frameId !== "string" ||
      aux["isDefault"] !== true
    ) {
      // Isolated worlds and workers get no wallet. Only the page's own world
      // can carry a dapp, and only it should be able to ask.
      return;
    }
    const isTop = this.topFrameId === null || frameId === this.topFrameId;
    if (isTop) {
      this.topOrigin = origin;
    }
    this.contexts.set(numericId, {
      context: {
        contextId: uniqueId,
        frameId,
        isTop,
        origin,
        tabId: this.deps.tabId,
        topOrigin: isTop ? origin : (this.topOrigin ?? origin),
      },
      numericId,
    });
  }

  private bindingCalled(params: CdpPayload): void {
    if (params["name"] !== BROWSER_WALLET_BINDING) {
      return;
    }
    const { executionContextId: numericId, payload } = params;
    if (typeof numericId !== "number" || typeof payload !== "string") {
      return;
    }
    const live = this.contexts.get(numericId);
    if (live === undefined) {
      return;
    }
    const { contextId } = live.context;
    if (payload.length > BROWSER_WALLET_CALL_LIMIT) {
      this.refuse(contextId, payload, -32_602, "Request too large for Froggy.");
      return;
    }
    const decoded = decodeCall(payload);
    if (Result.isFailure(decoded)) {
      this.refuse(
        contextId,
        payload,
        -32_600,
        "Froggy could not read that request."
      );
      return;
    }
    this.deps.onCall({
      call: decoded.success,
      context: live.context,
      observedAt: (this.deps.now ?? Date.now)(),
    });
  }

  private refuse(
    contextId: string,
    payload: string,
    code: number,
    message: string
  ): void {
    const id = decodeCallId(payload);
    if (Result.isFailure(id)) {
      return;
    }
    void this.reply(contextId, {
      error: { code, message },
      id: id.success.id,
      ok: false,
      v: 1,
    });
  }
}
