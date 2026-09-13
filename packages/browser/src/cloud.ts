import type { BrowserPaymentId, TabId } from "@froggy/domain";
import type {
  BrowserClientMessage,
  BrowserPaymentReplay,
  BrowserPaymentRequest,
  BrowserPaymentResult,
  BrowserState,
  BrowserWalletEvent,
  BrowserWalletObservation,
  BrowserWalletReply,
} from "@froggy/protocol";

import { bestEffort } from "./best-effort";
import type { CloudApi, CloudBrowserInfo } from "./cloud-api";
import { CloudCdp } from "./cloud-cdp";
import { recordCloudUsage } from "./cloud-usage";
import type { CloudUsage } from "./cloud-usage";
import { BrowserSessionClosedError, BrowserStartError } from "./errors";
import type { BrowserHandle } from "./handle";
import { HostedBrowserExpiredError } from "./hosted-agent";
import type { FrameSubscriber } from "./screencast";
import { BrowserSession } from "./session";
import type { BrowserSessionOptions } from "./session";
import type { TabView } from "./tabs";

/** Only provider identifiers are persisted; viewer/CDP credentials are fetched afresh. */
export interface CloudBrowserRecord {
  readonly apiVersion?: 3 | 4 | undefined;
  readonly profileId: string;
  readonly browserId: string | null;
  readonly uncertain: boolean;
  readonly usage?: CloudUsage | undefined;
}

export interface CloudBrowserOptions extends BrowserSessionOptions {
  readonly api: CloudApi;
  readonly hostedApi?: CloudApi;
  readonly userKey: string;
  readonly load: () => Promise<CloudBrowserRecord | null>;
  readonly save: (record: CloudBrowserRecord) => Promise<void>;
}

/** One browser, with the hosted worker and human input under explicit ownership. */
export class CloudBrowser implements BrowserHandle {
  private session: BrowserSession;
  private connection: CloudCdp | null = null;
  private info: CloudBrowserInfo | null = null;
  private record: CloudBrowserRecord | null = null;
  private control: "agent" | "human" | "stopping" = "agent";
  private tail: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private closing = false;
  private failure: string | null = null;
  private hostedDriving = false;
  private readonly listeners = new Set<
    (request: BrowserPaymentRequest) => void
  >();
  private readonly walletListeners = new Set<
    (observation: BrowserWalletObservation) => void
  >();

  private readonly options: CloudBrowserOptions;
  constructor(options: CloudBrowserOptions) {
    this.options = options;
    this.session = this.build();
  }

  readonly hosted = {
    prepare: async (): Promise<string> => {
      this.hostedDriving = true;
      await this.close();
      this.hostedDriving = true;
      this.control = "agent";
      const previous = await this.options.load();
      this.record = previous ?? {
        profileId: await this.options.api.profile(this.options.userKey),
        browserId: null,
        uncertain: false,
      };
      await this.options.save(this.record);
      return this.record.profileId;
    },
    attach: async (browserId: string): Promise<void> => {
      this.hostedDriving = true;
      const previous = this.record ?? (await this.options.load());
      if (previous === null) {
        throw new BrowserStartError("The hosted browser profile is missing.");
      }
      if (previous.browserId !== null && previous.browserId !== browserId) {
        throw new BrowserStartError(
          "The hosted worker opened an unexpected browser. Stop it before continuing."
        );
      }
      const adopted: CloudBrowserRecord = {
        ...previous,
        browserId,
        apiVersion: 4,
        uncertain: false,
      };
      const info = await this.browserApi(adopted).get(browserId);
      if (info.status === "stopped") {
        throw new HostedBrowserExpiredError();
      }
      this.record = adopted;
      this.info = info;
      await this.options.save(this.record);
      this.reconnectIfFailed();
      await this.session.start();
    },
    stopUnexpected: async (browserId: string): Promise<void> => {
      const api = this.options.hostedApi;
      if (api === undefined) {
        throw new BrowserStartError("Hosted browser adapter unavailable.");
      }
      await api.stop(browserId);
      const info = await api.get(browserId);
      if (info.status !== "stopped") {
        throw new BrowserStartError(
          "Replacement browser shutdown is unconfirmed."
        );
      }
      const record = this.record ?? (await this.options.load());
      if (record !== null) {
        this.record = {
          ...record,
          usage: recordCloudUsage(record.usage, browserId, info, Date.now()),
        };
        await this.options.save(this.record);
      }
    },
    detach: (): void => {
      this.closing = true;
      this.connection?.close();
      this.session.close();
      this.connection = null;
      this.info = null;
      this.closing = false;
    },
    control: async (control: "agent" | "human" | "stopping"): Promise<void> => {
      this.hostedDriving = true;
      this.control = control;
      this.generation += 1;
      if (control === "human") {
        await this.session.takePage();
      }
      this.publish();
    },
    release: (): void => {
      this.hostedDriving = false;
    },
  };

