/**
 * Spike 0b: may an *additional signer* call an Earn action at all?
 *
 * `docs/evidence/PRIVY.md` (9 Sep) left this open, and it changes the Privy
 * bounty story either way: ADR 0015 showed a wallet *edit* needs the wallet's
 * owner, so whether a wallet *action* of the Earn kind accepts a signer is a
 * separate question that only a rule plus one attempt can settle.
 *
 * The obvious way to ask needs a funded wallet and a vault id from the
 * dashboard, neither of which a session can produce. But the question is about
 * authorisation, not about a deposit succeeding, and those fail at different
 * stages — so a *differential* asks it for nothing:
 *
 *   with the rule:    if Privy gets past its policy engine, whatever it says
 *                     next (unknown vault, no funds) proves the signer was
 *                     permitted to make the call.
 *   without the rule: the same call must come back `policy_violation`, which
 *                     proves the policy engine is what is judging Earn, and
 *                     that the first answer was not an accident of ordering.
 *
 * Two wallets, two policies, one call each, no money and no dashboard. Both
 * wallets are app-owned throwaways holding nothing, and the deposit cannot
 * succeed under either policy, so nothing can move.
 *
 * A third reading is possible and must be reported honestly if it happens: an
 * answer that names the *owner* rather than the policy means the signer may not
 * call Earn regardless of any rule, and stage 2 of the Privy flow PRD needs the
 * person's browser for every sweep.
 */

/**
 * The SDK is declared in `packages/wallet`, and Bun resolves modules from the
 * importing file rather than the working directory, so a spike living in
 * `tools/` has to say where to look. Resolved at runtime rather than by a
 * relative path into `node_modules/.bun`, whose hashed directory name changes
 * on every reinstall.
 */
const sdkPath = Bun.resolveSync(
  "@privy-io/node",
  `${import.meta.dir}/../../packages/wallet`
);
const { generateAuthorizationSignatures, PrivyClient } = await import(sdkPath);

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
const agentPrivateKey = env("PRIVY_AUTHORIZATION_PRIVATE_KEY");
const agentQuorum = env("PRIVY_AUTHORIZATION_KEY_ID");

const client = new PrivyClient({ appId, appSecret });
const authorization = `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`;
const base = {
  authorization,
  "content-type": "application/json",
  "privy-app-id": appId,
};

/**
 * A vault id that cannot exist. Deliberate: if the policy engine lets the call
 * through, Privy's own complaint about the vault is the proof, and there is no
 * vault it could accidentally deposit into.
 */
const VAULT = "froggy-spike-vault-that-cannot-exist";

