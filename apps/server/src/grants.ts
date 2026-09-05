/**
 * Asking Privy for a signature, and giving it back.
 *
 * Two things happen here and they are deliberately not the same thing:
 *
 *   - **The grant** is asked for once per user, on their first authenticated
 *     request, and never blocks that request. Sign-in must not wait on a
 *     round trip to Privy; the pane shows `pending` and then the real answer.
 *   - **The revocation** is what freezing does. Our own mandate flips to
 *     frozen first and synchronously — that is the layer our policy engine
 *     enforces and it must never depend on a network call — and the Privy
 *     revocation is attempted after. If it fails the user is told, because
 *     "frozen here" and "the agent's key is gone" are different guarantees
 *     and only the second one survives a bug in our code.
 *
 * The user's access token is what authorizes both. It is held for the life of
 * the socket rather than re-requested, because a freeze has to work at the
 * moment it is pressed and not after a round trip the user did not ask for.
 */

import type { UserId } from "@froggy/domain";
import type { AppServerMessage } from "@froggy/protocol";
import type { AgentGrant, PrivyServer } from "@froggy/wallet";

import { detached } from "./detached";
import type { Workspaces } from "./workspaces";

export interface GrantDeps {
  readonly privy: PrivyServer;
  readonly publishApp: (userId: UserId, message: AppServerMessage) => void;
  readonly workspaces: Workspaces;
}

export class AgentGrants {
  private readonly deps: GrantDeps;
  /** Users whose grant has been asked for. One request each, not one per call. */
  private readonly asked = new Set<UserId>();

  constructor(deps: GrantDeps) {
    this.deps = deps;
  }

  /**
   * A caller turned up. Ask for their signature if we have not already.
   *
   * Synchronous and returns nothing: the point is that no request waits on it.
   */
  note(userId: UserId, accessToken: string): void {
    if (this.asked.has(userId)) {
      return;
    }
    this.asked.add(userId);
    detached("agent grant", async () => {
      const grant = await this.deps.privy.grantAgent({
        accessToken,
        did: userId,
      });
      this.apply(userId, grant);
    });
  }

  /**
   * Freeze: remove the signer.
   *
   * The caller has already frozen the mandate locally. This is the outer
   * layer, and it is allowed to fail — a stale access token is an ordinary
   * reason — as long as the failure is reported rather than swallowed.
   */
  async revoke(userId: UserId, accessToken: string): Promise<AgentGrant> {
    const grant = await this.deps.privy.revokeAgent({
      accessToken,
      did: userId,
    });
    // Re-asked on the next unfreeze rather than never again.
    this.asked.delete(userId);
    this.apply(userId, grant);
    return grant;
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
    detached("wallet publish", async () => {
      const wallet = await session.walletSummary();
      this.deps.publishApp(userId, { type: "wallet.state", v: 1, wallet });
    });
  }
}
