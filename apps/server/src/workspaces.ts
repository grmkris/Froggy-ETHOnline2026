/**
 * One workspace per signed-in user: their mandate, their receipts, their browser.
 *
 * Before this, the process had a single session created at boot and every
 * visitor shared it — a second person's chat aborted the first, and every
 * socket saw the same screencast. Sharing a browser between strangers is worse
 * than it sounds here, because the profile holds whatever the agent has logged
 * into on the first person's behalf.
 *
 * A workspace is built eagerly, but its browser is only created at the
 * provider on the first message that needs a page — so the cap below counts
 * browsers somebody is paying for, not objects that exist. Past the cap a user
 * waits in line and is seated automatically when a seat frees; one seat is held
 * back for the demo account so a judge never waits behind testers. A browser
 * nobody is watching or driving is released after an idle period, which is how
 * eight seats serve more than eight people — and, since the provider bills by
 * the browser-hour, what stops an abandoned tab billing all night.
 */

import type { BrowserHandle, BrowserSessionOptions } from "@froggy/browser";
import { SessionId } from "@froggy/domain";
import type {
  Amount,
  Mandate,
  PolicyDecision,
  Quote,
  Receipt,
  UserId,
} from "@froggy/domain";
import type {
  BrowserPaymentRequest,
  BrowserState,
  BrowserWalletObservation,
  ServiceModes,
} from "@froggy/protocol";
import type { SpendLedger, Store } from "@froggy/wallet";

import { detached } from "./detached";
import type { ApprovalOutcome } from "./interactions";
import { WorkspaceSession } from "./session";
import type { AskInput, SessionDeps } from "./session";

/**
 * Thrown at the socket boundary so the pane can render "third in line".
 *
 * A throw rather than a return so a caller cannot forget to check and get a
 * Chrome anyway; the queue position rides on it because the pane needs the
 * number and the socket is where the refusal becomes a message.
 */
export class BrowserLimitReachedError extends Error {
  readonly ahead: number;
  readonly limit: number;
  readonly position: number;

  constructor(limit: number, position: number) {
    super(
      position === 1
        ? `Every browser seat is taken (${limit}). You are next in line.`
        : `Every browser seat is taken (${limit}). You are ${position} in line.`
    );
    this.name = "BrowserLimitReachedError";
    this.ahead = position - 1;
    this.limit = limit;
    this.position = position;
  }
}

export interface Workspace {
  readonly browser: BrowserHandle;
  readonly session: WorkspaceSession;
  readonly userId: UserId;
}

export interface WorkspaceDeps {
  readonly onBrowserPayment?: (
    userId: UserId,
    request: BrowserPaymentRequest
  ) => void;
  readonly onWalletCall?: (
    userId: UserId,
    observation: BrowserWalletObservation
  ) => void;
  /** Chrome URL patterns every tab refuses on top of the private network. */
  readonly blockedUrls?: readonly string[];
  /** The chain the injected wallet announces, as `0x`-hex. Null injects none. */
  readonly walletChainIdHex?: string | null;
  /** Put an approval card in front of this user and wait. See `SessionDeps.ask`. */
  readonly ask?: (userId: UserId, input: AskInput) => Promise<ApprovalOutcome>;
  /** Off only for local development, where the app itself is on `localhost`. */
  readonly blockPrivateNetwork: boolean;
  /** How long a browser nobody watches or drives stays up. */
  readonly browserIdleMs: number;
  /**
   * Builds a user's browser. Overridden in tests so the registry — including
   * the cap, which only means anything once a Chrome is actually running — is
   * exercisable without one.
   */
  readonly createBrowser: (
    options: BrowserSessionOptions,
    userId: UserId
  ) => BrowserHandle;
  /** What the chains say someone holds; display only. See `SessionDeps.balances`. */
  readonly balances: SessionDeps["balances"];
  /** Always seated. Null when no account is reserved. */
  readonly demoUserId: UserId | null;
  /** Whether an agent turn is running for this session; the sweep leaves it alone. */
  readonly isBusy: (sessionId: SessionId) => boolean;
  readonly ledger: SpendLedger;
  /** 0 means unlimited. */
  readonly maxBrowsers: number;
  readonly modes: ServiceModes;
  readonly now?: () => number;
  readonly onBrowserState: (userId: UserId, state: BrowserState) => void;
  /** The mandate changed for a reason other than a socket message: a load. */
  readonly onMandate: (userId: UserId, mandate: Mandate) => void;
  readonly onPolicyDecision: (userId: UserId, decision: PolicyDecision) => void;
  readonly onReceipt: (userId: UserId, receipt: Receipt) => void;
  /** The server's own oracle, allowlisted from the first moment. */
  readonly oracleHost: string;
  readonly oraclePayTo: string;
  /** The pocket every session draws its Hedera payments from. See `SessionDeps.pocket`. */
  readonly pocket?: SessionDeps["pocket"];
  /** USDC into HBAR when a pocket is short. See `SessionDeps.convert`. */
  readonly convert?: SessionDeps["convert"] | undefined;
  /** What an asset is worth. Null refuses the spend; see `quotes.ts`. */
  readonly quote: (asset: Amount["asset"], now: number) => Quote | null;
  /** Which Base and which Hedera this deployment is on. */
  readonly networks: SessionDeps["networks"];
  /** Seats held for the demo account while it is not using one. */
  readonly reservedBrowsers: number;
  /** Whether mandates keep caps and thresholds. See `SessionDeps.spendingLimits`. */
  readonly spendingLimits?: boolean;
  readonly store: Store;
  /** Where a top-up sends USDC; allowlisted as a payee so the transfer can be judged. Null when unset. */
  readonly treasuryPayee?: string | null;
}

