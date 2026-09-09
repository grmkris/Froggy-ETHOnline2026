/**
 * HTTP 402 discovery and one authorized top-level GET replay.
 *
 * Chrome keeps its cookies and renders the seller's response. This class only
 * transports a server-built proof; it cannot choose a payee or sign anything.
 * A proof belongs to one observed navigation and is never installed as a tab's
 * default header, where redirects and subresources could inherit it.
 */
import { BrowserPaymentId } from "@froggy/domain";
import type { TabId } from "@froggy/domain";
import {
  BROWSER_PAYMENT_BODY_LIMIT,
  BROWSER_PAYMENT_CHALLENGE_LIMIT,
  BROWSER_PAYMENT_URL_LIMIT,
} from "@froggy/protocol";
import type {
  BrowserPaymentReplay,
  BrowserPaymentRequest,
  BrowserPaymentResult,
} from "@froggy/protocol";

import { bestEffort } from "./best-effort";
import type { CdpPayload, CdpTab } from "./cdp";

const PAYMENT_TTL_MS = 5 * 60 * 1000;
const REPLAY_TIMEOUT_MS = 20_000;

interface Navigation {
  readonly generation: number;
  readonly method: string;
  readonly requestId: string;
  readonly url: string;
}

interface Observed {
  readonly navigation: Navigation;
  readonly request: BrowserPaymentRequest;
}

interface ResponseInfo {
  readonly paymentResponse: string | null;
  readonly status: number;
  readonly url: string;
}

interface Replay {
  readonly observed: Observed;
  readonly resolve: (result: BrowserPaymentResult) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  header: string;
  networkId: string | null;
  ready: boolean;
  response: ResponseInfo | null;
  sent: boolean;
}

export interface PaymentNavigationDeps {
  readonly cdp: CdpTab;
  readonly currentUrl: () => string;
  readonly isActive: () => boolean;
  readonly navigate: (url: string) => Promise<void>;
  readonly onPayment: (request: BrowserPaymentRequest) => void;
  readonly tabId: TabId;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

/** A UTF-8 byte cap without a partial trailing character. */
const capBytes = (text: string, limit: number): string => {
  const bytes = Buffer.from(text);
  return bytes.length <= limit
    ? text
    : new TextDecoder().decode(bytes.subarray(0, limit), { stream: true });
};

const header = (
  headers: Readonly<Record<string, unknown>> | undefined,
  ...names: readonly string[]
): string | null => {
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (
      names.includes(name.toLowerCase()) &&
      typeof value === "string" &&
      Buffer.byteLength(value) <= BROWSER_PAYMENT_CHALLENGE_LIMIT &&
      !/[\r\n]/u.test(value)
    ) {
      return value;
    }
  }
  return null;
};

export const browserPaymentRefused = (
  message: string,
  url = ""
): BrowserPaymentResult => ({
  body: "",
  error: message,
  paymentResponse: null,
  sent: false,
  status: null,
  url,
});

export class PaymentNavigation {
  private readonly deps: PaymentNavigationDeps;
  private readonly now: () => number;
  private readonly detach: (() => void)[] = [];
  private frameId: string | null = null;
  private generation = 0;
  private navigation: Navigation | null = null;
  private observed: Observed | null = null;
  private response402: {
    readonly navigation: Navigation;
    readonly paymentRequired: string | null;
  } | null = null;
  private capture: Promise<void> | null = null;
  private replay: Replay | null = null;
  private disposed = false;

  constructor(deps: PaymentNavigationDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
  }

