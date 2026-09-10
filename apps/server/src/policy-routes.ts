/**
 * Changing a policy the *person* owns, which our app secret may not touch.
 *
 * Once a policy carries `owner: { user_id }`, Privy refuses every edit made
 * with the app secret alone (`401 No valid authorization keys or user signing
 * keys available`, proven 10 Sep). The only key that can authorise a change
 * lives in a signed-in browser. But the request also needs the app secret for
 * Basic auth, which must never reach a browser. So the browser signs and this
 * relays: two halves of one request, meeting on our server.
 *
 * Two steps, and the split is not ceremony. `prepare` builds the exact request
 * Privy will receive and hands it back to be signed, because the browser cannot
 * build it — the rules are generated from configuration it does not have, and a
 * payload that differs from the one sent by a single byte is refused with the
 * same 401 as no signature at all. `commit` rebuilds that request from the same
 * inputs and sends it with the signature attached.
 *
 * **Whose policy is edited is never taken from the request.** It is loaded from
 * the store against the authenticated person. A route that accepted a policy id
 * or a user id in its body would be a way to edit somebody else's rules with
 * your own signature, which is the one thing this must not be.
 */

import type { UserId } from "@froggy/domain";
import { Allowance } from "@froggy/domain";
import type { PersonPolicyRecord, PolicyPins } from "@froggy/wallet";
import { personPolicyRules } from "@froggy/wallet";
import { Result, Schema } from "effect";

import type { PersonPolicies } from "./person-policies";

const PRIVY_API = "https://api.privy.io";

/** Long enough for a person to be prompted, short enough to be worth having. */
const SIGNING_WINDOW_MS = 120_000;

/** The exact request Privy will receive, in the shape its signer expects. */
interface PatchRequest {
  readonly body: { readonly rules: readonly unknown[] };
  readonly headers: Record<string, string>;
  readonly method: "PATCH";
  readonly url: string;
  readonly version: 1;
}

/** What either route answers with: a refusal a person can read, or the result. */
type PolicyReply =
  | { readonly error: string; readonly status?: number }
  | {
      readonly expiry: number;
      readonly needsSignature: boolean;
      readonly payload: PatchRequest;
    }
  | { readonly allowance: Allowance; readonly ok: true };

const json = (body: PolicyReply, status: number): Response =>
  Response.json(body, { status });

const decodeAllowance = Schema.decodeUnknownResult(Allowance);
/** The one field of Privy's policy that says whose signature it needs. */
const decodeOwner = Schema.decodeUnknownResult(
  Schema.Struct({ owner_id: Schema.NullOr(Schema.String) })
);
const decodeCommit = Schema.decodeUnknownResult(
  Schema.Struct({
    allowance: Allowance,
    expiry: Schema.Int,
    signature: Schema.NullOr(Schema.String),
  })
);

export interface PolicyRouteDeps {
  readonly appId: string;
  readonly appSecret: string;
  readonly pins: PolicyPins | null;
  readonly policies: Pick<PersonPolicies, "adjust" | "current"> | null;
}

/**
 * The request Privy will receive, built once so both halves agree on it.
 *
 * `expiry` is chosen by the caller rather than here, so that `commit` can
 * reproduce byte-for-byte what `prepare` handed over. Deriving it from a clock
 * in both places would produce two different requests and one useless
 * signature.
 */
const patchRequest = (input: {
  readonly allowance: Allowance;
  readonly appId: string;
  readonly expiry: number;
  readonly pins: PolicyPins;
  readonly policyId: string;
}): PatchRequest => ({
  body: { rules: personPolicyRules(input.allowance, input.pins) },
  headers: {
    "privy-app-id": input.appId,
    "privy-request-expiry": String(input.expiry),
  },
  method: "PATCH" as const,
  url: `${PRIVY_API}/v1/policies/${input.policyId}`,
  version: 1 as const,
});

/** What both routes need, or the reason they cannot proceed. */
const ready = async (
  deps: PolicyRouteDeps,
  userId: UserId
): Promise<
  { readonly pins: PolicyPins; readonly record: PersonPolicyRecord } | Response
