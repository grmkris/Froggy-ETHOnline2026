/**
 * The committed policy, applied. Three verbs:
 *
 *   bun run privy:policy aggregation   create the 24-hour USDC aggregation (idempotent by name), print its id
 *   bun run privy:policy apply         PATCH the policy's rules from docs/privy-agent-policy.json
 *   bun run privy:policy show          print the live policy, so what Privy holds can be compared with the file
 *
 * REST with the app secret rather than the SDK, for the same reason as the
 * key-quorum script: this policy has no owner, so basic auth is all Privy
 * asks for, and a tool with no dependencies can be run from a fresh clone.
 * The JSON file is the source of truth; nothing here invents a rule.
 */

import { Result, Schema } from "effect";

const PRIVY = "https://api.privy.io/v1";
const POLICY_FILE = new URL("../docs/privy-agent-policy.json", import.meta.url);

const env = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const appId = env("PRIVY_APP_ID");
const appSecret = env("PRIVY_APP_SECRET");
const policyId = env("PRIVY_AGENT_POLICY_ID");

/** Only the fields the tool reads; Privy's answers carry more. */
const Named = Schema.Struct({ id: Schema.String, name: Schema.String });
const Policy = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  owner_id: Schema.NullOr(Schema.String),
  rules: Schema.Array(
    Schema.Struct({
      action: Schema.String,
      conditions: Schema.Array(Schema.Unknown),
      method: Schema.String,
      name: Schema.String,
    })
  ),
});
const PolicyFile = Schema.Struct({
  aggregation: Schema.Struct({ id: Schema.String, name: Schema.String }),
  rules: Schema.Array(Schema.Unknown),
});

interface Call {
  /** Already serialised JSON. Absent on a GET. */
  readonly body?: string;
  readonly idempotencyKey?: string;
  readonly method: "GET" | "PATCH" | "POST";
  readonly path: string;
}

/** One request, its answer parsed against `codec` before it leaves. */
const request = async <T>(call: Call, codec: Schema.Codec<T>): Promise<T> => {
  const headers = new Headers({
    authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
    "content-type": "application/json",
    "privy-app-id": appId,
  });
  if (call.idempotencyKey !== undefined) {
    headers.set("privy-idempotency-key", call.idempotencyKey);
  }
  const init: RequestInit = { headers, method: call.method };
  if (call.body !== undefined) {
    init.body = call.body;
  }
  const response = await fetch(`${PRIVY}${call.path}`, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${call.method} ${call.path} → ${response.status}: ${text}`
    );
  }
  const decoded = Schema.decodeUnknownResult(codec)(JSON.parse(text));
  if (Result.isFailure(decoded)) {
    throw new Error(
      `${call.method} ${call.path} answered in an unexpected shape.`
    );
  }
  return decoded.success;
};

const readFile = async () => {
  const decoded = Schema.decodeUnknownResult(PolicyFile)(
    await Bun.file(POLICY_FILE).json()
  );
  if (Result.isFailure(decoded)) {
    throw new Error(
      "docs/privy-agent-policy.json is not in the expected shape."
    );
  }
  return decoded.success;
};

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const TRANSFER_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const aggregation = async (): Promise<void> => {
  const file = await readFile();
  // Idempotent on the name: a second run returns the same aggregation rather
  // than a second one counting the same transfers twice.
  const created = await request(
    {
      body: JSON.stringify({
        conditions: [
          {
            field: "chain_id",
            field_source: "ethereum_transaction",
            operator: "eq",
            value: "84532",
          },
          {
            field: "to",
            field_source: "ethereum_transaction",
            operator: "eq",
            value: USDC_BASE_SEPOLIA,
          },
        ],
        method: "eth_signTransaction",
        metric: {
          abi: TRANSFER_ABI,
          field: "transfer.amount",
          field_source: "ethereum_calldata",
          function: "sum",
        },
        name: file.aggregation.name,
        window: { seconds: 86_400, type: "rolling" },
      }),
      idempotencyKey: file.aggregation.name,
      method: "POST",
      path: "/aggregations",
    },
    Named
  );
  process.stdout.write(`${created.name} ${created.id}\n`);
};

const apply = async (): Promise<void> => {
  const file = await readFile();
  if (file.aggregation.id.includes("REPLACE_ME")) {
    throw new Error(
      "The policy file still names a placeholder aggregation; run `aggregation` first and paste the id."
    );
  }
  const rules = JSON.stringify(file.rules).replaceAll(
    "aggregation.REPLACE_ME",
    `aggregation.${file.aggregation.id}`
  );
  const policy = await request(
    {
      body: `{"rules":${rules}}`,
      method: "PATCH",
      path: `/policies/${policyId}`,
    },
    Policy
  );
  for (const rule of policy.rules) {
    process.stdout.write(
      `${rule.action} ${rule.method} ${rule.name} (${rule.conditions.length} conditions)\n`
    );
  }
};

const show = async (): Promise<void> => {
  const policy = await request(
    { method: "GET", path: `/policies/${policyId}` },
    Policy
  );
  process.stdout.write(`${JSON.stringify(policy, null, 2)}\n`);
};

const verbs = { aggregation, apply, show };
const verb = process.argv[2] ?? "show";
const run = Object.entries(verbs).find(([name]) => name === verb)?.[1];
if (run === undefined) {
  throw new Error(
    `Unknown verb '${verb}'. One of: ${Object.keys(verbs).join(", ")}.`
  );
}
await run();
