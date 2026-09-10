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

/** Whose wallet this is. Anyone but the app; see `makeWallet`. */
const subject =
  Bun.env["PRIVY_SPIKE_USER_DID"] ?? "did:privy:cmtq98t70006g0cjrgjhm3oxj";
const authorization = `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`;
const base = {
  authorization,
  "content-type": "application/json",
  "privy-app-id": appId,
};

/**
 * A real vault, because Privy resolves the vault *before* it consults the
 * policy: a fabricated id answers `404 Vault not found` under every policy and
 * tells us nothing. Which of the app's vaults this is does not matter to the
 * question — the wallets below hold no USDC, so a deposit that gets past the
 * policy engine still cannot move anything, and that refusal is the proof.
 */
const VAULT =
  Bun.env["PRIVY_SPIKE_VAULT_ID"] ?? "unzkw5f9txnd2hvmu4z3uan2";

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

/**
 * The wallet must be owned by *somebody else*, and this is the correction that
 * makes the whole spike mean anything.
 *
 * An app-created wallet with no owner is owned by the app secret — the same
 * secret this spike sends as Basic auth. Privy would then authorise the deposit
 * as the wallet's owner and never consult the additional signer's policy at
 * all, so both arms of the differential would answer identically for a reason
 * that has nothing to do with signers. Giving the wallet a user owner puts the
 * app secret outside the ownership, exactly as a real person's wallet does, and
 * leaves the agent's key as the only authority in play.
 */
const makeWallet = async (
  policyId: string
): Promise<{ readonly address: string; readonly id: string }> => {
  const created = await post("/wallets", {
    additional_signers: [
      { override_policy_ids: [policyId], signer_id: agentQuorum },
    ],
    chain_type: "ethereum",
    owner: { user_id: subject },
  });
  const id = idOf(created.text);
  if (id === null) {
    throw new Error(`wallet: ${created.status} ${created.text}`);
  }
  const parsed: { address?: string } = JSON.parse(created.text);
  return { address: parsed.address ?? "unknown", id };
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

/**
 * Reuse a wallet across runs when one is named.
 *
 * The balance check runs ahead of the policy, so the last question needs a
 * wallet with a few cents in it. Funding a wallet that a fresh run then throws
 * away would be a donation, so the ids are overridable and a funded wallet
 * survives to answer.
 */
const reuse = async (
  variable: string,
  policyId: string
): Promise<{ readonly address: string; readonly id: string }> => {
  const existing = Bun.env[variable];
  if (existing === undefined || existing === "") {
    return await makeWallet(policyId);
  }
  // The policy is attached to the signer on the wallet, so a reused wallet has
  // to be re-pointed at this run's fresh policy or it would be judged by a
  // policy this run has already deleted.
  await fetch(`${PRIVY}/wallets/${existing}`, {
    body: JSON.stringify({
      additional_signers: [
        { override_policy_ids: [policyId], signer_id: agentQuorum },
      ],
    }),
    headers: base,
    method: "PATCH",
  });
  const read = await fetch(`${PRIVY}/wallets/${existing}`, { headers: base });
  const parsed: { address?: string } = JSON.parse(await read.text());
  return { address: parsed.address ?? "unknown", id: existing };
};

const walletAllowed = await reuse("PRIVY_SPIKE_ALLOWED_WALLET", withPolicy);
const walletDenied = await reuse("PRIVY_SPIKE_DENIED_WALLET", withoutPolicy);
process.stdout.write(
  `wallet with the rule:        ${walletAllowed.id}  ${walletAllowed.address}\n` +
    `wallet without it:           ${walletDenied.id}  ${walletDenied.address}\n\n`
);

const allowed = await deposit(walletAllowed.id);
process.stdout.write(`[rule present] ${allowed.status} ${allowed.text.slice(0, 400)}\n\n`);
const denied = await deposit(walletDenied.id);
process.stdout.write(`[rule absent ] ${denied.status} ${denied.text.slice(0, 400)}\n\n`);

const isPolicyViolation = (text: string): boolean =>
  text.includes("policy_violation");

const notEnabled = (text: string): boolean =>
  text.includes("Yield features are not enabled");

/** Vault resolution happens before the policy, so this blinds the differential. */
const noVault = (text: string): boolean => text.includes("Vault not found");

process.stdout.write("--- verdict ---\n");
const noFunds = (text: string): boolean =>
  text.includes("Insufficient balance");

if (noFunds(allowed.text) && noFunds(denied.text)) {
  process.stdout.write(
    "HALF ANSWERED.\n\n" +
      "Answered: an additional signer is NOT structurally barred from Earn. Neither\n" +
      "arm was refused for want of the wallet's owner; both reached the balance check\n" +
      "carrying only the agent key's signature, on a wallet the app does not own. That\n" +
      "is what ADR 0015 left open, and wallet actions plainly differ from wallet edits.\n\n" +
      "Open: whether the POLICY gates Earn. Privy checks the balance before it consults\n" +
      "the policy, so on an empty wallet the arm with no Earn rule is refused for funds\n" +
      "rather than by default-deny, and the two arms cannot be told apart.\n\n" +
      "To settle it, put a few cents of USDC on Base into the wallet WITHOUT the rule\n" +
      "and re-run with PRIVY_SPIKE_DENIED_WALLET set to it. A policy_violation proves\n" +
      "the leash covers Earn; a successful deposit proves it does not, and the bounty\n" +
      "story has to say so.\n"
  );
} else if (noVault(allowed.text) || noVault(denied.text)) {
  process.stdout.write(
    "BLOCKED, not answered: Privy resolved the vault before it consulted any policy\n" +
      "and could not find it, so both arms answered the same thing for a reason that\n" +
      "has nothing to do with signers. Point PRIVY_SPIKE_VAULT_ID at a real vault.\n"
  );
} else if (notEnabled(allowed.text) || notEnabled(denied.text)) {
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