> => {
  if (deps.policies === null || deps.pins === null) {
    return json(
      { error: "This deployment does not mint policies of your own." },
      409
    );
  }
  const record = await deps.policies.current(userId);
  if (record === null) {
    return json(
      { error: "You have no policy of your own yet. Grant the agent first." },
      409
    );
  }
  return { pins: deps.pins, record };
};

/**
 * Whether this policy needs the person's key, read from Privy rather than
 * inferred from configuration.
 *
 * The flag says what we mint *now*; a policy minted before it was turned on is
 * owned by the app whatever the flag says today. Asking Privy is the only
 * answer that is true of the policy in front of us.
 */
const needsPersonSignature = async (
  deps: PolicyRouteDeps,
  policyId: string
): Promise<boolean> => {
  const response = await fetch(`${PRIVY_API}/v1/policies/${policyId}`, {
    headers: {
      authorization: `Basic ${Buffer.from(`${deps.appId}:${deps.appSecret}`).toString("base64")}`,
      "privy-app-id": deps.appId,
    },
  });
  if (!response.ok) {
    // Assume it does. Sending a signature Privy did not need is survivable;
    // omitting one it did need is a refusal the person cannot act on.
    return true;
  }
  const owner = decodeOwner(JSON.parse(await response.text()));
  return Result.isSuccess(owner) && owner.success.owner_id !== null;
};

export const handlePolicyRoutes = async (
  deps: PolicyRouteDeps,
  request: Request,
  userId: UserId,
  pathname: string
): Promise<Response | null> => {
  if (pathname === "/api/agent-policy/prepare" && request.method === "POST") {
    const state = await ready(deps, userId);
    if (state instanceof Response) {
      return state;
    }
    const body: unknown = await request.json();
    const allowance = decodeAllowance(body);
    if (Result.isFailure(allowance)) {
      return json({ error: "Those numbers are not a valid allowance." }, 400);
    }
    const expiry = Date.now() + SIGNING_WINDOW_MS;
    return json(
      {
        expiry,
        needsSignature: await needsPersonSignature(deps, state.record.policyId),
        payload: patchRequest({
          allowance: allowance.success,
          appId: deps.appId,
          expiry,
          pins: state.pins,
          policyId: state.record.policyId,
        }),
      },
      200
    );
  }

  if (pathname === "/api/agent-policy/commit" && request.method === "POST") {
    const state = await ready(deps, userId);
    if (state instanceof Response) {
      return state;
    }
    const body: unknown = await request.json();
    const decoded = decodeCommit(body);
    if (Result.isFailure(decoded)) {
      return json({ error: "That is not a signed allowance change." }, 400);
    }
    const { allowance, expiry, signature } = decoded.success;
    // Rebuilt rather than carried: the body Privy sees is generated here from
    // the person's numbers and this deployment's pins, so a caller cannot post
    // one set of rules and a signature over another.
    const outgoing = patchRequest({
      allowance,
      appId: deps.appId,
      expiry,
      pins: state.pins,
      policyId: state.record.policyId,
    });
    const headers = new Headers({
      authorization: `Basic ${Buffer.from(`${deps.appId}:${deps.appSecret}`).toString("base64")}`,
      "content-type": "application/json",
      "privy-app-id": deps.appId,
      "privy-request-expiry": String(expiry),
    });
    // Absent when the policy has no owner but ours: Privy authorises that on
    // the app secret alone, and a signature from somebody who is not the owner
    // would be a worse request rather than a better one.
    if (signature !== null) {
      headers.set("privy-authorization-signature", signature);
    }
    const response = await fetch(outgoing.url, {
      body: JSON.stringify(outgoing.body),
      headers,
      method: "PATCH",
    });
    const text = await response.text();
    if (!response.ok) {
      // Privy's own words reach the person. "It did not work" is not something
      // anybody can act on, and this is the path most likely to surprise us.
      return json(
        {
          error: `Privy would not accept the change: ${text.slice(0, 300)}`,
          status: response.status,
        },
        502
      );
    }
    // Only once Privy has taken it: the mandate must never be looser than the
    // policy, and it would be if this were written before the edit landed.
    const record = await deps.policies?.adjust(userId, allowance);
    return json({ allowance: record?.allowance ?? allowance, ok: true }, 200);
  }

  return null;
};