const post = async (path: string, body: unknown, extra: Record<string, string> = {}) => {
  const response = await fetch(`${PRIVY}${path}`, {
    body: JSON.stringify(body),
    headers: { ...base, ...extra },
    method: "POST",
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
};

const idOf = (text: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed &&
      typeof parsed.id === "string"
      ? parsed.id
      : null;
  } catch {
    return null;
  }
};

/** A rule that pins the vault and caps the amount, in Privy's own vocabulary. */
const earnRule = {
  action: "ALLOW",
  conditions: [
    {
      field: "vault_id",
      field_source: "action_request_body",
      operator: "eq",
      value: VAULT,
    },
    {
      field: "raw_amount",
      field_source: "action_request_body",
      operator: "lte",
      value: "1000000",
    },
  ],
  method: "earn_deposit",
  name: "spike-earn-deposit-pinned",
};

/** Something harmless for the control, so the policy is valid but names no Earn. */
const unrelatedRule = {
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
  name: "spike-unrelated",
};

const makePolicy = async (name: string, rule: unknown): Promise<string> => {
  const created = await post("/policies", {
    chain_type: "ethereum",
    name,
    rules: [rule],
    version: "1.0",
  });
  const id = idOf(created.text);
  if (id === null) {
    throw new Error(`policy ${name}: ${created.status} ${created.text}`);
  }
  return id;
};

const makeWallet = async (policyId: string): Promise<string> => {
  const created = await post("/wallets", {
    additional_signers: [
      { override_policy_ids: [policyId], signer_id: agentQuorum },
    ],
    chain_type: "ethereum",
  });
  const id = idOf(created.text);
  if (id === null) {
    throw new Error(`wallet: ${created.status} ${created.text}`);
  }
  return id;
};

/** The deposit, authorised by the agent's key alone — never the app's owner authority. */
const deposit = async (walletId: string) => {
  const url = `${PRIVY}/wallets/${walletId}/earn/ethereum/deposit`;
  const expiry = Date.now() + 60_000;
  const body = {
    nonce: `froggy-spike-${crypto.randomUUID()}`,
    raw_amount: "1",
    vault_id: VAULT,
  };
  const signatures = await generateAuthorizationSignatures(client, {
    authorizationContext: { authorization_private_keys: [agentPrivateKey] },
    input: {
      body,
      headers: {
        "privy-app-id": appId,
        "privy-request-expiry": String(expiry),
      },
      method: "POST",
      url,
      version: 1,
    },
  });
  return await post(`/wallets/${walletId}/earn/ethereum/deposit`, body, {
    "privy-authorization-signature": signatures.join(","),
    "privy-request-expiry": String(expiry),
  });
};

const withPolicy = await makePolicy("froggy-spike-earn-allowed", earnRule);
const withoutPolicy = await makePolicy("froggy-spike-earn-absent", unrelatedRule);
process.stdout.write(`policy with an earn rule:    ${withPolicy}\n`);
process.stdout.write(`policy without an earn rule: ${withoutPolicy}\n`);

const walletAllowed = await makeWallet(withPolicy);
const walletDenied = await makeWallet(withoutPolicy);
process.stdout.write(`wallet under each:           ${walletAllowed} / ${walletDenied}\n\n`);

const allowed = await deposit(walletAllowed);
process.stdout.write(`[rule present] ${allowed.status} ${allowed.text.slice(0, 400)}\n\n`);
const denied = await deposit(walletDenied);
process.stdout.write(`[rule absent ] ${denied.status} ${denied.text.slice(0, 400)}\n\n`);

const isPolicyViolation = (text: string): boolean =>
  text.includes("policy_violation");

const notEnabled = (text: string): boolean =>
  text.includes("Yield features are not enabled");

process.stdout.write("--- verdict ---\n");
if (notEnabled(allowed.text) || notEnabled(denied.text)) {
  process.stdout.write(
    "BLOCKED, not answered: Privy refused both calls with 403 'Yield features are not\n" +
      "enabled for this app', which fires before the policy engine and before any owner\n" +
      "check. Nothing here says anything yet about whether a signer may call Earn.\n\n" +
      "Unblocking it is one dashboard toggle for the app owner — Yield/Earn on this\n" +
      "Privy app. No funds and no vault id are needed: re-run this spike straight after\n" +
      "and the differential answers itself.\n"
  );
} else if (isPolicyViolation(denied.text) && !isPolicyViolation(allowed.text)) {
  process.stdout.write(
    "YES: an additional signer may call Earn. The control was refused by the policy\n" +
      "engine and the same call under a pinned rule got past it, so Earn actions are\n" +
      "judged by the signer's policy exactly like a signing method. Stage 2 of the\n" +
      "Privy flow PRD can be signed by the agent, with the vault and the amount pinned.\n"
  );
} else if (isPolicyViolation(allowed.text) && isPolicyViolation(denied.text)) {
  process.stdout.write(
    "INCONCLUSIVE: both were refused by policy. The rule is not matching the request,\n" +
      "so this says nothing yet about whether a signer may call Earn. Compare the rule's\n" +
      "conditions against the body actually sent before concluding anything.\n"
  );
} else {
  process.stdout.write(
    "READ CAREFULLY: the answers do not fit the differential. If either names the\n" +
      "wallet's owner rather than a policy, the answer is NO — an additional signer may\n" +
      "not call Earn, and every sweep needs the person's browser.\n"
  );
}

// Wallets cannot be deleted; the policies can, and are, because they are ours.
for (const id of [withPolicy, withoutPolicy]) {
  await fetch(`${PRIVY}/policies/${id}`, { headers: base, method: "DELETE" });
}
process.stdout.write("\nBoth spike policies deleted. The two empty wallets remain; they hold nothing.\n");
