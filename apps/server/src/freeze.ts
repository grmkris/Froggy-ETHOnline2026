/**
 * The kill switch, as one function.
 *
 * Freezing has to do five things in a fixed order, and every surface that
 * can freeze — the wallet pane today, Telegram tomorrow — must do all five.
 * A freeze that stopped the spending but not the browser, or the browser but
 * not the parked approval, is the kind of half-freeze that reads as "the
 * button did not work".
 *
 *   1. The mandate flips, synchronously. This is the layer the policy engine
 *      reads and it must never wait on a network call.
 *   2. The run is aborted, so the next tool call never happens.
 *   3. Every parked approval is denied; a card left open would be a spend
 *      waiting for a click.
 *   4. The browser is told: the page stops loading and the agent's commands
 *      are refused, while the person keeps the wheel.
 *   5. The agent's signer is revoked at Privy, so it could not sign even if
 *      every check in our code were bypassed. Allowed to fail, as long as
 *      the pane says so.
 *   6. The pocket is zeroed. The Hedera leg is paid from a host account the
 *      person only holds a share of; after a freeze the share is nothing,
 *      and it stays nothing until a top-up.
 *
 * Unfreezing is a human action and only reverses the parts that are safe to
 * reverse: the mandate, the browser gate and the signer grant. Nothing that
 * was aborted resumes.
 */

import type { Mandate, UserId } from "@froggy/domain";
import type { AppServerMessage } from "@froggy/protocol";

import { detached } from "./detached";
import type { AgentGrants } from "./grants";
import type { InteractionRegistry } from "./interactions";
import type { ChatRunRegistry } from "./runs";
import type { Workspaces } from "./workspaces";

export interface FreezeDeps {
  readonly grants: AgentGrants;
  readonly interactions: InteractionRegistry;
  readonly publishApp: (userId: UserId, message: AppServerMessage) => void;
  readonly runs: ChatRunRegistry;
  readonly workspaces: Workspaces;
}

export interface FreezeControl {
  /** `accessToken` authorises the Privy revocation; null skips that step and says so. */
  readonly freeze: (
    userId: UserId,
    reason: string,
    accessToken: string | null
  ) => Mandate;
  readonly unfreeze: (userId: UserId, accessToken: string | null) => Mandate;
}

export const createFreeze = (deps: FreezeDeps): FreezeControl => ({
  freeze: (userId, reason, accessToken) => {
    const workspace = deps.workspaces.for(userId);
    const mandate = workspace.session.setFrozen(true);
    deps.runs.abort(workspace.session.id);
    deps.interactions.abortAll(userId, reason);
    detached("browser freeze", async () => {
      await workspace.browser.freeze(reason);
    });
    detached("pocket zero", async () => {
      await workspace.session.zeroPocket();
      const wallet = await workspace.session.walletSummary();
      deps.publishApp(userId, { type: "wallet.state", v: 1, wallet });
    });
    if (accessToken === null) {
      workspace.session.setAgentSigner(
        "granted",
        "Frozen here; the Privy signer is revoked when you next open the workspace."
      );
    } else {
      detached("agent revoke", async () => {
        await deps.grants.revoke(userId, accessToken);
      });
    }
    deps.publishApp(userId, { mandate, type: "mandate.state", v: 1 });
    return mandate;
  },
  unfreeze: (userId, accessToken) => {
    const workspace = deps.workspaces.for(userId);
    const mandate = workspace.session.setFrozen(false);
    if (accessToken !== null) {
      deps.grants.note(userId, accessToken);
    }
    detached("browser unfreeze", async () => {
      await workspace.browser.unfreeze();
    });
    deps.publishApp(userId, { mandate, type: "mandate.state", v: 1 });
    return mandate;
  },
});
