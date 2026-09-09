import type { BrowserPaymentId } from "@froggy/domain";
import type {
  BrowserClientMessage,
  BrowserPaymentReplay,
  BrowserPaymentRequest,
  BrowserPaymentResult,
  BrowserState,
} from "@froggy/protocol";

import { bestEffort } from "./best-effort";
import type { CloudApi, CloudBrowserInfo } from "./cloud-api";
import { CloudCdp } from "./cloud-cdp";
import { recordCloudUsage } from "./cloud-usage";
import type { CloudUsage } from "./cloud-usage";
import { BrowserSessionClosedError, BrowserStartError } from "./errors";
import type { BrowserHandle } from "./handle";
import type { FrameSubscriber } from "./screencast";
import { BrowserSession } from "./session";
import type { BrowserSessionOptions } from "./session";
import type { TabView } from "./tabs";

/** Only provider identifiers are persisted; viewer/CDP credentials are fetched afresh. */
export interface CloudBrowserRecord {
  readonly profileId: string;
  readonly browserId: string | null;
  readonly uncertain: boolean;
  readonly usage?: CloudUsage | undefined;
}

export interface CloudBrowserOptions extends BrowserSessionOptions {
  readonly api: CloudApi;
  readonly userKey: string;
  readonly load: () => Promise<CloudBrowserRecord | null>;
  readonly save: (record: CloudBrowserRecord) => Promise<void>;
}

/** Cloud owns Chrome; Froggy remains the only agent allowed to drive it. */
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
  private readonly listeners = new Set<
    (request: BrowserPaymentRequest) => void
  >();

  private readonly options: CloudBrowserOptions;
  constructor(options: CloudBrowserOptions) {
    this.options = options;
    this.session = this.build();
  }

  state(): BrowserState {
    const state = this.session.state();
    return {
      ...state,
      error: this.failure ?? state.error,
      status: this.failure === null ? state.status : "crashed",
      interaction: this.control === "human" ? "human" : state.interaction,
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

  async takePage(): Promise<void> {
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
        await this.options.api.stop(record.browserId);
        const finalInfo = await this.options.api
          .get(record.browserId)
          .catch(() => null);
        const usage = recordCloudUsage(
          record.usage,
          record.browserId,
          finalInfo,
          Date.now()
        );
        await this.options.save({
          ...record,
          browserId: null,
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
      externalBrowser: true,
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
      this.info = await this.options.api.get(this.record.browserId);
      if (this.info.status === "stopped") {
        this.info = null;
      }
    }
    if (this.info === null) {
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
    this.connection = new CloudCdp(
      this.info.cdpUrl,
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

/** Missing credentials are explicit; this adapter never pretends a paid run happened. */
export class StubCloudBrowser extends BrowserSession {
  override state(): BrowserState {
    return {
      ...super.state(),
      status: "unavailable",
      error:
        "Browser Use is stubbed. Configure BROWSER_USE_API_KEY to open a Cloud browser.",
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
      new BrowserStartError(this.state().error ?? "Browser Use is stubbed.")
    );
  }
}
