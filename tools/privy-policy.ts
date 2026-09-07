/**
 * The committed policy, applied. Four verbs:
 *
 *   bun run privy:policy aggregation   create the 24-hour USDC aggregation (idempotent by name), print its id
 *   bun run privy:policy apply         PATCH the policy's rules from docs/privy-agent-policy.json
 *   bun run privy:policy merge <file>  add the rules in <file> (a JSON array) that the live policy lacks, by name
 *   bun run privy:policy show          print the live policy, so what Privy holds can be compared with the file
 *
 * `apply` replaces the rules wholesale and is for the agent policy the file
 * describes in full. `merge` is for the treasury policy, whose rules were
 * written by hand over time: it keeps every rule Privy already holds and
 * appends only the named ones that are missing, so running it twice is the
 * same as running it once. PRIVY_POLICY_ID names the target; without it the
 * agent policy from PRIVY_AGENT_POLICY_ID is the target, as before.
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
const override = process.env["PRIVY_POLICY_ID"];
const policyId =
  override === undefined || override === ""
    ? env("PRIVY_AGENT_POLICY_ID")
    : override;

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
  /** One rolling 24-hour USDC sum per Base; a rule references its id by `token`. */
  aggregations: Schema.Array(
    Schema.Struct({
      chainId: Schema.String,
      id: Schema.String,
      name: Schema.String,
      token: Schema.String,
      usdc: Schema.String,
    })
  ),
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
  // than a second one counting the same transfers twice. One per Base.
  for (const entry of file.aggregations) {
    // Sequential on purpose: each is one request, and the order is the file's.
    // eslint-disable-next-line no-await-in-loop
    const created = await request(
      {
        body: JSON.stringify({
          conditions: [
            {
              field: "chain_id",
              field_source: "ethereum_transaction",
              operator: "eq",
              value: entry.chainId,
            },
            {
              field: "to",
              field_source: "ethereum_transaction",
              operator: "eq",
              value: entry.usdc,
            },
          ],
          method: "eth_signTransaction",
          metric: {
            abi: TRANSFER_ABI,
            field: "transfer.amount",
            field_source: "ethereum_calldata",
            function: "sum",
          },
          name: entry.name,
          window: { seconds: 86_400, type: "rolling" },
        }),
        idempotencyKey: entry.name,
        method: "POST",
        path: "/aggregations",
      },
      Named
    );
    process.stdout.write(`${created.name} ${created.id}\n`);
  }
};

const apply = async (): Promise<void> => {
  const file = await readFile();
  let rules = JSON.stringify(file.rules);
  for (const entry of file.aggregations) {
    if (entry.id.includes("REPLACE_ME")) {
      throw new Error(
        `The policy file still names a placeholder for ${entry.name}; run \`aggregation\` first and paste the id.`
      );
    }
    rules = rules.replaceAll(`"${entry.token}"`, `"aggregation.${entry.id}"`);
  }
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

/** A rule as the merge sees it: its name, and whatever else Privy wants, untouched. */
const NamedRule = Schema.Struct({ name: Schema.String });
const RawPolicy = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  rules: Schema.Array(Schema.Unknown),
});
const RuleFile = Schema.Array(Schema.Unknown);

const NamedRules = Schema.Array(NamedRule);

/** What JSON can hold, as far as a replacer is concerned. */
type Json =
  | boolean
  | number
  | string
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };

const dropId = (key: string, value: Json): Json | undefined =>
  key === "id" ? undefined : value;

/** The same rules with every `id` key dropped, at any depth. */
const withoutIds = (rules: readonly unknown[]): readonly unknown[] => {
  const decoded = Schema.decodeUnknownResult(RuleFile)(
    JSON.parse(JSON.stringify(rules, dropId))
  );
  if (Result.isFailure(decoded)) {
    throw new Error("The live rules could not be read back.");
  }
  return decoded.success;
};

/** The names in a list of rules, refusing a rule without one. */
const namesOf = (rules: readonly unknown[]): readonly string[] => {
  const decoded = Schema.decodeUnknownResult(NamedRules)(rules);
  if (Result.isFailure(decoded)) {
    throw new Error("Every rule must carry a name.");
  }
  return decoded.success.map((rule) => rule.name);
};

const merge = async (): Promise<void> => {
  const file = process.argv.at(3);
  if (file === undefined) {
    throw new Error("merge needs the path of a JSON array of rules.");
  }
  const decoded = Schema.decodeUnknownResult(RuleFile)(
    await Bun.file(file).json()
  );
  if (Result.isFailure(decoded)) {
    throw new Error(`${file} is not a JSON array of rules.`);
  }
  // The live rules are kept as Privy sent them, untouched, because the codec
  // that reads them for display drops fields that a PATCH must send back.
  const live = await request(
    { method: "GET", path: `/policies/${policyId}` },
    RawPolicy
  );
  // Privy sends each rule back with an `id` it will not accept on a PATCH;
  // everything else about a live rule is returned exactly as it came.
  const kept = withoutIds(live.rules);
  const present = new Set(namesOf(kept));
  const names = namesOf(decoded.success);
  const added = decoded.success.filter(
    (_rule, index) => !present.has(names[index] ?? "")
  );
  if (added.length === 0) {
    process.stdout.write(
      `${live.name}: every rule in ${file} is already there; nothing sent.\n`
    );
    return;
  }
  const policy = await request(
    {
      body: JSON.stringify({ rules: [...kept, ...added] }),
      method: "PATCH",
      path: `/policies/${policyId}`,
    },
    Policy
  );
  for (const rule of policy.rules) {
    const mark = present.has(rule.name) ? " " : "+";
    process.stdout.write(
      `${mark} ${rule.action} ${rule.method} ${rule.name} (${rule.conditions.length} conditions)\n`
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

const verbs = { aggregation, apply, merge, show };
const verb = process.argv[2] ?? "show";
const run = Object.entries(verbs).find(([name]) => name === verb)?.[1];
if (run === undefined) {
  throw new Error(
    `Unknown verb '${verb}'. One of: ${Object.keys(verbs).join(", ")}.`
  );
}
await run();