  private browserApi(record: CloudBrowserRecord | null): CloudApi {
    if (record?.apiVersion === 4) {
      if (this.options.hostedApi === undefined) {
        throw new BrowserStartError(
          "The hosted browser adapter is unavailable."
        );
      }
      return this.options.hostedApi;
    }
    return this.options.api;
  }

  state(): BrowserState {
    const state = this.session.state();
    let { interaction } = state;
    if (this.hostedDriving) {
      interaction = "agent";
    }
    if (this.control === "human") {
      interaction = "human";
    }
    return {
      ...state,
      error: this.failure ?? state.error,
      status: this.failure === null ? state.status : "crashed",
      interaction,
      cloud: {
        control: this.control,
        viewerReady: this.info?.liveUrl !== null && this.info !== null,
        expiresAt: this.info === null ? null : Date.parse(this.info.timeoutAt),
        stubbed: false,
      },
    };
  }

  async viewer(): Promise<string | null> {
    return await Promise.resolve(
      this.state().status === "running" ? (this.info?.liveUrl ?? null) : null
    );
  }

  subscribe(subscriber: FrameSubscriber): () => void {
    return this.session.subscribe(subscriber);
  }
  resendLatest(subscriber: FrameSubscriber): void {
    this.session.resendLatest(subscriber);
  }

  async handleClientMessage(message: BrowserClientMessage): Promise<void> {
    if (
      this.hostedDriving &&
      (message.type === "browser.take" ||
        message.type === "browser.resume" ||
        (message.type === "browser.start" && message.url !== undefined))
    ) {
      throw new Error(
        "Use the browser task controls to hand over this browser."
      );
    }
    if (message.type === "browser.take") {
      await this.takePage();
      return;
    }
    if (message.type === "browser.resume") {
      if (this.control !== "human") {
        return;
      }
      this.control = "agent";
      this.publish();
      return;
    }
    if (message.type === "ping") {
      return;
    }
    if (message.type !== "browser.start" && this.control !== "human") {
      throw new Error(
        "Take control before interacting with the Cloud browser."
      );
    }
    this.reconnectIfFailed();
    await this.session.handleClientMessage(message);
  }

