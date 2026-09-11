/**
 * Changing a policy the person owns, from the browser.
 *
 * Three parties and none of them holds everything: Privy will only accept the
 * change signed by the person's key, that key exists only in this tab, and the
 * request also needs an app secret that must never come here. So the server
 * prepares the exact request, this signs it, and the server sends it.
 *
 * The payload is signed exactly as it comes back from `prepare`, untouched. A
 * request that differs from the signed one by a single byte is refused with the
 * same error as no signature at all, so anything "helpful" done to it in
 * between would look like a permissions problem and be debugged as one.
 */

import { Allowance } from "@froggy/domain";
import { Result, Schema } from "effect";

/** What the person is told. Never a raw error, always a next step. */
export type PolicyChange =
  | { readonly kind: "changed"; readonly allowance: Allowance }
  | { readonly kind: "refused"; readonly reason: string };

/** The signer attached, or not; and if the person chose numbers, saved or not. */
export type SignerGrant =
  | { readonly kind: "granted" }
  | { readonly kind: "granted-unsaved"; readonly reason: string }
  | { readonly kind: "refused"; readonly reason: string };

/** What the person is told about a grant, wherever it was asked for. */
export const signerGrantWords = (grant: SignerGrant): string => {
  if (grant.kind === "refused") {
    return `Privy refused: ${grant.reason}`;
  }
  if (grant.kind === "granted-unsaved") {
    return `Granted, but your numbers were not saved: ${grant.reason}`;
  }
  return "Granted. The wallet updates in a moment.";
};

/**
 * What `prepare` answers. Decoded rather than asserted: it crosses a network
 * boundary, and the repository's rule is that such a thing is parsed where it
 * arrives, even when the other end is ours.
 */
const Prepared = Schema.Struct({
  error: Schema.optional(Schema.String),
  expiry: Schema.optional(Schema.Int),
  needsSignature: Schema.optional(Schema.Boolean),
  payload: Schema.optional(
    Schema.Struct({
      body: Schema.Unknown,
      headers: Schema.Struct({
        "privy-app-id": Schema.String,
        "privy-request-expiry": Schema.String,
      }),
      method: Schema.String,
      url: Schema.String,
      version: Schema.Number,
    })
  ),
});
const decodePrepared = Schema.decodeUnknownResult(Prepared);

const Committed = Schema.Struct({
  allowance: Schema.optional(Allowance),
  error: Schema.optional(Schema.String),
  ok: Schema.optional(Schema.Boolean),
});
const decodeCommitted = Schema.decodeUnknownResult(Committed);

/** What this side ever sends: the person's numbers, or a signed change. */
type PolicyRequestBody =
  | Allowance
  | {
      readonly allowance: Allowance;
      readonly expiry: number;
      /** Null where our app secret still owns the policy and Privy needs none. */
      readonly signature: string | null;
    };

const post = async (
  path: string,
  token: string | null,
  body: PolicyRequestBody
): Promise<Response> => {
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== null) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return await fetch(path, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
};

export const changeAllowance = async (input: {
  readonly allowance: Allowance;
  readonly sign:
    | ((request: {
        readonly body: unknown;
        readonly headers: Record<string, string>;
        readonly method: string;
        readonly url: string;
        readonly version: number;
      }) => Promise<string | null>)
    | null;
  readonly token: string | null;
}): Promise<PolicyChange> => {
  const prepared = await post(
    "/api/agent-policy/prepare",
    input.token,
    input.allowance
  ).catch(() => null);
  if (prepared === null) {
    return { kind: "refused", reason: "Froggy could not be reached." };
  }
  const decoded = decodePrepared(await prepared.json());
  if (Result.isFailure(decoded)) {
    return { kind: "refused", reason: "Froggy answered unexpectedly." };
  }
  const plan = decoded.success;
  if (plan.payload === undefined || plan.expiry === undefined) {
    return {
      kind: "refused",
      reason: plan.error ?? "These rules could not be prepared.",
    };
  }
  // Only when the policy is the person's. Where our app secret still owns it,
  // Privy authorises on that alone and asking them to sign would be theatre.
  if (plan.needsSignature !== false && input.sign === null) {
    return {
      kind: "refused",
      reason: "Sign in again before changing these rules.",
    };
  }
  const signature =
    plan.needsSignature === false || input.sign === null
      ? null
      : await input.sign(plan.payload);
  if (plan.needsSignature !== false && signature === null) {
    return {
      kind: "refused",
      // The likeliest cause by far, and the one worth naming: Privy asks the
      // person to approve this, and a dismissed prompt looks like a failure.
      reason:
        "Privy did not sign the change. If it asked you to approve it, try again and accept.",
    };
  }
  const committed = await post("/api/agent-policy/commit", input.token, {
    allowance: input.allowance,
    expiry: plan.expiry,
    signature,
  }).catch(() => null);
  if (committed === null) {
    return { kind: "refused", reason: "Froggy could not be reached." };
  }
  const settled = decodeCommitted(await committed.json());
  if (Result.isFailure(settled)) {
    return { kind: "refused", reason: "Froggy answered unexpectedly." };
  }
  const result = settled.success;
  if (result.ok !== true || result.allowance === undefined) {
    return {
      kind: "refused",
      reason: result.error ?? "Privy would not accept the change.",
    };
  }
  return { allowance: result.allowance, kind: "changed" };
};

/**
 * Let the agent sign: Privy asks the person in its own prompt, the server is
 * told to read the answer off the wallet, and only then are any numbers the
 * person chose saved — until the signer exists there is nothing for them to
 * hold. The policy was minted with the defaults, so a chosen allowance is a
 * change to it like any other and goes the same way as one from Settings.
 *
 * Asked for from the Settings card and from the welcome flow, which is why
 * it lives here rather than in either: one grant, two places to press it.
 */
export const attachAgentSigner = async (input: {
  readonly address: string;
  readonly chosen: Allowance | null;
  readonly getToken: () => Promise<string | null>;
  readonly grant: (request: {
    readonly address: string;
    readonly policyId: string;
    readonly signerId: string;
  }) => Promise<
    | { readonly kind: "granted" }
    | { readonly kind: "refused"; readonly reason: string }
  >;
  readonly policyId: string;
  readonly sign: Parameters<typeof changeAllowance>[0]["sign"];
  readonly signerId: string;
}): Promise<SignerGrant> => {
  const result = await input.grant({
    address: input.address,
    policyId: input.policyId,
    signerId: input.signerId,
  });
  if (result.kind === "refused") {
    return { kind: "refused", reason: result.reason };
  }
  const token = await input.getToken();
  await fetch("/api/agent-signer/refresh", {
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    method: "POST",
  }).catch(() => null);
  if (input.chosen === null) {
    return { kind: "granted" };
  }
  const changed = await changeAllowance({
    allowance: input.chosen,
    sign: input.sign,
    token,
  });
  return changed.kind === "refused"
    ? { kind: "granted-unsaved", reason: changed.reason }
    : { kind: "granted" };
};