interface Waiting {
  readonly url: string | undefined;
  readonly userId: UserId;
}

/** A browser with a process behind it, as opposed to one that could have. */
const isSeated = (state: BrowserState): boolean =>
  state.status === "starting" || state.status === "running";

export class Workspaces {
  private readonly deps: WorkspaceDeps;
  private readonly workspaces = new Map<UserId, Workspace>();
  /** Last time a person or the agent did something with the browser. */
  private readonly activity = new Map<UserId, number>();
  /** Open browser sockets per user. Zero means nobody is looking. */
  private readonly watchers = new Map<UserId, number>();
  private readonly seated = new Set<UserId>();
  private readonly queue: Waiting[] = [];

  constructor(deps: WorkspaceDeps) {
    this.deps = deps;
  }

  /** Browsers with a process behind them, as opposed to workspaces that exist. */
  get runningBrowsers(): number {
    return this.seated.size;
  }

  /** The workspace if this process already has one, without creating it. */
  existing(userId: UserId): Workspace | undefined {
    return this.workspaces.get(userId);
  }

  /** The user's workspace, created on first use. */
  for(userId: UserId): Workspace {
    const existing = this.workspaces.get(userId);
    if (existing !== undefined) {
      return existing;
    }
    const { ask } = this.deps;
    const withoutPocket: SessionDeps = {
      balances: this.deps.balances,
      ledger: this.deps.ledger,
      modes: this.deps.modes,
      networks: this.deps.networks,
      onMandate: (mandate) => {
        this.deps.onMandate(userId, mandate);
      },
      quote: this.deps.quote,
      onPolicyDecision: (decision) => {
        this.deps.onPolicyDecision(userId, decision);
      },
      onReceipt: (receipt) => {
        this.deps.onReceipt(userId, receipt);
      },
      spendingLimits: this.deps.spendingLimits === true,
      store: this.deps.store,
    };
    const { convert, pocket } = this.deps;
    const withPocket: SessionDeps =
      pocket === undefined ? withoutPocket : { ...withoutPocket, pocket };
    const sessionDeps: SessionDeps =
      convert === undefined ? withPocket : { ...withPocket, convert };
    const treasury = this.deps.treasuryPayee ?? null;
    const session = new WorkspaceSession(
      SessionId.generate(),
      userId,
      ask === undefined
        ? sessionDeps
        : {
            ...sessionDeps,
            ask: async (input: AskInput) => await ask(userId, input),
          },
      {
        hosts: [this.deps.oracleHost],
        payeeIds:
          treasury === null
            ? [this.deps.oraclePayTo]
            : [this.deps.oraclePayTo, treasury],
      }
    );
    const onStateChange = (state: BrowserState): void => {
      this.observe(userId, state);
      this.deps.onBrowserState(userId, this.decorate(userId, state));
    };
    // One provider browser per signed-in user, each on that user's own
    // provider profile: the logins the agent collects on someone's behalf are
    // theirs, and two users must never meet in one cookie jar.
    const browser = this.deps.createBrowser(
      {
        blockPrivateNetwork: this.deps.blockPrivateNetwork,
        blockedUrls: this.deps.blockedUrls ?? [],
        onStateChange,
        walletChainIdHex: this.deps.walletChainIdHex ?? null,
      },
      userId
    );
    browser.subscribePayments((request) =>
      this.deps.onBrowserPayment?.(userId, request)
    );
    if (this.deps.onWalletCall !== undefined) {
      browser.subscribeWalletCalls((observation) => {
        this.deps.onWalletCall?.(userId, observation);
      });
    }
    const workspace: Workspace = { browser, session, userId };
    this.workspaces.set(userId, workspace);
    this.touch(userId);
    return workspace;
  }

