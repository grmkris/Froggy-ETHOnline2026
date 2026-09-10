/**
 * Spike 0a, server half: can a policy be owned by the person, and does that
 * ownership actually lock our server out?
 *
 * The plan (docs/plan/PLAN_USER_OWNED_POLICIES.md) turns on one asymmetry read
 * from the SDK types: `PolicyCreateParams` carries no authorization-signature
 * header, while `PolicyUpdateParams`, `PolicyDeleteParams` and the per-rule
 * params all do. If that is true of the live API and not just the types, we can
 * mint a policy the person owns using nothing but the app secret, and from that
 * moment we cannot change it — which is the whole point, and also the whole
 * risk.
 *
 * Two runs, control first, for the same reason as the aggregation probe:
 *
 *   1. Control, no owner. Create, PATCH, delete. Proves the request shapes here
 *      are right, so a refusal below is about ownership and not about a
 *      malformed body. Leaves nothing behind.
 *   2. Candidate, `owner: { user_id }`. Create, then attempt the same PATCH and
 *      the same delete. Refusals are the result we want.
 *
 * What this half cannot prove: that the person's own key can *unlock* what our
 * secret cannot. That needs `useAuthorizationSignature` in a signed-in browser
 * and is the half only Kristjan can run.
 *
 * The candidate policy is attached to no wallet, so it governs nothing whatever
 * happens here. If ownership works it also cannot be deleted by us, so it stays
 * on the app under an obvious name; that is the honest cost of asking.
 */

const PRIVY = "https://api.privy.io/v1";

const env = (name: string): string => {
  const value = Bun.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const appId = env("PRIVY_APP_ID");
const appSecret = env("PRIVY_APP_SECRET");

/**
 * A Privy user in this app. The default is the purpose-made test person from
 * spike 1.8 (docs/evidence/PRIVY.md); override to name somebody else.
 */
const subject =
  Bun.env["PRIVY_SPIKE_USER_DID"] ?? "did:privy:cmtq98t70006g0cjrgjhm3oxj";

const authorization = `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`;

interface Answer {
  readonly ok: boolean;
  readonly status: number;
  readonly text: string;
}

const call = async (
  method: "DELETE" | "GET" | "PATCH" | "POST",
  path: string,
  body?: unknown
): Promise<Answer> => {
  const init: RequestInit = {
    headers: {
      authorization,
      "content-type": "application/json",
      "privy-app-id": appId,
    },
    method,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${PRIVY}${path}`, init);
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
};

const show = (label: string, answer: Answer): void => {
  process.stdout.write(
    `  ${label}: ${answer.status} ${answer.text.slice(0, 300)}\n`
  );
};

/** One harmless rule; what it allows is irrelevant, it is never attached. */
const rules = [
  {
    action: "ALLOW",
    conditions: [
      {
        field: "chain_id",
        field_source: "ethereum_transaction",
        operator: "eq",
        value: "8453",
      },
    ],
    method: "eth_signTransaction",
    name: "spike-placeholder",
  },
];

const createPolicy = async (
  name: string,
  owner: { readonly user_id: string } | null
): Promise<Answer> =>
  await call("POST", "/policies", {
    chain_type: "ethereum",
    name,
    owner,
    rules,
    version: "1.0",
  });

const idOf = (answer: Answer): string | null => {
  try {
    const parsed: unknown = JSON.parse(answer.text);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed &&
      typeof parsed.id === "string"
    ) {
      return parsed.id;
    }
  } catch {
    return null;
  }
  return null;
};

const ownerOf = (answer: Answer): string => {
  try {
    const parsed: unknown = JSON.parse(answer.text);
    if (typeof parsed === "object" && parsed !== null && "owner_id" in parsed) {
      return JSON.stringify(parsed.owner_id);
    }
  } catch {
    return "unreadable";
  }
  return "absent";
};

/** The PATCH both halves are judged on: same body, same secret, different owner. */
const editAttempt = async (policyId: string): Promise<Answer> =>
  await call("PATCH", `/policies/${policyId}`, {
    rules: [{ ...rules[0], name: "spike-placeholder-edited" }],
  });

process.stdout.write("--- control: a policy with no owner ---\n");
const control = await createPolicy("froggy-spike-owner-control", null);
show("create", control);
const controlId = idOf(control);
if (controlId === null) {
  throw new Error("The control policy was not created; stopping before the candidate.");
}
show("owner_id", { ...control, text: ownerOf(control) });
show("patch", await editAttempt(controlId));
show("delete", await call("DELETE", `/policies/${controlId}`));

process.stdout.write(`\n--- candidate: owner { user_id: ${subject} } ---\n`);
const candidate = await createPolicy(
  `froggy-spike-owner-${subject.slice(-8)}`,
  { user_id: subject }
);
show("create", candidate);
const candidateId = idOf(candidate);
process.stdout.write("\n--- verdict ---\n");
if (candidateId === null) {
  process.stdout.write(
    "NO: Privy refused to create a policy owned by a user id, with the message above.\n" +
      "Person-owned policies are not reachable this way; fall back to owner: null.\n"
  );
} else {
  show("owner_id", { ...candidate, text: ownerOf(candidate) });
  const patched = await editAttempt(candidateId);
  show("patch", patched);
  const deleted = await call("DELETE", `/policies/${candidateId}`);
  show("delete", deleted);
  process.stdout.write(`\n  policy id: ${candidateId}\n\n`);
  if (patched.ok || deleted.ok) {
    process.stdout.write(
      "OWNERSHIP IS COSMETIC: Privy accepted the owner, then let the app secret alone\n" +
        "change or remove the policy anyway. 'The person owns it' would not be true, and\n" +
        "the claim must not be made. Treat as the fallback case.\n"
    );
  } else {
    process.stdout.write(
      "YES, server half: the policy was created owned by the person and the app secret\n" +
        "can no longer edit or delete it. Still unproven, and the half Kristjan must run:\n" +
        "that the person's own key CAN edit it, via useAuthorizationSignature in a\n" +
        "signed-in browser. Until that passes, this is a policy nobody can change.\n"
    );
  }
}
