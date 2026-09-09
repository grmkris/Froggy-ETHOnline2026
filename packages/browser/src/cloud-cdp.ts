import { bestEffort } from "./best-effort";
import type { CdpPayload } from "./cdp";
import { BrowserSessionClosedError, CdpTimeoutError } from "./errors";
import type { TabView } from "./tabs";

interface Reply {
  resolve: (value: CdpPayload) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface Command {
  id: number;
  method: string;
  params: CdpPayload;
  sessionId?: string;
}

interface Envelope {
  id?: number;
  result?: CdpPayload;
  error?: unknown;
  method?: string;
  params?: CdpPayload;
  sessionId?: string;
}

class CloudView extends EventTarget implements TabView {
  readonly attached = true;
  loading = false;
  title = "";
  url: string;
  private readonly connection: CloudCdp;
  private readonly sessionId: string;
  private readonly targetId: string;

  constructor(
    connection: CloudCdp,
    sessionId: string,
    targetId: string,
    url: string
  ) {
    super();
    this.connection = connection;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.url = url;
  }
  async cdp<T = unknown>(method: string, params: CdpPayload = {}): Promise<T> {
    return await this.connection.send<T>(method, params, this.sessionId);
  }
  async ready(): Promise<void> {
    await this.cdp("Runtime.runIfWaitingForDebugger");
  }
  async activate(): Promise<void> {
    await this.connection.send("Target.activateTarget", {
      targetId: this.targetId,
    });
  }
  async navigate(url: string): Promise<void> {
    this.loading = true;
    const loaded = Promise.withResolvers<boolean>();
    const finish = (): void => {
      loaded.resolve(true);
    };
    this.addEventListener("Page.loadEventFired", finish, { once: true });
    const timeout = setTimeout(finish, 15_000);
    try {
      const result = await this.cdp<{ errorText?: string }>("Page.navigate", {
        url,
      });
      if (result.errorText !== undefined && result.errorText !== "") {
        throw new Error("The Cloud browser could not load this page.");
      }
      await loaded.promise;
    } finally {
      clearTimeout(timeout);
      this.removeEventListener("Page.loadEventFired", finish);
      this.loading = false;
    }
  }
  close(): void {
    void bestEffort(
      this.connection.send("Target.closeTarget", { targetId: this.targetId })
    );
  }
  receive(method: string, params: CdpPayload): void {
    if (method === "Page.frameNavigated") {
      // SAFETY: Page.frameNavigated describes the top frame when parentId is absent.
      const frame = params["frame"] as
        | { parentId?: string; url?: string }
        | undefined;
      if (frame?.parentId === undefined && typeof frame?.url === "string") {
        this.url = frame.url;
      }
    }
    if (method === "Page.loadEventFired") {
      this.loading = false;
    }
    this.dispatchEvent(new MessageEvent(method, { data: params }));
  }
}

/** One socket, flattened target sessions. Its credential stays on the server. */
export class CloudCdp {
  private readonly socket: WebSocket;
  private sequence = 0;
  private readonly replies = new Map<number, Reply>();
  private readonly views = new Map<string, CloudView>();
  private readonly first = Promise.withResolvers<TabView>();
  private initial = true;
  private closed = false;
  private readonly ready = Promise.withResolvers<boolean>();
  private readonly onView: (view: TabView) => Promise<void>;
  private readonly onFailure: () => void;

