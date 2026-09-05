/**
 * One workspace per signed-in user: their mandate, their receipts, their Chrome.
 *
 * Before this, the process had a single session created at boot and every
 * visitor shared it — a second person's chat aborted the first, and every
 * socket saw the same screencast. Sharing a browser between strangers is worse
 * than it sounds here, because the profile holds whatever the agent has logged
 * into on the first person's behalf.
 *
 * Constructing a `BrowserSession` is cheap — it wires an arbitrator and a
 * screencast and spawns nothing. Chrome appears only on `start()`, which the
 * pane triggers on its first real message. So a workspace is built eagerly and
 * the expensive thing stays lazy, and the cap counts Chromes that are actually
 * running rather than objects that exist.
 *
 * There is deliberately **no cap by default**. `MAX_BROWSERS` is honoured but
 * ships as 0 (unlimited), because that is the call that was made for this
 * build. It is a number in the environment rather than a shape in the code, so
 * putting a ceiling on it later is configuration, not a refactor.
 */

import { BrowserSession } from "@froggy/browser";
import type { BrowserSessionOptions } from "@froggy/browser";
import { SessionId } from "@froggy/domain";
import type {
  Amount,
  PolicyDecision,
  Quote,
  Receipt,
  UserId,
} from "@froggy/domain";
import type { BrowserState, ServiceModes } from "@froggy/protocol";
import type { SpendLedger } from "@froggy/wallet";

import { WorkspaceSession } from "./session";

/** Thrown at the socket boundary so the pane can render a reason. */
export class BrowserLimitReachedError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(
      `This deployment is at its limit of ${limit} browsers. Try again shortly.`
    );
    this.name = "BrowserLimitReachedError";
    this.limit = limit;
  }
}

export interface Workspace {
  readonly browser: BrowserSession;
  readonly session: WorkspaceSession;
  readonly userId: UserId;
}

export interface WorkspaceDeps {
  /**
   * Builds a user's browser. Overridden in tests so the registry — including
   * the cap, which only means anything once a Chrome is actually running — is
   * exercisable without one. Same idiom as `BrowserSessionOptions.createView`.
   */
  readonly createBrowser?: (options: BrowserSessionOptions) => BrowserSession;
  readonly ledger: SpendLedger;
  /** 0 means unlimited. */
  readonly maxBrowsers: number;
  readonly modes: ServiceModes;
  readonly onBrowserState: (userId: UserId, state: BrowserState) => void;
  readonly onPolicyDecision: (userId: UserId, decision: PolicyDecision) => void;
  readonly onReceipt: (userId: UserId, receipt: Receipt) => void;
  /** The server's own oracle, allowlisted from the first moment. */
  readonly oracleHost: string;
  readonly oraclePayTo: string;
  readonly profileRoot: string;
  /** What an asset is worth. Null refuses the spend; see `quotes.ts`. */
  readonly quote: (asset: Amount["asset"], now: number) => Quote | null;
}

/**
 * A filesystem-safe directory name for a DID.
 *
 * Hashed rather than escaped: DIDs contain colons, and a hash also keeps the
 * profile path from naming the user to anyone reading a directory listing on
 * the host.
 */
export const profileDirectoryFor = (root: string, userId: UserId): string =>
  `${root}/${new Bun.CryptoHasher("sha256").update(userId).digest("hex").slice(0, 24)}`;

export class Workspaces {
  private readonly deps: WorkspaceDeps;
  private readonly workspaces = new Map<UserId, Workspace>();

  constructor(deps: WorkspaceDeps) {
    this.deps = deps;
  }

  /** Chromes with a process behind them, as opposed to workspaces that exist. */
  get runningBrowsers(): number {
    let running = 0;
    for (const workspace of this.workspaces.values()) {
      if (workspace.browser.state().status !== "idle") {
        running += 1;
      }
    }
    return running;
  }

  /** The user's workspace, created on first use. */
  for(userId: UserId): Workspace {
    const existing = this.workspaces.get(userId);
    if (existing !== undefined) {
      return existing;
    }
    const session = new WorkspaceSession(
      SessionId.generate(),
      userId,
      {
        ledger: this.deps.ledger,
        modes: this.deps.modes,
        quote: this.deps.quote,
        onPolicyDecision: (decision) => {
          this.deps.onPolicyDecision(userId, decision);
        },
        onReceipt: (receipt) => {
          this.deps.onReceipt(userId, receipt);
        },
      },
      { hosts: [this.deps.oracleHost], payeeIds: [this.deps.oraclePayTo] }
    );
    const build =
      this.deps.createBrowser ??
      ((options: BrowserSessionOptions) => new BrowserSession(options));
    const browser = build({
      onStateChange: (state) => {
        this.deps.onBrowserState(userId, state);
      },
      profileDirectory: profileDirectoryFor(this.deps.profileRoot, userId),
    });
    const workspace: Workspace = { browser, session, userId };
    this.workspaces.set(userId, workspace);
    return workspace;
  }

  /**
   * Refuse before a message that would spawn Chrome, once the cap is reached.
   *
   * Throws rather than returning a boolean so a caller cannot forget to check
   * the result and get a Chrome anyway; the socket turns it into a message the
   * pane renders, instead of a browser that silently never appears.
   */
  admitBrowser(userId: UserId): Workspace {
    const workspace = this.for(userId);
    const { maxBrowsers } = this.deps;
    if (
      maxBrowsers > 0 &&
      workspace.browser.state().status === "idle" &&
      this.runningBrowsers >= maxBrowsers
    ) {
      throw new BrowserLimitReachedError(maxBrowsers);
    }
    return workspace;
  }

  closeAll(): void {
    for (const workspace of this.workspaces.values()) {
      workspace.browser.close();
    }
  }
}
