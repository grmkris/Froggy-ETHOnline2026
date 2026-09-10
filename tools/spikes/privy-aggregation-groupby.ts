/**
 * Can a Privy aggregation bucket its rolling sum per wallet?
 *
 * `docs/evidence/PRIVY.md` records that the rolling 24-hour aggregation is
 * app-wide, because "Privy groups by transaction or calldata fields, not by
 * wallet". That claim predates a field the SDK does expose and our own tool has
 * never sent: `AggregationInput.group_by`, up to two `{field, field_source}`
 * pairs (`@privy-io/node/resources/aggregations.d.ts`). If Privy will group by
 * the sending wallet, a per-person rolling cap moves inside Privy for the
 * `eth_signTransaction` leg instead of staying ours to enforce.
 *
 * The experiment is two calls, control first, and the order matters:
 *
 *   1. A group_by on a field name that cannot exist. If Privy refuses it, Privy
 *      validates these names, and an acceptance below is worth something.
 *      If Privy accepts nonsense, acceptance means nothing and the verdict is
 *      "unproven" rather than "yes" — this is the whole reason the control runs.
 *   2. The real candidate, `from` on `ethereum_transaction`.
 *
 * What this cannot prove: that an accepted grouping actually buckets correctly
 * at signing time. That needs two funded wallets and two signatures, and is a
 * separate spike. A run of this must never be reported as the stronger claim.
 *
 * A refused request creates nothing. An accepted one leaves a real aggregation
 * on the live app, named so a human can find it; there is no delete endpoint.
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

/** Base mainnet USDC. Any real token works; the metric is not what is under test. */
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

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

interface GroupBy {
  readonly field: string;
  readonly field_source: string;
}

const attempt = async (
  label: string,
  name: string,
  groupBy: GroupBy
): Promise<boolean> => {
  const body = {
    conditions: [
      {
        field: "chain_id",
        field_source: "ethereum_transaction",
        operator: "eq",
        value: "8453",
      },
      {
        field: "to",
        field_source: "ethereum_transaction",
        operator: "eq",
        value: USDC,
      },
    ],
    group_by: [groupBy],
    method: "eth_signTransaction",
    metric: {
      abi: TRANSFER_ABI,
      field: "transfer.amount",
      field_source: "ethereum_calldata",
      function: "sum",
    },
    name,
    window: { seconds: 86_400, type: "rolling" },
  };
  const response = await fetch(`${PRIVY}/aggregations`, {
    body: JSON.stringify(body),
    headers: {
      authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
      "content-type": "application/json",
      "privy-app-id": appId,
      // Idempotent on the name, so a second run of this spike does not leave a
      // second object behind.
      "privy-idempotency-key": name,
    },
    method: "POST",
  });
  const text = await response.text();
  process.stdout.write(
    `\n[${label}] group_by ${groupBy.field_source}.${groupBy.field}\n` +
      `  -> ${response.status} ${text.slice(0, 400)}\n`
  );
  return response.ok;
};

process.stdout.write(
  "Privy aggregation group_by probe. Control first: if nonsense is accepted, nothing below is evidence.\n"
);

const controlAccepted = await attempt(
  "control",
  "froggy-spike-groupby-control-donotuse",
  { field: "not_a_real_field_xyz", field_source: "ethereum_transaction" }
);

const fromAccepted = await attempt("candidate", "froggy-spike-groupby-from", {
  field: "from",
  field_source: "ethereum_transaction",
});

process.stdout.write("\n--- verdict ---\n");
if (controlAccepted) {
  process.stdout.write(
    "UNPROVEN: Privy accepted a field name that cannot exist, so it does not validate\n" +
      "group_by names on create. Acceptance of `from` proves nothing; only two funded\n" +
      "wallets and two signatures could settle it. Rolling caps stay host-side.\n"
  );
} else if (fromAccepted) {
  process.stdout.write(
    "PROMISING: Privy refused a bogus field and accepted `ethereum_transaction.from`.\n" +
      "That is acceptance, not enforcement: a follow-up spike with two funded wallets\n" +
      "must show the sums actually bucket per wallet before any cap relies on it.\n"
  );
} else {
  process.stdout.write(
    "NO: Privy refused `ethereum_transaction.from`. Per-wallet rolling caps are not\n" +
      "expressible; the host keeps them, exactly as docs/evidence/PRIVY.md already says.\n"
  );
}
