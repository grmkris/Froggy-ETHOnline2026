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
import type {
  AgentGrant,
  PersonPolicyRecord,
  PrivyServer,
} from "@froggy/wallet";

import { detached } from "./detached";
import type { PersonPolicies } from "./person-policies";
import { signerStanding } from "./person-policies";
import type { WorkspaceSession } from "./session";

/** The part of a workspace a grant touches: the session it hands the wallet to. */
export interface GrantWorkspaces {
  readonly for: (userId: UserId) => {
    readonly session: Pick<
      WorkspaceSession,
      | "setAddresses"
      | "setAgentPolicy"
      | "setAgentSigner"
      | "setWallet"
      | "walletSummary"
    >;
  };
}

export interface GrantDeps {
  /** The clock, injected so a test can move it. Defaults to the wall clock. */
  readonly now?: () => number;
  /**
   * The person's own policy, when this deployment mints them.
   *
   * Optional so that a deployment without it behaves exactly as before: the
   * signer is attached under the app-wide policy and the pane says `granted`.
   * With it, the signer goes under rules the person set, and a signer found
   * under the old shared policy reports `shared` rather than being silently
   * counted as done.
   */
  readonly policies?: Pick<PersonPolicies, "current" | "ensure">;
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

/**
 * How long to wait before asking again when the answer was "no wallet yet".
 *
 * Privy mints the wallet in the browser and links it a moment later, so an
 * early look sees nothing through no fault of anyone's. That is a different
 * kind of "not attached" from a refusal, and waiting a minute on it is what
 * left somebody watching an empty wallet page. The browser also says so the
 * moment it knows; this is the floor under that, for callers with no browser.
 */
const RETRY_NO_WALLET_MS = 3000;

interface Ask {
  readonly at: number;
  /** Privy answered, and the signer is on the wallet. */
  readonly attached: boolean;
  /** Privy has not linked this person's wallet yet, so there was nothing to grant. */
  readonly awaitingWallet: boolean;
  /** False while the request is still in flight. */
  readonly settled: boolean;
}

/** Worth asking again: settled, not attached, and older than its retry window. */
const isStale = (ask: Ask, now: number): boolean =>
  ask.settled &&
  !ask.attached &&
  now - ask.at >= (ask.awaitingWallet ? RETRY_NO_WALLET_MS : RETRY_AFTER_MS);

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
    this.asked.set(userId, {
      at: now,
      attached: false,
      awaitingWallet: false,
      settled: false,
    });
    detached("agent grant", async () => {
      const grant = await this.ask(userId, accessToken);
      if (grant !== null) {
        const own = (await this.deps.policies?.current(userId)) ?? null;
        this.apply(userId, grant, own);
      }
    });
  }

  /**
   * The person just granted the signature in the browser, where Privy asked
   * them directly. Ask again now, whatever the last answer was: the server
   * reads the signer off the wallet rather than patching it in.
   */
  refresh(userId: UserId, accessToken: string): void {
    this.asked.delete(userId);
    this.note(userId, accessToken);
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
      // Minted before the grant is asked for, so the signer can be attached
      // under the person's own rules the first time rather than under the
      // shared policy and then moved. A refusal here is not fatal: the grant
      // still happens, under the app-wide policy, and the pane says so.
      // Minted before the read, so the policy exists for the browser button to
      // attach the signer under. Granting itself is the browser's job.
      await this.deps.policies?.ensure(userId);
      const grant = await this.deps.privy.grantAgent({
        accessToken,
        did: userId,
      });
      this.asked.set(userId, {
        at: this.now(),
        attached: grant.attached,
        awaitingWallet: grant.wallet === null,
        settled: true,
      });
      return grant;
    } catch (error) {
      this.asked.set(userId, {
        at: this.now(),
        attached: false,
        awaitingWallet: false,
        settled: true,
      });
      console.warn(
        `agent grant for ${userId} failed:`,
        error instanceof Error ? error.message : "unknown error"
      );
      return null;
    }
  }

  private apply(
    userId: UserId,
    grant: AgentGrant,
    ownPolicy: PersonPolicyRecord | null
  ): void {
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
    // The session is told before the standing is computed and published, so the
    // wallet the browser receives already names the policy it is talking about.
    session.setAgentPolicy(ownPolicy);
    const standing = signerStanding({
      attached: grant.attached,
      ownPolicyId: ownPolicy?.policyId ?? null,
      perPerson: this.deps.policies !== undefined,
      policyIds: grant.policyIds,
    });
    session.setAgentSigner(standing, grant.reason);
    if (standing === "absent") {
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
