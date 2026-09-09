import { describe, expect, test } from "bun:test";

import { TabId } from "@froggy/domain";
import {
  BROWSER_PAYMENT_BODY_LIMIT,
  BROWSER_PAYMENT_CHALLENGE_LIMIT,
} from "@froggy/protocol";
import type { BrowserPaymentRequest } from "@froggy/protocol";

import type { CdpPayload, CdpTab } from "./cdp";
import { PaymentNavigation } from "./payment-navigation";

interface Call {
  readonly method: string;
  readonly params: CdpPayload;
}

class FakeNetwork implements CdpTab {
  readonly calls: Call[] = [];
  readonly bodies = new Map<string, string>();
  readonly listeners = new Map<string, Set<(params: CdpPayload) => void>>();
  failContinue = false;
  intercepting = false;

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
    switch (method) {
      case "Page.getFrameTree": {
        return answer({ frameTree: { frame: { id: "main-frame" } } });
      }
      case "Network.getResponseBody": {
        return answer({
          body: this.bodies.get(String(params["requestId"])) ?? "",
        });
      }
      case "Fetch.enable": {
        this.intercepting = true;
        break;
      }
      case "Fetch.disable": {
        this.intercepting = false;
        break;
      }
      case "Fetch.continueRequest": {
        if (this.failContinue) {
          throw new Error("CDP timed out after receiving the command");
        }
        break;
      }
      default: {
        break;
      }
    }
    return answer({});
  }
}

const settle = async (): Promise<void> => {
  await Bun.sleep(1);
};

const fixture = async (options: { timeoutMs?: number } = {}) => {
  const cdp = new FakeNetwork();
  const payments: BrowserPaymentRequest[] = [];
  let url = "https://seller.example/report";
  let active = true;
  let now = 10_000;
  let requestNumber = 0;
  const startRequest = (
    target = url,
    request: { frameId?: string; method?: string; type?: string } = {}
  ): string => {
    requestNumber += 1;
    const requestId = `request-${requestNumber}`;
    url = target;
    cdp.emit("Network.requestWillBeSent", {
      frameId: request.frameId ?? "main-frame",
      requestId,
      type: request.type ?? "Document",
      request: {
        headers: { Authorization: "browser-secret", Cookie: "session=private" },
        method: request.method ?? "GET",
        url,
      },
    });
    return requestId;
  };
  const reply = (
    requestId: string,
    status: number,
    headers: Record<string, string> = {},
    body = ""
  ): void => {
    cdp.bodies.set(requestId, body);
    cdp.emit("Network.responseReceived", {
      requestId,
      response: { headers, status, url },
      type: "Document",
    });
    cdp.emit("Network.loadingFinished", { requestId });
  };
  const paused = (requestId: string, target = url): void => {
    cdp.emit("Fetch.requestPaused", {
      frameId: "main-frame",
      networkId: requestId,
      requestId: `fetch-${requestId}`,
      resourceType: "Document",
      request: {
        headers: { Cookie: "session=private", Accept: "text/html" },
        method: "GET",
        url: target,
      },
    });
  };
  const payment = new PaymentNavigation({
    cdp,
    currentUrl: () => url,
    isActive: () => active,
    navigate: async (target) => {
      const requestId = startRequest(target);
      if (cdp.intercepting) {
        paused(requestId, target);
      }
      await Promise.resolve();
    },
    now: () => now,
    onPayment: (request) => {
      payments.push(request);
    },
    tabId: TabId.generate(),
    ...options,
  });
  await payment.start();
  return {
    cdp,
    payment,
    payments,
    paused,
    reply,
    startRequest,
    latestRequest: () => `request-${requestNumber}`,
    setActive: (next: boolean) => {
      active = next;
    },
    setNow: (next: number) => {
      now = next;
    },
    setUrl: (next: string) => {
      url = next;
    },
    discover: async (
      headers: Record<string, string> = {},
      body = "402 page"
    ) => {
      const requestId = startRequest();
      reply(requestId, 402, headers, body);
      const observed = await payment.pending();
      if (observed === null) {
        throw new Error("The fixture did not capture a payment request.");
      }
      return observed;
    },
  };
};

