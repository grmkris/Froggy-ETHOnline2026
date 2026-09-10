/**
 * Minting a person's policy at Privy.
 *
 * The rules themselves are built by `person-policy.ts`, which is pure and
 * tested without a network. This is the half that talks to Privy, kept apart
 * so that the part which is easy to get subtly wrong is also the part that is
 * cheap to prove.
 *
 * Two things are load-bearing here and neither is obvious:
 *
 *   - **The person owns the policy.** `owner: { user_id }` makes Privy resolve
 *     a key quorum whose only member is that person, after which our app secret
 *     is refused on every edit and delete — proven on 10 Sep, in
 *     `docs/evidence/PRIVY.md`. That is the point rather than a side effect:
 *     the rules holding their agent stop being ours to widen. It also means a
 *     mistake here is permanent, so the caps go in at mint time and the
 *     expiry is enforced on our side as well.
 *   - **Minting is idempotent.** A second device, a re-grant and two tabs
 *     racing the same first request must not each mint a policy. Three guards:
 *     the stored id is checked first by the caller, this call carries an
 *     idempotency key derived from the person, and the caller holds an
 *     in-flight promise per person.
 */

import type { Allowance } from "@froggy/domain";
import type { PrivyClient } from "@privy-io/node";
import { Result, Schema } from "effect";

import { personPolicyName, personPolicyRules } from "./person-policy";
import type { PolicyPins } from "./person-policy";

export interface PersonPolicyRequest {
  readonly allowance: Allowance;
  readonly did: string;
  readonly pins: PolicyPins;
}

/**
 * What came of asking. `reason` is filled on every unhappy path and reaches the
 * person's screen: "the agent cannot sign" is the most confusing state this
 * system has, and an unexplained one is worse.
 */
export interface PersonPolicyOutcome {
  readonly policyId: string | null;
  readonly reason: string | null;
}

const PRIVY_API = "https://api.privy.io";

/** The one field of Privy's answer this depends on. */
const decodeCreated = Schema.decodeUnknownResult(
  Schema.Struct({ id: Schema.String })
);

export const mintPersonPolicy = async (
  client: PrivyClient,
  input: {
    readonly appId: string;
    readonly appSecret: string;
    readonly owned: boolean;
    readonly request: PersonPolicyRequest;
  }
): Promise<PersonPolicyOutcome> => {
  const { request } = input;
  const rules = personPolicyRules(request.allowance, request.pins);
  if (rules.length === 0) {
    // A policy with no rules would be a wallet the agent cannot sign for at
    // all, which is a worse outcome than leaving them on the app-wide policy
    // and saying so.
    return {
      policyId: null,
      reason: "No rules could be built for this deployment's configuration.",
    };
  }
  try {
    const response = await fetch(`${PRIVY_API}/v1/policies`, {
      body: JSON.stringify({
        chain_type: "ethereum",
        name: personPolicyName(request.did),
        // Undefined rather than null when we keep it: Privy reads an explicit
        // null as "remove the owner", which is the same thing here but says
        // something different to anyone reading the request.
        owner: input.owned ? { user_id: request.did } : undefined,
        rules,
        version: "1.0",
      }),
      headers: {
        authorization: `Basic ${Buffer.from(`${input.appId}:${input.appSecret}`).toString("base64")}`,
        "content-type": "application/json",
        "privy-app-id": input.appId,
        // Privy holds this for 24 hours, which covers a person reloading, a
        // second device and two tabs racing each other on a cold start.
        "privy-idempotency-key": `froggy-person-policy-${request.did}`,
      },
      method: "POST",
    });
    const text = await response.text();
    if (!response.ok) {
      return { policyId: null, reason: `Privy refused the policy: ${text}` };
    }
    // Decoded at the boundary rather than narrowed: what comes back is Privy's
    // shape, not ours, and the only field we depend on is the one asserted here.
    const created = decodeCreated(JSON.parse(text));
    if (Result.isFailure(created)) {
      return { policyId: null, reason: "Privy returned no policy id." };
    }
    return { policyId: created.success.id, reason: null };
  } catch (error) {
    return {
      policyId: null,
      reason:
        error instanceof Error
          ? error.message
          : "The policy could not be created.",
    };
  }
};
