/**
 * Spike 0a, browser half: the relay.
 *
 * The server half (`privy-person-owned-policy.ts`) proved that a policy created
 * with `owner: { user_id }` is real — Privy resolves it to a key quorum whose
 * only member is that user, and our app secret is then refused with
 * `401 No valid authorization keys or user signing keys available`. The open
 * question is whether the person's own key can do what our secret cannot.
 *
 * That has to be answered from a signed-in browser, because only there does the
 * user's signing key exist. But the PATCH itself still needs the app secret for
 * Basic auth, which must never reach a browser. So the browser signs and this
 * relay sends, and the two halves meet over loopback.
 *
 * Run it beside the dev web app, sign in, and paste the one line it prints into
 * the browser console. It answers PASS or FAIL on its own.
 *
 * Loopback only, no authentication, and it holds the app secret: this is a
 * spike harness for one person on one machine, and it is deleted with the
 * branch. It must never be imported by anything the product ships.
 */

const PRIVY = "https://api.privy.io/v1";
const PORT = 8899;

const env = (name: string): string => {
  const value = Bun.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const appId = env("PRIVY_APP_ID");
const appSecret = env("PRIVY_APP_SECRET");
const authorization = `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`;

const CORS = {
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
};

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    headers: { ...CORS, "content-type": "application/json" },
    status,
  });

/** The rule the person's key will be asked to change. Harmless; attached to nothing. */
const rule = (name: string) => ({
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
  name,
});

interface MintBody {
  readonly did?: unknown;
}
interface PatchBody {
  readonly expiry?: unknown;
  readonly policyId?: unknown;
  readonly signature?: unknown;
}

const mint = async (body: MintBody): Promise<Response> => {
  const did = body.did;
  if (typeof did !== "string" || !did.startsWith("did:privy:")) {
    return json({ error: "a Privy DID is required" }, 400);
  }
  const response = await fetch(`${PRIVY}/policies`, {
    body: JSON.stringify({
      chain_type: "ethereum",
      name: `froggy-spike-owned-${did.slice(-8)}`,
      owner: { user_id: did },
      rules: [rule("spike-placeholder")],
      version: "1.0",
    }),
    headers: {
      authorization,
      "content-type": "application/json",
      "privy-app-id": appId,
    },
    method: "POST",
  });
  const text = await response.text();
  if (!response.ok) {
    return json({ error: text, stage: "mint" }, 502);
  }
  const created: unknown = JSON.parse(text);
  const policyId =
    typeof created === "object" &&
    created !== null &&
    "id" in created &&
    typeof created.id === "string"
      ? created.id
      : null;
  if (policyId === null) {
    return json({ error: "Privy returned no policy id", stage: "mint" }, 502);
  }
  // The browser must sign exactly what the relay will send, so the expiry is
  // chosen here and travels with the payload rather than being picked twice.
  const expiry = Date.now() + 60_000;
  return json({
    payload: {
      body: { rules: [rule("spike-placeholder-edited-by-the-person")] },
      headers: { "privy-app-id": appId, "privy-request-expiry": String(expiry) },
      method: "PATCH",
      url: `${PRIVY}/policies/${policyId}`,
      version: 1,
    },
    policyId,
    expiry,
  });
};

const patch = async (body: PatchBody): Promise<Response> => {
  const { expiry, policyId, signature } = body;
  if (
    typeof policyId !== "string" ||
    typeof signature !== "string" ||
    typeof expiry !== "number"
  ) {
    return json({ error: "policyId, signature and expiry are required" }, 400);
  }
  const response = await fetch(`${PRIVY}/policies/${policyId}`, {
    body: JSON.stringify({
      rules: [rule("spike-placeholder-edited-by-the-person")],
    }),
    headers: {
      authorization,
      "content-type": "application/json",
      "privy-app-id": appId,
      "privy-authorization-signature": signature,
      "privy-request-expiry": String(expiry),
    },
    method: "PATCH",
  });
  const text = await response.text();
  return json({ ok: response.ok, status: response.status, text });
};

Bun.serve({
  fetch: async (request) => {
    const { pathname } = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS, status: 204 });
    }
    if (request.method !== "POST") {
      return json({ error: "POST only" }, 405);
    }
    const body: unknown = await request.json();
    if (pathname === "/mint") {
      return await mint(body as MintBody);
    }
    if (pathname === "/patch") {
      return await patch(body as PatchBody);
    }
    return json({ error: "no such path" }, 404);
  },
  hostname: "127.0.0.1",
  port: PORT,
});

process.stdout.write(`
Relay up on http://127.0.0.1:${PORT}

  1. In another terminal:  bun run dev:web
  2. Open the dev app and sign in with Privy as yourself.
  3. Paste this one line into the browser console and press enter:

await window.froggySpikePolicyOwner()

It prints PASS or FAIL and leaves the verdict in the console. Nothing it creates
is attached to any wallet, so no signing authority changes either way.
`);
