/**
 * Turn the spike wallet's ETH into USDC, so the last Earn question can be asked.
 *
 * Kristjan funded `0xC87084BcB797Bb97BE22D71aA14a21E4A5fd498A` with ETH rather
 * than USDC and asked for the swap to happen here. Privy's own swap is the
 * shortest path: asset swaps are enabled on the app, and the wallet already
 * carries the agent's key as an additional signer.
 *
 * Two things about that wallet decide how this is authorised. It is owned by
 * the *test person*, not by the app, so the app secret alone cannot act on it —
 * this is the same finding spike 0a recorded, arriving from the other side. And
 * its additional signer carries no policy override and the wallet carries no
 * policy, so the agent's key is unrestricted here. That is acceptable for a
 * throwaway holding a dollar and would not be acceptable for anything else.
 *
 * Deliberately not the whole balance: the wallet needs gas afterwards, for the
 * Earn deposit that is the entire point of funding it. A swap that left nothing
 * to pay gas with would have converted the money and stranded it.
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

const sdkPath = Bun.resolveSync(
  "@privy-io/node",
  `${import.meta.dir}/../../packages/wallet`
);
const { generateAuthorizationSignatures, PrivyClient } = await import(sdkPath);
const client = new PrivyClient({ appId, appSecret });

const WALLET = Bun.env["PRIVY_SPIKE_DENIED_WALLET"] ?? "lgptzgy5f25afb92mskj8d9e";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const BASE = "eip155:8453";

/** Of 0.0004 ETH: enough to be worth depositing, leaving the rest for gas. */
const INPUT_WEI = Bun.env["SPIKE_SWAP_WEI"] ?? "250000000000000";

const base = {
  authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
  "content-type": "application/json",
  "privy-app-id": appId,
};

const balance = async (asset: string): Promise<string> => {
  const response = await fetch(
    `${PRIVY}/wallets/${WALLET}/balance?chain=base&asset=${asset}`,
    { headers: base }
  );
  return await response.text();
};

process.stdout.write(`before eth:  ${await balance("eth")}\n`);
process.stdout.write(`before usdc: ${await balance("usdc")}\n\n`);

const body = {
  amount_type: "exact_input",
  base_amount: INPUT_WEI,
  destination: { asset_address: USDC, caip2: BASE },
  source: { asset_address: "native", caip2: BASE },
};

const url = `${PRIVY}/wallets/${WALLET}/swap`;
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
process.stdout.write(`swap -> ${response.status} ${(await response.text()).slice(0, 600)}\n\n`);

// Settlement is not instant; the balances below may still show the old numbers.
await Bun.sleep(15_000);
process.stdout.write(`after eth:   ${await balance("eth")}\n`);
process.stdout.write(`after usdc:  ${await balance("usdc")}\n`);