  async agentNavigate(url: string) {
    return await this.agent(async () => await this.session.agentNavigate(url));
  }
  async agentSnapshot() {
    return await this.agent(async () => await this.session.agentSnapshot());
  }
  async agentClick(ref: string) {
    return await this.agent(async () => await this.session.agentClick(ref));
  }
  async agentType(text: string): Promise<void> {
    await this.agent(async () => {
      await this.session.agentType(text);
    });
  }
  async pendingPayment(): Promise<BrowserPaymentRequest | null> {
    return await this.session.pendingPayment();
  }
  async cancelPayment(id: BrowserPaymentId): Promise<void> {
    await this.session.cancelPayment(id);
  }
  async replayPayment(
    payment: BrowserPaymentReplay
  ): Promise<BrowserPaymentResult> {
    if (this.hostedDriving) {
      return await this.session.replayPayment(payment);
    }
    return await this.agent(
      async () => await this.session.replayPayment(payment)
    );
  }
  subscribePayments(
    listener: (request: BrowserPaymentRequest) => void
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeWalletCalls(
    listener: (observation: BrowserWalletObservation) => void
  ): () => void {
    this.walletListeners.add(listener);
    return () => {
      this.walletListeners.delete(listener);
    };
  }
  async replyWalletCall(
    tabId: TabId,
    contextId: string,
    reply: BrowserWalletReply
  ): Promise<boolean> {
    // Not gated on who holds the page: the answer to a request the person
    // approved must reach the page whether the agent or the person is driving.
    return await this.session.replyWalletCall(tabId, contextId, reply);
  }
  async emitWalletEvent(
    event: BrowserWalletEvent,
    tabId?: TabId
  ): Promise<void> {
    await this.session.emitWalletEvent(event, tabId);
  }

  async takePage(): Promise<void> {
    if (this.hostedDriving) {
      throw new Error("Wait for the hosted worker to release the browser.");
    }
    this.generation += 1;
    this.control = "stopping";
    this.publish();
    await this.session.takePage();
    await bestEffort(this.tail);
    this.control = "human";
    this.publish();
  }

  async close(): Promise<void> {
    this.closing = true;
    this.generation += 1;
    try {
      await bestEffort(this.tail);
      const record = this.record ?? (await this.options.load());
      if (record !== null && record.browserId !== null) {
        // The stop reply carries the browser's final cost, so this is both the
        // lifecycle call and the accounting read. It is deliberately not
        // caught: a browser we failed to stop must keep its id in the record,
        // or nothing will ever stop it and the provider keeps billing.
        const api = this.browserApi(record);
        const stopped = await api.stop(record.browserId);
        const finalInfo =
          record.apiVersion === 4 ? await api.get(record.browserId) : stopped;
        if (record.apiVersion === 4 && finalInfo?.status !== "stopped") {
          throw new BrowserStartError(
            "Browser shutdown is not confirmed. Human input remains locked."
          );
        }
        const usage = recordCloudUsage(
          record.usage,
          record.browserId,
          finalInfo,
          Date.now()
        );
        await this.options.save({
          ...record,
          browserId: null,
          apiVersion: 3,
          uncertain: false,
          usage,
        });
      }
      this.connection?.close();
      this.session.close();
      this.connection = null;
      this.info = null;
      this.record = null;
      this.failure = null;
      this.hostedDriving = false;
      this.session = this.build();
    } finally {
      this.closing = false;
      this.publish();
    }
  }

  async forget(): Promise<void> {
    const record = this.record ?? (await this.options.load());
    await this.close();
    if (record) {
      await this.options.api.deleteProfile(record.profileId);
    }
  }

  private async agent<T>(work: () => Promise<T>): Promise<T> {
    const { generation } = this;
    const previous = this.tail;
    const next = (async () => {
      await bestEffort(previous);
      if (generation !== this.generation || this.closing) {
        throw new BrowserSessionClosedError();
      }
      if (this.hostedDriving) {
        throw new Error(
          "A delegated browser task owns this browser. Use its task controls."
        );
      }
      if (this.control !== "agent") {
        throw new Error(
          "The person has control. Wait for Resume before browsing."
        );
      }
      this.reconnectIfFailed();
      return await work();
    })();
    this.tail = next;
    return await next;
  }

  private reconnectIfFailed(): void {
    if (this.failure === null) {
      return;
    }
    this.session.close();
    this.connection = null;
    this.info = null;
    this.failure = null;
    this.session = this.build();
  }

  private publish(): void {
    this.options.onStateChange?.(this.state());
  }

  private build(): BrowserSession {
    const session = new BrowserSession({
      ...this.options,
      createView: async () => await this.connect(),
      onStateChange: () => {
        this.publish();
      },
    });
    session.subscribePayments((request) => {
      for (const listener of this.listeners) {
        listener(request);
      }
    });
    session.subscribeWalletCalls((observation) => {
      for (const listener of this.walletListeners) {
        listener(observation);
      }
    });
    return session;
  }

  private async connect(): Promise<TabView> {
    this.failure = null;
    this.record = await this.options.load();
    if (this.record?.uncertain === true) {
      throw new BrowserStartError(
        "Cloud browser creation is unconfirmed. Reconcile it before starting another paid session."
      );
    }
    this.record ??= {
      profileId: await this.options.api.profile(this.options.userKey),
      browserId: null,
      uncertain: false,
    };
    await this.options.save(this.record);
    if (this.record.browserId !== null) {
      this.info = await this.browserApi(this.record).get(this.record.browserId);
      if (this.info.status === "stopped") {
        this.info = null;
      }
    }
    if (this.info === null) {
      if (this.record.apiVersion === 4) {
        throw new BrowserStartError(
          "The hosted browser expired. Reconnect explicitly before continuing."
        );
      }
      // Persist the uncertain dispatch before calling the paid provider.
      await this.options.save({ ...this.record, uncertain: true });
      this.info = await this.options.api.create(this.record.profileId);
      this.record = {
        ...this.record,
        browserId: this.info.id,
        uncertain: false,
      };
      await this.options.save(this.record);
    }
    if (this.info.cdpUrl === null || this.info.cdpUrl === "") {
      throw new BrowserStartError("The Cloud browser has no CDP connection.");
    }
    // `cdpUrl` addresses the browser over HTTPS; the socket to attach to is the
    // one Chrome names on that host. Resolved per connection, never persisted.
    const socketUrl = await this.options.api.socket(this.info.cdpUrl);
    this.connection = new CloudCdp(
      socketUrl,
      async (view) => {
        await this.session.adoptTab(view);
      },
      () => {
        if (!this.closing) {
          this.failure =
            "The Cloud browser disconnected. Reconnect to recover the existing session.";
          this.publish();
        }
      }
    );
    return await this.connection.start();
  }
}

const STUB_MESSAGE =
  "Browser Use is stubbed. Configure BROWSER_USE_API_KEY to open a browser.";

/** Missing credentials are explicit; this adapter never pretends a paid run happened. */
export class StubCloudBrowser extends BrowserSession {
  constructor(options: BrowserSessionOptions) {
    // A stub has no provider to ask for a page, and saying so here means the
    // failure is the same one whether the pane or a tool reached for it.
    super({
      ...options,
      createView: () => {
        throw new BrowserStartError(STUB_MESSAGE);
      },
    });
  }

  override state(): BrowserState {
    return {
      ...super.state(),
      status: "unavailable",
      error: STUB_MESSAGE,
      cloud: {
        control: "agent",
        viewerReady: false,
        expiresAt: null,
        stubbed: true,
      },
    };
  }
  override async start(): Promise<void> {
    await Promise.reject(
      new BrowserStartError(this.state().error ?? STUB_MESSAGE)
    );
  }
}