  async start(): Promise<void> {
    const { cdp } = this.deps;
    this.detach.push(
      cdp.on("Network.requestWillBeSent", (params) => {
        this.requestStarted(params);
      }),
      cdp.on("Network.responseReceived", (params) => {
        this.responseReceived(params);
      }),
      cdp.on("Network.loadingFinished", (params) => {
        this.loadingFinished(params);
      }),
      cdp.on("Network.loadingFailed", (params) => {
        if (params["requestId"] === this.replay?.networkId) {
          void this.finish(
            "The browser request failed; payment may have been sent."
          );
        }
      }),
      cdp.on("Fetch.requestPaused", (params) => {
        void (async () => {
          try {
            await this.requestPaused(params);
          } catch {
            await this.finish(
              "The browser could not continue the authorized request."
            );
          }
        })();
      }),
      cdp.on("Page.navigatedWithinDocument", (params) => {
        if (params["frameId"] === this.frameId) {
          this.invalidate();
        }
      })
    );
    await cdp.send("Network.enable", {
      maxPostDataSize: 0,
      maxResourceBufferSize: BROWSER_PAYMENT_BODY_LIMIT,
      maxTotalBufferSize: BROWSER_PAYMENT_BODY_LIMIT * 2,
    });
    const tree = await cdp.send<{
      frameTree?: { frame?: { id?: string } };
    }>("Page.getFrameTree");
    this.frameId = tree.frameTree?.frame?.id ?? null;
  }

  async pending(): Promise<BrowserPaymentRequest | null> {
    await this.capture;
    return this.isCurrent(this.observed) ? this.observed.request : null;
  }

  async replayPayment(
    input: BrowserPaymentReplay
  ): Promise<BrowserPaymentResult> {
    const { observed } = this;
    if (
      this.replay !== null ||
      observed?.request.id !== input.id ||
      !this.isCurrent(observed)
    ) {
      return browserPaymentRefused(
        "This payment request expired or the browser moved on. Open the paid page again."
      );
    }
    if (
      input.paymentHeader.length === 0 ||
      Buffer.byteLength(input.paymentHeader) >
        BROWSER_PAYMENT_CHALLENGE_LIMIT ||
      /[\r\n]/u.test(input.paymentHeader)
    ) {
      return browserPaymentRefused(
        "The payment proof is not a bounded HTTP header."
      );
    }
    const result = Promise.withResolvers<BrowserPaymentResult>();
    const timer = setTimeout(() => {
      void this.finish(
        "The browser did not finish the payment request in time."
      );
    }, this.deps.timeoutMs ?? REPLAY_TIMEOUT_MS);
    const replay: Replay = {
      header: input.paymentHeader,
      networkId: null,
      observed,
      ready: false,
      resolve: result.resolve,
      response: null,
      sent: false,
      timer,
    };
    this.replay = replay;
    // Consumed before any await. A duplicate caller can never spend it again.
    this.observed = null;
    try {
      await this.deps.cdp.send("Fetch.enable", {
        patterns: [{ requestStage: "Request", resourceType: "Document" }],
      });
      if (this.replay === replay && this.isNavigationCurrent(observed)) {
        replay.ready = true;
        // Bun's navigation waits for the page; awaiting it here would prevent
        // the result from resolving when a cancelled navigation never returns.
        void (async () => {
          try {
            await this.deps.navigate(observed.request.url);
          } catch {
            if (this.replay === replay) {
              await this.finish(
                "The browser could not load the authorized page."
              );
            }
          }
        })();
      } else {
        await this.finish("The browser changed before payment could be sent.");
      }
    } catch {
      await this.finish("The browser could not prepare payment replay.");
    }
    return await result.promise;
  }

  async cancel(id?: BrowserPaymentId): Promise<void> {
    if (id === undefined || this.observed?.request.id === id) {
      this.observed = null;
      this.response402 = null;
      this.generation += 1;
    }
    if (
      this.replay !== null &&
      (id === undefined || this.replay.observed.request.id === id)
    ) {
      await this.finish("The payment request was cancelled.", true);
    }
  }

