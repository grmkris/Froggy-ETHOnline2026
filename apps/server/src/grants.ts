/**
 * Asking Privy for a signature, and giving it back.
 *
 * Two things happen here and they are deliberately not the same thing:
 *
 *   - **The grant** is asked for on a person's first authenticated request
 *     and never blocks that request. Sign-in must not wait on a round trip to
 *     Privy; the pane shows `pending` and then the real answer. A grant that
 *     did not attach is asked for again, once the last refusal is a minute
 *     old, so a transient refusal heals on the next reload rather than the
 *     next deploy.
 *   - **The revocation** is what freezing does. Our own mandate flips to
 *     judged first and synchronously — that is the layer our policy engine
 *     enforces and it must never depend on a network call — and the Privy
 *     revocation is attempted after. If it fails the user is told, because
 *     "refused here" and "the agent's key is gone" are different guarantees
 *     and only the second one survives a bug in our code.
 *
 * Whatever Privy answers, the person keeps their wallet: its address,
 * balances and funding never depended on the agent being a signer on it, and
 * hiding them because the agent cannot pay is the one thing that made a
 * signed-in wallet read "unavailable".
 *
 * The user's access token is what authorizes both. It is held for the life of
 * the socket rather than re-requested, because a grant has to work at the
 * moment it is pressed and not after a round trip the user did not ask for.
 */

import type { UserId } from "@froggy/domain";
import type { AppServerMessage } from "@froggy/protocol";
import type { AgentGrant, PrivyServer } from "@froggy/wallet";

import { detached } from "./detached";
import type { WorkspaceSession } from "./session";

/** The part of a workspace a grant touches: the session it hands the wallet to. */
export interface GrantWorkspaces {
  readonly for: (userId: UserId) => {
    readonly session: Pick<
      WorkspaceSession,
      "setAddresses" | "setAgentSigner" | "setWallet" | "walletSummary"
    >;
  };
}

export interface GrantDeps {
  /** The clock, injected so a test can move it. Defaults to the wall clock. */
  readonly now?: () => number;
  readonly privy: Pick<PrivyServer, "grantAgent">;
  readonly publishApp: (userId: UserId, message: AppServerMessage) => void;
  readonly workspaces: GrantWorkspaces;
}

/**
 * How long a grant that did not attach waits before the next caller asks
 * again. Long enough not to hammer Privy from a busy tab, short enough that
 * the person's next reload is a real retry.
 */
const RETRY_AFTER_MS = 60_000;

interface Ask {
  readonly at: number;
  /** Privy answered, and the signer is on the wallet. */
  readonly attached: boolean;
  /** False while the request is still in flight. */
  readonly settled: boolean;
}

/** Worth asking again: settled, not attached, and older than the retry window. */
const isStale = (ask: Ask, now: number): boolean =>
  ask.settled && !ask.attached && now - ask.at >= RETRY_AFTER_MS;

export class AgentGrants {
  private readonly deps: GrantDeps;
  /** The last ask per user: in flight, attached, or refused and when. */
  private readonly asked = new Map<UserId, Ask>();

  constructor(deps: GrantDeps) {
    this.deps = deps;
  }

  /**
   * A caller turned up. Ask for their signature unless one is already on the
   * wallet, one is being asked for, or the last refusal is still fresh.
   *
   * Synchronous and returns nothing: the point is that no request waits on it.
   */
  note(userId: UserId, accessToken: string): void {
    const now = this.now();
    const previous = this.asked.get(userId);
    if (previous !== undefined && !isStale(previous, now)) {
      return;
    }
    this.asked.set(userId, { at: now, attached: false, settled: false });
    detached("agent grant", async () => {
      const grant = await this.ask(userId, accessToken);
      if (grant !== null) {
        this.apply(userId, grant);
      }
    });
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** One round trip to Privy, recorded whether it answered or threw. */
  private async ask(
    userId: UserId,
    accessToken: string
  ): Promise<AgentGrant | null> {
    try {
      const grant = await this.deps.privy.grantAgent({
        accessToken,
        did: userId,
      });
      this.asked.set(userId, {
        at: this.now(),
        attached: grant.attached,
        settled: true,
      });
      return grant;
    } catch (error) {
      this.asked.set(userId, {
        at: this.now(),
        attached: false,
        settled: true,
      });
      console.warn(
        `agent grant for ${userId} failed:`,
        error instanceof Error ? error.message : "unknown error"
      );
      return null;
    }
  }

  private apply(userId: UserId, grant: AgentGrant): void {
    const { session } = this.deps.workspaces.for(userId);
    if (grant.wallet !== null) {
      // Both fields, same address: the embedded EOA is where the money is on
      // Base mainnet, because that is the address an EIP-3009 authorization
      // has to be signed by.
      session.setAddresses({
        signer: grant.wallet.address,
        smart: grant.wallet.address,
      });
      session.setWallet(grant.wallet);
    }
    session.setAgentSigner(grant.attached ? "granted" : "absent", grant.reason);
    if (!grant.attached) {
      // Privy's words, in the server log as well as on the person's screen:
      // a refusal here is otherwise invisible to whoever runs the service.
      console.warn(
        `agent grant for ${userId} did not attach:`,
        grant.reason ?? "no reason given"
      );
    }
    detached("wallet publish", async () => {
      const wallet = await session.walletSummary();
      this.deps.publishApp(userId, { type: "wallet.state", v: 1, wallet });
    });
  }
}
