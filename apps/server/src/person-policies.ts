/**
 * Each person's own Privy policy: minted once, remembered, and handed to the
 * grant so the signer is attached under their rules rather than everybody's.
 *
 * The shape mirrors `hedera-accounts.ts`, which solves the same problem for a
 * person's Hedera account: something is created for them at Privy on their
 * first authenticated request, it must be created exactly once however many
 * tabs and devices arrive at the same moment, and the id must outlive the
 * process. Three guards, deliberately overlapping because each covers a case
 * the others do not:
 *
 *   1. The stored id, which covers a returning person and a second device.
 *   2. An in-flight promise per person, which covers two tabs racing a cold
 *      start inside one process, where nothing is stored yet.
 *   3. Privy's own idempotency key, which covers two *processes* racing — the
 *      case neither of the above can see.
 *
 * What this does not do is change anything. Minting a policy attaches it to
 * nothing: the signer only comes under it when the person grants, in the
 * browser, where Privy asks them. Until then the policy is a document.
 */

import { defaultAllowance } from "@froggy/domain";
import type { Allowance, UserId } from "@froggy/domain";
import type {
  PersonPolicyRecord,
  PolicyPins,
  PrivyServer,
  Store,
} from "@froggy/wallet";

export interface PersonPolicyDeps {
  /** The clock, injected so a test can move it. */
  readonly now?: () => number;
  /** Where the rules point. Configuration, never guessed here. */
  readonly pins: PolicyPins;
  readonly privy: Pick<PrivyServer, "mintPolicy">;
  readonly store: Pick<Store, "privyPolicy">;
}

export class PersonPolicies {
  private readonly deps: PersonPolicyDeps;
  /** In flight per person, so two tabs on a cold start mint one policy. */
  private readonly minting = new Map<
    UserId,
    Promise<PersonPolicyRecord | null>
  >();

  constructor(deps: PersonPolicyDeps) {
    this.deps = deps;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** What this person's agent is held to, or null if they have no policy yet. */
  async current(userId: UserId): Promise<PersonPolicyRecord | null> {
    return await this.deps.store.privyPolicy.load(userId);
  }

  /**
   * The person's policy, minting one if they have none.
   *
   * Returns null when Privy refused, rather than throwing: a person without
   * their own policy still has a wallet, still has balances, and still has the
   * app-wide policy behind their agent. It is a degraded state to report, not
   * a failed request.
   */
  async ensure(
    userId: UserId,
    allowance?: Allowance
  ): Promise<PersonPolicyRecord | null> {
    const stored = await this.deps.store.privyPolicy.load(userId);
    if (stored !== null) {
      return stored;
    }
    const inFlight = this.minting.get(userId);
    if (inFlight !== undefined) {
      return await inFlight;
    }
    const attempt = this.mint(
      userId,
      allowance ?? defaultAllowance(this.now())
    );
    this.minting.set(userId, attempt);
    try {
      return await attempt;
    } finally {
      // Cleared whatever happened, so a refusal is retried on the next request
      // rather than remembered for the life of the process.
      this.minting.delete(userId);
    }
  }

  private async mint(
    userId: UserId,
    allowance: Allowance
  ): Promise<PersonPolicyRecord | null> {
    const outcome = await this.deps.privy.mintPolicy({
      allowance,
      did: userId,
      pins: this.deps.pins,
    });
    if (outcome.policyId === null) {
      console.warn(
        `no policy for ${userId}:`,
        outcome.reason ?? "no reason given"
      );
      return null;
    }
    const record: PersonPolicyRecord = {
      allowance,
      policyId: outcome.policyId,
    };
    await this.deps.store.privyPolicy.save(userId, record);
    return record;
  }
}

/**
 * Which of the three states a wallet's signer is in.
 *
 * `shared` is the one worth naming: the agent can sign either way, so calling
 * it `granted` would be true and would hide the only thing the person can act
 * on — that the rules holding their agent are not theirs yet.
 *
 * It is only a meaningful state where per-person policies exist. On a
 * deployment that mints none there is nothing to migrate to, the app-wide
 * policy is simply *the* policy, and reporting `shared` would put a call to
 * action on every screen that nobody could answer. Hence `perPerson`: without
 * it this collapses to the two states it has always had.
 */
export const signerStanding = (input: {
  readonly attached: boolean;
  readonly ownPolicyId: string | null;
  readonly perPerson: boolean;
  readonly policyIds: readonly string[];
}): "absent" | "granted" | "shared" => {
  if (!input.attached) {
    return "absent";
  }
  if (!input.perPerson) {
    return "granted";
  }
  return input.ownPolicyId !== null &&
    input.policyIds.includes(input.ownPolicyId)
    ? "granted"
    : "shared";
};