  cancelReplay(): void {
    if (this.replay !== null) {
      void this.finish("The person took control of the browser.", true);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.observed = null;
    this.response402 = null;
    for (const detach of this.detach.splice(0)) {
      detach();
    }
    void this.finish("The browser tab was closed.");
  }

  private isNavigationCurrent(observed: Observed): boolean {
    return (
      !this.disposed &&
      this.deps.isActive() &&
      this.navigation === observed.navigation &&
      this.generation === observed.navigation.generation &&
      this.deps.currentUrl() === observed.request.url &&
      this.now() - observed.request.observedAt < PAYMENT_TTL_MS
    );
  }

  private isCurrent(observed: Observed | null): observed is Observed {
    return observed !== null && this.isNavigationCurrent(observed);
  }

  private invalidate(): void {
    this.observed = null;
    this.response402 = null;
    this.generation += 1;
    if (this.replay !== null) {
      void this.finish(
        "The browser changed before the payment completed.",
        true
      );
    }
  }

  private requestStarted(params: CdpPayload): void {
    // SAFETY: CDP Network.requestWillBeSent has this documented shape; every
    // field used for request identity is checked below before it is retained.
    const event = params as {
      frameId?: string;
      requestId?: string;
      type?: string;
      request?: { method?: string; url?: string };
      redirectResponse?: { status?: number; url?: string };
    };
    if (
      this.frameId === null ||
      event.frameId !== this.frameId ||
      event.type !== "Document" ||
      typeof event.requestId !== "string" ||
      typeof event.request?.url !== "string" ||
      typeof event.request.method !== "string"
    ) {
      return;
    }
    this.generation += 1;
    this.navigation = {
      generation: this.generation,
      method: event.request.method,
      requestId: event.requestId,
      url: event.request.url,
    };
    this.observed = null;
    this.response402 = null;
    const { replay } = this;
    if (replay === null) {
      return;
    }
    if (replay.sent) {
      // The Fetch pause rejects this redirect before it leaves Chrome.
      if (event.redirectResponse !== undefined) {
        replay.response = {
          paymentResponse: null,
          status: event.redirectResponse.status ?? 0,
          url: replay.observed.request.url,
        };
      }
      return;
    }
    if (
      !replay.ready ||
      event.request.url !== replay.observed.request.url ||
      event.request.method !== "GET" ||
      event.redirectResponse !== undefined ||
      (replay.networkId !== null && replay.networkId !== event.requestId)
    ) {
      void this.finish("The browser changed before payment could be sent.");
      return;
    }
    replay.networkId = event.requestId;
  }

  private responseReceived(params: CdpPayload): void {
    // SAFETY: CDP Network.responseReceived owns this shape; status/URL and
    // header values are narrowed before a bounded payment event is produced.
    const event = params as {
      requestId?: string;
      type?: string;
      response?: {
        headers?: Readonly<Record<string, unknown>>;
        status?: number;
        url?: string;
      };
    };
    const { response } = event;
    if (
      typeof response?.status !== "number" ||
      typeof response.url !== "string"
    ) {
      return;
    }
    const { replay } = this;
    if (replay !== null && event.requestId === replay.networkId) {
      replay.response = {
        paymentResponse: header(
          response.headers,
          "payment-response",
          "x-payment-response"
        ),
        status: response.status,
        url: capBytes(response.url, BROWSER_PAYMENT_URL_LIMIT),
      };
      return;
    }
    const { navigation } = this;
    if (
      this.replay === null &&
      navigation !== null &&
      event.requestId === navigation.requestId &&
      event.type === "Document" &&
      navigation.method === "GET" &&
      response.status === 402 &&
      response.url === navigation.url &&
      Buffer.byteLength(response.url) <= BROWSER_PAYMENT_URL_LIMIT &&
      /^https?:\/\//u.test(response.url)
    ) {
      this.response402 = {
        navigation,
        paymentRequired: header(response.headers, "payment-required"),
      };
    }
  }

  private loadingFinished(params: CdpPayload): void {
    const { requestId } = params;
    if (typeof requestId !== "string") {
      return;
    }
    if (requestId === this.replay?.networkId) {
      const { replay } = this;
      void (async () => {
        const body = await this.readBody(requestId, BROWSER_PAYMENT_BODY_LIMIT);
        if (this.replay === replay) {
          await this.finish(null, false, body);
        }
      })();
      return;
    }
    const response = this.response402;
    if (response === null || response.navigation.requestId !== requestId) {
      return;
    }
    this.response402 = null;
    this.capture = (async () => {
      const body =
        response.paymentRequired === null
          ? await this.readBody(requestId, BROWSER_PAYMENT_CHALLENGE_LIMIT)
          : "";
      if (
        this.disposed ||
        this.navigation !== response.navigation ||
        this.generation !== response.navigation.generation
      ) {
        return;
      }
      const request: BrowserPaymentRequest = {
        body,
        id: BrowserPaymentId.generate(),
        method: "GET",
        observedAt: this.now(),
        paymentRequired: response.paymentRequired,
        tabId: this.deps.tabId,
        url: response.navigation.url,
      };
      this.observed = { navigation: response.navigation, request };
      this.deps.onPayment(request);
    })();
  }

  private async readBody(requestId: string, limit: number): Promise<string> {
    try {
      const result = await this.deps.cdp.send<{
        base64Encoded?: boolean;
        body?: string;
      }>("Network.getResponseBody", { requestId });
      if (typeof result.body !== "string") {
        return "";
      }
      return capBytes(
        result.base64Encoded === true
          ? Buffer.from(result.body, "base64").toString("utf-8")
          : result.body,
        limit
      );
    } catch {
      // Chrome evicts oversized bodies from its bounded Network buffer. The
      // 402 itself is still useful: the host can make an unpaid JSON probe.
      return "";
    }
  }

  private async requestPaused(params: CdpPayload): Promise<void> {
    // SAFETY: CDP Fetch.requestPaused owns these fields; the frame, method,
    // URL and request identifiers are matched before any proof is attached.
    const event = params as {
      frameId?: string;
      networkId?: string;
      redirectedRequestId?: string;
      requestId?: string;
      resourceType?: string;
      request?: {
        headers?: Readonly<Record<string, unknown>>;
        method?: string;
        url?: string;
      };
    };
    if (typeof event.requestId !== "string") {
      return;
    }
    const { replay } = this;
    if (replay === null || event.frameId !== this.frameId) {
      await this.deps.cdp.send("Fetch.continueRequest", {
        requestId: event.requestId,
      });
      return;
    }
    if (
      replay.sent ||
      !replay.ready ||
      !this.deps.isActive() ||
      event.resourceType !== "Document" ||
      event.request?.url !== replay.observed.request.url ||
      event.request.method !== "GET" ||
      event.redirectedRequestId !== undefined ||
      (replay.networkId !== null && event.networkId !== replay.networkId)
    ) {
      await this.deps.cdp.send("Fetch.failRequest", {
        errorReason: "Aborted",
        requestId: event.requestId,
      });
      await this.finish(
        "Payment replay does not follow redirects or changed requests."
      );
      return;
    }
    if (typeof event.networkId !== "string") {
      await this.deps.cdp.send("Fetch.failRequest", {
        errorReason: "Aborted",
        requestId: event.requestId,
      });
      await this.finish("Chrome did not identify the payment request.");
      return;
    }
    replay.networkId = event.networkId;
    const headers = Object.entries(event.request.headers ?? {})
      .filter(
        ([name, value]) =>
          typeof value === "string" &&
          !["payment-signature", "x-payment"].includes(name.toLowerCase())
      )
      .map(([name, value]) => ({ name, value }));
    headers.push(
      { name: "payment-signature", value: replay.header },
      { name: "x-payment", value: replay.header }
    );
    // From this point the capability has been handed to Chrome. Even a CDP
    // timeout is ambiguous and must never trigger a second payment.
    replay.sent = true;
    replay.header = "";
    await this.deps.cdp.send("Fetch.continueRequest", {
      headers,
      requestId: event.requestId,
    });
  }

  private async finish(
    error: string | null,
    stopLoading = false,
    body = ""
  ): Promise<void> {
    const { replay } = this;
    if (replay === null) {
      return;
    }
    this.replay = null;
    replay.header = "";
    clearTimeout(replay.timer);
    if (stopLoading) {
      await bestEffort(this.deps.cdp.send("Page.stopLoading"));
    }
    await bestEffort(this.deps.cdp.send("Fetch.disable"));
    replay.resolve({
      body,
      error,
      paymentResponse: replay.response?.paymentResponse ?? null,
      sent: replay.sent,
      status: replay.response?.status ?? null,
      url: replay.response?.url ?? replay.observed.request.url,
    });
  }
}