const paidCalls = (cdp: FakeNetwork): readonly Call[] =>
  cdp.calls.filter(
    (call) =>
      call.method === "Fetch.continueRequest" &&
      call.params["headers"] !== undefined
  );

describe("browser payment navigation", () => {
  test("captures real top-level 402 facts without browser credentials", async () => {
    const f = await fixture();
    const observed = await f.discover({
      "Payment-Required": "encoded-challenge",
    });
    expect(observed.paymentRequired).toBe("encoded-challenge");
    expect(observed.method).toBe("GET");
    expect(observed.body).toBe("");
    expect(f.payments).toEqual([observed]);
    expect(JSON.stringify(observed)).not.toContain("browser-secret");
    expect(JSON.stringify(observed)).not.toContain("session=private");
    expect(paidCalls(f.cdp)).toHaveLength(0);
    f.payment.dispose();
  });

  test("discovers an HTML 402 with no x402 header and caps its body", async () => {
    const f = await fixture();
    const observed = await f.discover(
      {},
      "x".repeat(BROWSER_PAYMENT_CHALLENGE_LIMIT + 100)
    );
    expect(observed.paymentRequired).toBeNull();
    expect(Buffer.byteLength(observed.body)).toBe(
      BROWSER_PAYMENT_CHALLENGE_LIMIT
    );
    f.payment.dispose();
  });

  test("does not turn iframe, POST, XHR or free responses into payment requests", async () => {
    await Promise.all(
      [{ frameId: "child-frame" }, { method: "POST" }, { type: "XHR" }].map(
        async (request) => {
          const f = await fixture();
          const requestId = f.startRequest(undefined, request);
          f.reply(requestId, 402, { "payment-required": "challenge" });
          expect(await f.payment.pending()).toBeNull();
          expect(f.payments).toHaveLength(0);
          f.payment.dispose();
        }
      )
    );
    const f = await fixture();
    f.reply(f.startRequest(), 200);
    expect(await f.payment.pending()).toBeNull();
    expect(f.payments).toHaveLength(0);
    f.payment.dispose();
  });

  test("cancelling while a 402 body is captured cannot publish a new payment", async () => {
    const f = await fixture();
    f.reply(f.startRequest(), 402, {}, "pending body");
    await f.payment.cancel();
    expect(await f.payment.pending()).toBeNull();
    expect(f.payments).toHaveLength(0);
    f.payment.dispose();
  });

  test("rejects stale, inactive, expired and cancelled navigation capabilities", async () => {
    const f = await fixture();
    const original = await f.discover();
    f.startRequest();
    const originalReplay = await f.payment.replayPayment({
      id: original.id,
      paymentHeader: "proof",
    });
    expect(originalReplay.sent).toBe(false);
    const inactive = await f.discover();
    f.setActive(false);
    const inactiveReplay = await f.payment.replayPayment({
      id: inactive.id,
      paymentHeader: "proof",
    });
    expect(inactiveReplay.sent).toBe(false);
    f.setActive(true);
    const expired = await f.discover();
    f.setNow(expired.observedAt + 5 * 60 * 1000);
    const expiredReplay = await f.payment.replayPayment({
      id: expired.id,
      paymentHeader: "proof",
    });
    expect(expiredReplay.sent).toBe(false);
    const cancelled = await f.discover();
    await f.payment.cancel(cancelled.id);
    const cancelledReplay = await f.payment.replayPayment({
      id: cancelled.id,
      paymentHeader: "proof",
    });
    expect(cancelledReplay.sent).toBe(false);
    expect(paidCalls(f.cdp)).toHaveLength(0);
    f.payment.dispose();
  });

  test("injects the proof once into the original GET and retains browser headers", async () => {
    const f = await fixture();
    const observed = await f.discover();
    const result = f.payment.replayPayment({
      id: observed.id,
      paymentHeader: "one-proof",
    });
    await settle();
    expect(paidCalls(f.cdp)).toHaveLength(1);
    expect(paidCalls(f.cdp)[0]?.params["headers"]).toEqual([
      { name: "Cookie", value: "session=private" },
      { name: "Accept", value: "text/html" },
      { name: "payment-signature", value: "one-proof" },
      { name: "x-payment", value: "one-proof" },
    ]);
    f.reply(
      f.latestRequest(),
      200,
      { "PAYMENT-RESPONSE": "settled" },
      "paid report"
    );
    expect(await result).toEqual({
      body: "paid report",
      error: null,
      paymentResponse: "settled",
      sent: true,
      status: 200,
      url: observed.url,
    });
    expect(f.cdp.intercepting).toBe(false);
    const observedReplay = await f.payment.replayPayment({
      id: observed.id,
      paymentHeader: "one-proof",
    });
    expect(observedReplay.sent).toBe(false);
    expect(paidCalls(f.cdp)).toHaveLength(1);
    f.payment.dispose();
  });

  test("blocks a paid redirect before sending anything to its target", async () => {
    const f = await fixture();
    const observed = await f.discover();
    const result = f.payment.replayPayment({
      id: observed.id,
      paymentHeader: "one-proof",
    });
    await settle();
    const requestId = f.latestRequest();
    f.cdp.emit("Network.requestWillBeSent", {
      frameId: "main-frame",
      requestId,
      type: "Document",
      request: { method: "GET", url: "https://other.example/report" },
      redirectResponse: { status: 302, url: observed.url },
    });
    f.paused(requestId, "https://other.example/report");
    const outcome = await result;
    expect(outcome.sent).toBe(true);
    expect(outcome.error).toContain("redirects");
    expect(paidCalls(f.cdp)).toHaveLength(1);
    expect(
      f.cdp.calls.some((call) => call.method === "Fetch.failRequest")
    ).toBe(true);
    f.payment.dispose();
  });

  test("a CDP failure after the override is handed off remains sent", async () => {
    const f = await fixture();
    const observed = await f.discover();
    f.cdp.failContinue = true;
    const outcome = await f.payment.replayPayment({
      id: observed.id,
      paymentHeader: "proof",
    });
    expect(outcome.sent).toBe(true);
    expect(outcome.status).toBeNull();
    expect(outcome.error).not.toBeNull();
    f.payment.dispose();
  });

  test("human takeover and a response timeout never make a sent proof reusable", async () => {
    const f = await fixture({ timeoutMs: 10 });
    const observed = await f.discover();
    const pending = f.payment.replayPayment({
      id: observed.id,
      paymentHeader: "proof",
    });
    await settle();
    f.payment.cancelReplay();
    const cancelled = await pending;
    expect(cancelled.sent).toBe(true);
    expect(f.cdp.calls.some((call) => call.method === "Page.stopLoading")).toBe(
      true
    );
    const next = await f.discover();
    const timedOut = await f.payment.replayPayment({
      id: next.id,
      paymentHeader: "other-proof",
    });
    expect(timedOut.sent).toBe(true);
    expect(timedOut.error).toContain("in time");
    const nextReplay = await f.payment.replayPayment({
      id: next.id,
      paymentHeader: "other-proof",
    });
    expect(nextReplay.sent).toBe(false);
    f.payment.dispose();
  });

  test("caps paid response bytes without damaging a Unicode boundary", async () => {
    const f = await fixture();
    const observed = await f.discover();
    const pending = f.payment.replayPayment({
      id: observed.id,
      paymentHeader: "proof",
    });
    await settle();
    f.reply(
      f.latestRequest(),
      200,
      {},
      "😀".repeat(BROWSER_PAYMENT_BODY_LIMIT)
    );
    const result = await pending;
    expect(Buffer.byteLength(result.body)).toBe(BROWSER_PAYMENT_BODY_LIMIT);
    expect(result.body).not.toContain("�");
    f.payment.dispose();
  });
});
