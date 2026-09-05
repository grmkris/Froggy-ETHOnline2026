/**
 * Create the agent's Privy authorization key and register it as a key quorum.
 *
 * Run once per Privy app. It prints the two values to put in `.env` and on the
 * Railway service, and the private half is never written anywhere else — not
 * to a file, not to a log. Losing it costs a re-run of this script and a
 * re-grant by each user; leaking it hands someone the agent's signature, which
 * the policy still constrains but which you would want to revoke immediately.
 *
 *   PRIVY_APP_ID=... PRIVY_APP_SECRET=... bun run privy:agent-key
 */

import { Result, Schema } from "effect";

const appId = process.env["PRIVY_APP_ID"];
const appSecret = process.env["PRIVY_APP_SECRET"];
if (
  appId === undefined ||
  appSecret === undefined ||
  appId === "" ||
  appSecret === ""
) {
  throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET are required.");
}

const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"]
);
const base64 = (buffer: ArrayBuffer): string =>
  Buffer.from(buffer).toString("base64");
// SPKI for the public half and PKCS8 for the private half, base64 with no PEM
// headers — the two formats Privy's API and SDK expect respectively.
const publicKey = base64(await crypto.subtle.exportKey("spki", pair.publicKey));
const privateKey = base64(
  await crypto.subtle.exportKey("pkcs8", pair.privateKey)
);

const response = await fetch("https://api.privy.io/v1/key_quorums", {
  body: JSON.stringify({
    authorization_threshold: 1,
    display_name: "froggy-agent",
    public_keys: [publicKey],
  }),
  headers: {
    authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
    "content-type": "application/json",
    "privy-app-id": appId,
  },
  method: "POST",
});
if (!response.ok) {
  throw new Error(
    `Privy refused the key quorum (${response.status}): ${await response.text()}`
  );
}
// Parsed at the boundary rather than poked at: the response is somebody
// else's JSON, and the only thing this script needs from it is an id.
const KeyQuorum = Schema.Struct({ id: Schema.String });
const decoded = Schema.decodeUnknownResult(KeyQuorum)(await response.json());
if (Result.isFailure(decoded)) {
  throw new Error("Privy returned a key quorum with no id.");
}
const { id } = decoded.success;

process.stdout.write(
  `PRIVY_AUTHORIZATION_KEY_ID=${id}\nPRIVY_AUTHORIZATION_PRIVATE_KEY=${privateKey}\n`
);