  /**
   * The workspace, with what a previous process persisted loaded into it.
   *
   * Routes await this; a socket only starts it, because the load publishes
   * the mandate when it lands and a pane that opened early sees the defaults
   * replaced rather than nothing. A store that cannot be read leaves the
   * defaults in place and says so in the log; it does not stop the workspace.
   */
  async hydrate(userId: UserId): Promise<Workspace> {
    const workspace = this.for(userId);
    try {
      await workspace.session.hydrate();
    } catch (error) {
      console.warn(
        `workspace hydrate failed for ${userId}:`,
        error instanceof Error ? error.message : "unknown error"
      );
    }
    return workspace;
  }

  /** The browser state as the pane should see it, queue position included. */
  stateOf(userId: UserId): BrowserState {
    return this.decorate(userId, this.for(userId).browser.state());
  }

  /** A person or the agent did something. Resets the idle clock. */
  touch(userId: UserId): void {
    this.activity.set(userId, this.now());
    const workspace = this.workspaces.get(userId);
    if (workspace?.browser.state().cloud !== undefined) {
      this.deps.onBrowserState(userId, this.stateOf(userId));
    }
  }

  /** A browser socket opened. Somebody is looking. */
  watch(userId: UserId): void {
    this.watchers.set(userId, (this.watchers.get(userId) ?? 0) + 1);
    this.touch(userId);
  }

  /**
   * A browser socket closed. When the last one goes, a place in the queue
   * goes with it: a seat handed to someone who left would sit empty until
   * the idle sweep noticed.
   */
  unwatch(userId: UserId): void {
    const remaining = Math.max(0, (this.watchers.get(userId) ?? 0) - 1);
    this.watchers.set(userId, remaining);
    if (remaining === 0 && this.leaveQueue(userId)) {
      this.publishQueue();
    }
  }

  /**
   * Take a seat, or join the line.
   *
   * Called before a message that would spawn a browser. A user already seated
   * passes; otherwise a free seat is taken and the caller may proceed, or the
   * user is queued and the error carries their position for the pane. The
   * queued message is remembered so the seat, when it comes, starts the page
   * they asked for without another click.
   */
  admitBrowser(userId: UserId, url?: string): Workspace {
    const workspace = this.for(userId);
    this.touch(userId);
    if (this.seated.has(userId)) {
      return workspace;
    }
    if (this.hasSeatFor(userId)) {
      this.leaveQueue(userId);
      this.seated.add(userId);
      return workspace;
    }
    const position = this.joinQueue(userId, url);
    this.publishQueue();
    throw new BrowserLimitReachedError(this.deps.maxBrowsers, position);
  }

  /**
   * Release browsers nobody is using.
   *
   * Local idle requires no watcher. Cloud idle also expires watched sessions:
   * iframe input is cross-origin, so the human explicitly extends its lease.
   * An active agent turn keeps either browser alive. The profile survives on disk, so the
   * next start finds the user's logins where they left them; only the
   * process goes.
   */
  async sweepIdle(): Promise<void> {
    const cutoff = this.now() - this.deps.browserIdleMs;
    for (const workspace of this.workspaces.values()) {
      if (this.deps.isBusy(workspace.session.id)) {
        this.touch(workspace.userId);
      }
    }
    const idle = [...this.workspaces.values()].filter(
      (workspace) =>
        this.seated.has(workspace.userId) &&
        (workspace.browser.state().cloud !== undefined ||
          (this.watchers.get(workspace.userId) ?? 0) === 0) &&
        !this.deps.isBusy(workspace.session.id) &&
        (this.activity.get(workspace.userId) ?? 0) < cutoff
    );
    await Promise.all(
      idle.map(async (workspace) => {
        await workspace.browser.close();
      })
    );
  }