  constructor(
    url: string,
    onView: (view: TabView) => Promise<void>,
    onFailure: () => void
  ) {
    this.onView = onView;
    this.onFailure = onFailure;
    this.socket = new WebSocket(url);
    void bestEffort(this.first.promise);
    void bestEffort(this.ready.promise);
    this.socket.addEventListener("open", () => {
      this.ready.resolve(true);
    });
    this.socket.addEventListener("message", (event) => {
      this.receive(event.data);
    });
    this.socket.addEventListener("error", () => {
      this.fail();
    });
    this.socket.addEventListener("close", () => {
      this.fail();
    });
  }
  async start(): Promise<TabView> {
    const timer = setTimeout(() => {
      this.fail();
      this.socket.close();
    }, 30_000);
    try {
      await this.ready.promise;
      // Pause targets before script execution to attach payment observation.
      await this.send("Target.setAutoAttach", {
        autoAttach: true,
        flatten: true,
        waitForDebuggerOnStart: true,
      });
      if (this.initial) {
        await this.send("Target.createTarget", { url: "about:blank" });
      }
      return await this.first.promise;
    } finally {
      clearTimeout(timer);
    }
  }
  async send<T = CdpPayload>(
    method: string,
    params: CdpPayload = {},
    sessionId?: string
  ): Promise<T> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new BrowserSessionClosedError();
    }
    this.sequence += 1;
    const id = this.sequence;
    const reply = Promise.withResolvers<CdpPayload>();
    const timer = setTimeout(() => {
      this.replies.delete(id);
      reply.reject(new CdpTimeoutError(method, 30_000));
    }, 30_000);
    this.replies.set(id, { ...reply, timer });
    const message: Command = { id, method, params };
    if (sessionId !== undefined) {
      message.sessionId = sessionId;
    }
    this.socket.send(JSON.stringify(message));
    // SAFETY: CDP results are narrowed by the command's caller, as in cdp.ts.
    return (await reply.promise) as T;
  }
  close(): void {
    this.socket.close();
    this.fail();
  }
  private fail(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const error = new BrowserSessionClosedError(
      "The Cloud browser disconnected."
    );
    this.ready.reject(error);
    this.first.reject(error);
    for (const reply of this.replies.values()) {
      clearTimeout(reply.timer);
      reply.reject(error);
    }
    this.replies.clear();
    this.onFailure();
  }
  private receive(data: unknown): void {
    if (typeof data !== "string" || data.length > 4 * 1024 * 1024) {
      return;
    }
    let message: Envelope;
    try {
      // SAFETY: Chrome owns this CDP envelope; each consumed field is narrowed below.
      message = JSON.parse(data) as Envelope;
    } catch {
      return;
    }
    if (message === null || typeof message !== "object") {
      return;
    }
    if (typeof message.id === "number") {
      this.reply(message);
      return;
    }
    if (message.method === "Target.detachedFromTarget") {
      const sessionId = message.params?.["sessionId"];
      if (typeof sessionId === "string") {
        const view = this.views.get(sessionId);
        this.views.delete(sessionId);
        view?.dispatchEvent(new Event("close"));
      }
      return;
    }
    if (message.method === "Target.attachedToTarget") {
      this.attached(message.params ?? {});
      return;
    }
    if (
      typeof message.sessionId === "string" &&
      typeof message.method === "string"
    ) {
      this.views
        .get(message.sessionId)
        ?.receive(message.method, message.params ?? {});
    }
  }
  private reply(message: Envelope): void {
    if (message.id === undefined) {
      return;
    }
    const reply = this.replies.get(message.id);
    if (!reply) {
      return;
    }
    this.replies.delete(message.id);
    clearTimeout(reply.timer);
    if (message.error === undefined) {
      reply.resolve(message.result ?? {});
    } else {
      reply.reject(new Error("The Cloud browser rejected a CDP command."));
    }
  }
  private attached(params: CdpPayload): void {
    // SAFETY: Target.attachedToTarget's fields are checked before use.
    const info = params["targetInfo"] as
      | { targetId?: string; type?: string; url?: string }
      | undefined;
    const { sessionId } = params;
    if (typeof sessionId !== "string" || typeof info?.targetId !== "string") {
      return;
    }
    if (info.type !== "page") {
      void bestEffort(
        this.send("Runtime.runIfWaitingForDebugger", {}, sessionId)
      );
      return;
    }
    const view = new CloudView(
      this,
      sessionId,
      info.targetId,
      info.url ?? "about:blank"
    );
    this.views.set(sessionId, view);
    if (this.initial) {
      this.initial = false;
      this.first.resolve(view);
    } else {
      void this.adopt(view);
    }
  }
  private async adopt(view: TabView): Promise<void> {
    try {
      await this.onView(view);
    } catch {
      this.fail();
    }
  }
}
