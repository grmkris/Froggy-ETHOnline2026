import { describe, expect, test } from "bun:test";

import { TabId } from "@froggy/domain";
import { BROWSER_WALLET_BINDING } from "@froggy/protocol";
import type { BrowserWalletObservation } from "@froggy/protocol";

import type { CdpPayload, CdpTab } from "./cdp";
import { WalletBridge } from "./wallet-bridge";
import {
  WALLET_EVENT_GLOBAL,
  WALLET_REPLY_GLOBAL,
} from "./wallet-provider-script";

interface Call {
  readonly method: string;
  readonly params: CdpPayload;
}

class FakeBridgeTab implements CdpTab {
  readonly calls: Call[] = [];
  readonly listeners = new Map<string, Set<(params: CdpPayload) => void>>();
  /** Contexts `Runtime.evaluate` will accept, by `uniqueContextId`. */
  readonly liveContexts = new Set<string>();

  on(method: string, listener: (params: CdpPayload) => void): () => void {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  emit(method: string, params: CdpPayload): void {
    for (const listener of this.listeners.get(method) ?? []) {
      listener(params);
    }
  }

  async send<T = unknown>(method: string, params: CdpPayload = {}): Promise<T> {
    await Promise.resolve();
    this.calls.push({ method, params });
    const answer = (value: unknown): T =>
      // SAFETY: a CDP test double answering the documented per-command shape.
      value as T;
    if (method === "Page.getFrameTree") {
      return answer({
        frameTree: {
          frame: { id: "top-frame", securityOrigin: "https://shop.example" },
        },
      });
    }
    if (method === "Runtime.evaluate") {
      if (!this.liveContexts.has(String(params["uniqueContextId"]))) {
        throw new Error("Cannot find context with specified id");
      }
      return answer({ result: { type: "undefined" } });
    }
    return answer({});
  }

  evaluations(): readonly Call[] {
    return this.calls.filter((call) => call.method === "Runtime.evaluate");
  }

  context(input: {
    readonly id: number;
    readonly uniqueId: string;
    readonly origin: string;
    readonly frameId: string;
    readonly isDefault?: boolean;
  }): void {
    this.liveContexts.add(input.uniqueId);
    this.emit("Runtime.executionContextCreated", {
      context: {
        auxData: {
          frameId: input.frameId,
          isDefault: input.isDefault ?? true,
          type: input.isDefault === false ? "isolated" : "default",
        },
        id: input.id,
        name: "",
        origin: input.origin,
        uniqueId: input.uniqueId,
      },
    });
  }

  binding(executionContextId: number, payload: string): void {
    this.emit("Runtime.bindingCalled", {
      executionContextId,
      name: BROWSER_WALLET_BINDING,
      payload,
    });
  }
}

const TAB = TabId.generate();

const bridgeWith = async (
  tab: FakeBridgeTab
): Promise<{ bridge: WalletBridge; seen: BrowserWalletObservation[] }> => {
  const seen: BrowserWalletObservation[] = [];
  const bridge = new WalletBridge({
    cdp: tab,
    chainIdHex: "0x2105",
    now: () => 1_789_000_000_000,
    onCall: (observation) => {
      seen.push(observation);
    },
    tabId: TAB,
  });
  await bridge.start();
  return { bridge, seen };
};

const settle = async (): Promise<void> => {
  await Bun.sleep(1);
};

describe("WalletBridge.start", () => {
  test("registers the binding before the script that captures it", async () => {
    const tab = new FakeBridgeTab();
    await bridgeWith(tab);
    const methods = tab.calls.map((call) => call.method);
    expect(methods.indexOf("Runtime.addBinding")).toBeLessThan(
      methods.indexOf("Page.addScriptToEvaluateOnNewDocument")
    );
    const inject = tab.calls.find(
      (call) => call.method === "Page.addScriptToEvaluateOnNewDocument"
    );
    expect(inject?.params["runImmediately"]).toBe(true);
    expect(String(inject?.params["source"])).toContain(BROWSER_WALLET_BINDING);
    expect(String(inject?.params["source"])).toContain('"0x2105"');
  });
});

describe("WalletBridge calls", () => {
  test("attributes a call to the origin Chrome reported, not to the payload", async () => {
    const tab = new FakeBridgeTab();
    const { seen } = await bridgeWith(tab);
    tab.context({
      frameId: "top-frame",
      id: 7,
      origin: "https://shop.example",
      uniqueId: "ctx-top",
    });
    tab.binding(
      7,
      JSON.stringify({
        id: "1-abc",
        method: "eth_requestAccounts",
        origin: "https://evil.example",
        params: [],
        v: 1,
      })
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.context).toEqual({
      contextId: "ctx-top",
      frameId: "top-frame",
      isTop: true,
      origin: "https://shop.example",
      tabId: TAB,
      topOrigin: "https://shop.example",
    });
    expect(seen[0]?.call.method).toBe("eth_requestAccounts");
  });

  test("marks an iframe's call with the top document's origin", async () => {
    const tab = new FakeBridgeTab();
    const { seen } = await bridgeWith(tab);
    tab.context({
      frameId: "top-frame",
      id: 1,
      origin: "https://shop.example",
      uniqueId: "ctx-top",
    });
    tab.context({
      frameId: "child-frame",
      id: 2,
      origin: "https://widget.example",
      uniqueId: "ctx-child",
    });
    tab.binding(
      2,
      JSON.stringify({ id: "x", method: "eth_accounts", params: [], v: 1 })
    );
    expect(seen[0]?.context.isTop).toBe(false);
    expect(seen[0]?.context.origin).toBe("https://widget.example");
    expect(seen[0]?.context.topOrigin).toBe("https://shop.example");
  });

  test("ignores isolated worlds and contexts it never saw created", async () => {
    const tab = new FakeBridgeTab();
    const { seen } = await bridgeWith(tab);
    tab.context({
      frameId: "top-frame",
      id: 3,
      isDefault: false,
      origin: "https://shop.example",
      uniqueId: "ctx-isolated",
    });
    tab.binding(
      3,
      JSON.stringify({ id: "x", method: "eth_accounts", params: [], v: 1 })
    );
    tab.binding(
      99,
      JSON.stringify({ id: "y", method: "eth_accounts", params: [], v: 1 })
    );
    expect(seen).toHaveLength(0);
  });

  test("refuses an oversized or unreadable call in the page and forwards nothing", async () => {
    const tab = new FakeBridgeTab();
    const { seen } = await bridgeWith(tab);
    tab.context({
      frameId: "top-frame",
      id: 1,
      origin: "https://shop.example",
      uniqueId: "ctx-top",
    });
    tab.binding(
      1,
      JSON.stringify({
        id: "big",
        method: "personal_sign",
        params: [`0x${"ab".repeat(20_000)}`],
        v: 1,
      })
    );
    tab.binding(1, JSON.stringify({ id: "odd", method: "eth_mine", v: 1 }));
    await settle();
    expect(seen).toHaveLength(0);
    const replies = tab.evaluations();
    expect(replies).toHaveLength(2);
    expect(String(replies[0]?.params["expression"])).toContain(
      WALLET_REPLY_GLOBAL
    );
    expect(String(replies[0]?.params["expression"])).toContain("-32602");
    expect(replies[0]?.params["uniqueContextId"]).toBe("ctx-top");
    expect(String(replies[1]?.params["expression"])).toContain("-32600");
  });
});

describe("WalletBridge replies and events", () => {
  test("delivers a reply into the asking context and reports a gone one", async () => {
    const tab = new FakeBridgeTab();
    const { bridge } = await bridgeWith(tab);
    tab.context({
      frameId: "top-frame",
      id: 1,
      origin: "https://shop.example",
      uniqueId: "ctx-top",
    });
    const delivered = await bridge.reply("ctx-top", {
      id: "1",
      ok: true,
      result: JSON.stringify(["0x1111111111111111111111111111111111111111"]),
      v: 1,
    });
    expect(delivered).toBe(true);
    expect(tab.evaluations()[0]?.params["uniqueContextId"]).toBe("ctx-top");
    tab.emit("Runtime.executionContextDestroyed", {
      executionContextId: 1,
      executionContextUniqueId: "ctx-top",
    });
    const late = await bridge.reply("ctx-top", {
      error: { code: 4001, message: "no" },
      id: "1",
      ok: false,
      v: 1,
    });
    expect(late).toBe(false);
    expect(tab.evaluations()).toHaveLength(1);
  });

  test("raises an event in every live main-world context", async () => {
    const tab = new FakeBridgeTab();
    const { bridge } = await bridgeWith(tab);
    tab.context({
      frameId: "top-frame",
      id: 1,
      origin: "https://shop.example",
      uniqueId: "ctx-top",
    });
    tab.context({
      frameId: "child",
      id: 2,
      origin: "https://widget.example",
      uniqueId: "ctx-child",
    });
    await bridge.emit({
      data: JSON.stringify([]),
      event: "accountsChanged",
      v: 1,
    });
    const targets = tab
      .evaluations()
      .map((call) => call.params["uniqueContextId"]);
    expect(
      targets.toSorted((left, right) =>
        String(left).localeCompare(String(right))
      )
    ).toEqual(["ctx-child", "ctx-top"]);
    expect(String(tab.evaluations()[0]?.params["expression"])).toContain(
      WALLET_EVENT_GLOBAL
    );
  });

  test("forgets every context when Chrome clears them on navigation", async () => {
    const tab = new FakeBridgeTab();
    const { bridge } = await bridgeWith(tab);
    tab.context({
      frameId: "top-frame",
      id: 1,
      origin: "https://shop.example",
      uniqueId: "ctx-top",
    });
    tab.emit("Runtime.executionContextsCleared", {});
    expect(bridge.liveContexts()).toEqual([]);
    bridge.dispose();
    tab.context({
      frameId: "top-frame",
      id: 2,
      origin: "https://shop.example",
      uniqueId: "ctx-2",
    });
    expect(bridge.liveContexts()).toEqual([]);
  });
});