  /**
   * Delete everything this process holds for a person, and their profile.
   *
   * The browser is closed first so Chrome flushes and releases the profile
   * before the directory goes. The store is the caller's to wipe; this is the
   * in-memory half and the disk half.
   */
  async forget(userId: UserId): Promise<void> {
    const workspace = this.workspaces.get(userId);
    if (workspace !== undefined) {
      await (workspace.browser.forget
        ? workspace.browser.forget()
        : workspace.browser.close());
    }
    this.workspaces.delete(userId);
    this.activity.delete(userId);
    this.watchers.delete(userId);
    this.leaveQueue(userId);
    if (this.seated.delete(userId)) {
      this.seatNext();
    }
    this.publishQueue();
  }

  async closeAll(): Promise<void> {
    await Promise.all(
      [...this.workspaces.values()].map(async (workspace) => {
        await workspace.browser.close();
      })
    );
  }

  // -- internals -----------------------------------------------------------

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private hasSeatFor(userId: UserId): boolean {
    const limit = this.deps.maxBrowsers;
    if (limit <= 0) {
      return true;
    }
    const { demoUserId } = this.deps;
    if (userId === demoUserId) {
      return this.seated.size < limit;
    }
    // Seats held back while the demo account is not using one: the judge
    // must never find the box full of testers.
    const reserved =
      demoUserId !== null && !this.seated.has(demoUserId)
        ? Math.min(this.deps.reservedBrowsers, limit)
        : 0;
    return this.seated.size < limit - reserved;
  }

  /** Position in line, one-based. Joining twice keeps the original place. */
  private joinQueue(userId: UserId, url: string | undefined): number {
    const index = this.queue.findIndex((entry) => entry.userId === userId);
    if (index !== -1) {
      this.queue[index] = { url, userId };
      return index + 1;
    }
    this.queue.push({ url, userId });
    return this.queue.length;
  }

  private leaveQueue(userId: UserId): boolean {
    const index = this.queue.findIndex((entry) => entry.userId === userId);
    if (index === -1) {
      return false;
    }
    this.queue.splice(index, 1);
    return true;
  }

  private decorate(userId: UserId, state: BrowserState): BrowserState {
    const index = this.queue.findIndex((entry) => entry.userId === userId);
    const queue = index === -1 ? null : { ahead: index, position: index + 1 };
    if (state.cloud === undefined) {
      return { ...state, queue };
    }
    return {
      ...state,
      cloud: {
        ...state.cloud,
        idleExpiresAt:
          (this.activity.get(userId) ?? this.now()) + this.deps.browserIdleMs,
      },
      queue,
    };
  }

  private publishQueue(): void {
    for (const entry of this.queue) {
      this.deps.onBrowserState(entry.userId, this.stateOf(entry.userId));
    }
  }

  /**
   * A browser changed state. Seats follow processes: a browser that stopped
   * or crashed gives its seat back, and the next person in line takes it.
   */
  private observe(userId: UserId, state: BrowserState): void {
    if (isSeated(state)) {
      this.seated.add(userId);
      return;
    }
    if (!this.seated.delete(userId)) {
      return;
    }
    this.seatNext();
  }

  private seatNext(): void {
    while (this.queue.length > 0) {
      const [next] = this.queue;
      if (next === undefined || !this.hasSeatFor(next.userId)) {
        break;
      }
      this.queue.shift();
      this.seated.add(next.userId);
      const workspace = this.for(next.userId);
      this.deps.onBrowserState(next.userId, this.stateOf(next.userId));
      detached("queued browser start", async () => {
        await workspace.browser.handleClientMessage(
          next.url === undefined
            ? { type: "browser.start", v: 1 }
            : { type: "browser.start", url: next.url, v: 1 }
        );
      });
    }
    this.publishQueue();
  }
}
