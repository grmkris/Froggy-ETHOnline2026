/**
 * The last Earn question, on a funded wallet.
 *
 * Everything before this failed short of the answer: the app gate (403), a
 * fabricated vault (404), then an empty wallet (insufficient balance). The
 * ordering learned along the way is vault -> balance -> whatever comes next,
 * and "whatever comes next" is the question: does the *policy* judge an Earn
 * action, or is Earn outside the leash?
 *
 * The decisive arm is a funded wallet whose signer is held to a policy naming
 * no Earn method at all. Privy's policies are default-deny, so:
 *
 *   policy_violation -> the leash covers Earn. The submission can say so.
 *   a successful deposit -> it does not, and the submission must say *that*.
 *
 * The funded wallet cannot be reused directly: it is owned by the test person,
 * so attaching a policy to it is a wallet edit the app secret is refused for
 * (401, the same wall ADR 0015 hit). A policy can only be attached at creation,
 * so this mints a second wallet with one and moves the money across.
 *
 * Gas is the wallet's own now that sponsorship is off, so the ETH goes too.
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
const agentPrivateKey = env("PRIVY_AUTHORIZATION_PRIVATE_KEY");
const agentQuorum = env("PRIVY_AUTHORIZATION_KEY_ID");

const sdkPath = Bun.resolveSync(
  "@privy-io/node",
  `${import.meta.dir}/../../packages/wallet`
);
const { generateAuthorizationSignatures, PrivyClient } = await import(sdkPath);
const client = new PrivyClient({ appId, appSecret });

const FUNDED = Bun.env["PRIVY_SPIKE_FUNDED_WALLET"] ?? "lgptzgy5f25afb92mskj8d9e";
const SUBJECT = "did:privy:cmtq98t70006g0cjrgjhm3oxj";
const VAULT = "unzkw5f9txnd2hvmu4z3uan2";

const base = {
  authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
  "content-type": "application/json",
  "privy-app-id": appId,
};

interface Answer {
  readonly ok: boolean;
  readonly status: number;
  readonly text: string;
}

/** A call the agent's key authorises, which is the only authority in play here. */
const signed = async (path: string, body: unknown): Promise<Answer> => {
  const url = `${PRIVY}${path}`;
  const expiry = Date.now() + 60_000;
  const signatures = await generateAuthorizationSignatures(client, {
    authorizationContext: { authorization_private_keys: [agentPrivateKey] },
    input: {
      body,
      headers: { "privy-app-id": appId, "privy-request-expiry": String(expiry) },
      method: "POST",
      url,
      version: 1,
    },
  });
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      ...base,
      "privy-authorization-signature": signatures.join(","),
      "privy-request-expiry": String(expiry),
    },
    method: "POST",
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
};

const plain = async (path: string, body: unknown): Promise<Answer> => {
  const response = await fetch(`${PRIVY}${path}`, {
    body: JSON.stringify(body),
    headers: base,
    method: "POST",
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
};

const idOf = (text: string): string => {
  const parsed: { id?: string } = JSON.parse(text);
  if (parsed.id === undefined) {
    throw new Error(`no id in ${text.slice(0, 200)}`);
  }
  return parsed.id;
};

const balance = async (wallet: string, asset: string): Promise<string> => {
  const response = await fetch(
    `${PRIVY}/wallets/${wallet}/balance?chain=base&asset=${asset}`,
    { headers: base }
  );
  const parsed: { balances?: { raw_value?: string }[] } = JSON.parse(
    await response.text()
  );
  return parsed.balances?.[0]?.raw_value ?? "?";
};

/** A valid policy that names no Earn method. Default-deny does the rest. */
const noEarn = await plain("/policies", {
  chain_type: "ethereum",
  name: "froggy-spike-verdict-no-earn",
  rules: [
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
      name: "unrelated",
    },
  ],
  version: "1.0",
});
const policyId = idOf(noEarn.text);

const created = await plain("/wallets", {
  additional_signers: [
    { override_policy_ids: [policyId], signer_id: agentQuorum },
  ],
  chain_type: "ethereum",
  owner: { user_id: SUBJECT },
});
const target = idOf(created.text);
const targetAddress: string = JSON.parse(created.text).address;

process.stdout.write(`policy without Earn: ${policyId}\n`);
process.stdout.write(`wallet under it:     ${target}  ${targetAddress}\n\n`);
process.stdout.write(
  `funded wallet before: usdc=${await balance(FUNDED, "usdc")} eth=${await balance(FUNDED, "eth")}\n`
);

// USDC first, then most of the ETH: without sponsorship the target pays its own
// gas, and a wallet holding the money but not the gas is stuck the same way.
const moveUsdc = await signed(`/wallets/${FUNDED}/transfer`, {
  amount: "0.5",
  destination: { address: targetAddress, chain: "base" },
  source: { asset: "usdc", chain: "base" },
});
process.stdout.write(`\nmove usdc -> ${moveUsdc.status} ${moveUsdc.text.slice(0, 260)}\n`);

const moveEth = await signed(`/wallets/${FUNDED}/transfer`, {
  amount: "0.00008",
  destination: { address: targetAddress, chain: "base" },
  source: { asset: "eth", chain: "base" },
});
process.stdout.write(`move eth  -> ${moveEth.status} ${moveEth.text.slice(0, 260)}\n`);

process.stdout.write("\nwaiting for both to settle…\n");
for (let attempt = 0; attempt < 20; attempt += 1) {
  const usdc = await balance(target, "usdc");
  const eth = await balance(target, "eth");
  if (usdc !== "0" && usdc !== "?" && eth !== "0" && eth !== "?") {
    process.stdout.write(`target funded: usdc=${usdc} eth=${eth}\n\n`);
    break;
  }
  await Bun.sleep(10_000);
}

const deposit = await signed(`/wallets/${target}/earn/ethereum/deposit`, {
  nonce: `froggy-verdict-${crypto.randomUUID()}`,
  raw_amount: "1",
  vault_id: VAULT,
});
process.stdout.write(`deposit under a policy with no Earn rule -> ${deposit.status}\n${deposit.text.slice(0, 500)}\n`);

process.stdout.write("\n--- verdict ---\n");
if (deposit.text.includes("policy_violation")) {
  process.stdout.write(
    "GATED: Privy judged the Earn action against the signer's policy and refused it,\n" +
      "on a wallet holding the money and the gas to do it. The leash covers Earn, and\n" +
      "a rule pinning the vault and capping the amount is what lets a sweep through.\n"
  );
} else if (deposit.ok) {
  process.stdout.write(
    "NOT GATED: the deposit succeeded under a policy naming no Earn method at all.\n" +
      "Privy holds the key and does not judge this action, so the caps on Earn are\n" +
      "ours alone and the submission must say so rather than implying otherwise.\n"
  );
} else {
  process.stdout.write(
    "STILL NOT ANSWERED: it failed for a third reason, above. Read it before\n" +
      "recording anything — gas, funds and vault all fail before the policy does.\n"
  );
}
process.stdout.write(`\ntarget wallet ${target} (${targetAddress}) holds the remainder.\n`);
