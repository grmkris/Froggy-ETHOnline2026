/**
 * A person's Privy policy, as data.
 *
 * The committed `docs/privy-agent-policy.json` describes one policy that every
 * person's wallet points at. Its caps are ours, its expiry is ours, and nobody
 * consented to either. This turns the same rule shapes into a policy per
 * person, carrying the four numbers they chose and the expiry they were told
 * about — the numbers coming from `STANDING_AUTHORITY` and their `Allowance`,
 * so the signer's leash and the mandate's leash are generated from one source
 * and cannot drift apart.
 *
 * This module is pure on purpose. Producing the rules and sending them are
 * separate jobs, and only the first one can be proven without a network: the
 * test asserts these rules against the shapes Privy has actually accepted,
 * which is the part that is easy to get subtly and silently wrong.
 *
 * Two things it deliberately does not do:
 *
 *   - **It never invents an address.** Every payee, token and contract arrives
 *     in `pins`, resolved by the caller from configuration or the committed
 *     policy, per the repository's onchain rule.
 *   - **It writes no rule for a kind the table marks `ask`.** That is the whole
 *     mechanism: Privy is default-deny, so a kind with no rule cannot be signed
 *     by the standing key at all, and the human path is the only way through.
 */

import type {
  ActionKind,
  Allowance,
  WalletRequestId,
  WalletRequestPayload,
} from "@froggy/domain";
import { authorityFor, ceilingFor, parseTypedData } from "@froggy/domain";
import { Schema } from "effect";

import { ERC20_TRANSFER_ABI } from "./erc20";

/**
 * The addresses a person's rules are pinned to. Supplied, never guessed.
 *
 * `chainId` is a decimal string because that is what Privy compares against;
 * sending a number here matches nothing and refuses everything, quietly.
 */
export interface PolicyPins {
  readonly chainId: string;
  /** The x402 payee the agent may pay for a metered query. */
  readonly servicePayee: string;
  /** Where a conversion sends USDC. The treasury, in this deployment. */
  readonly treasury: string;
  /** The USDC contract on `chainId`. */
  readonly usdc: string;
  /** The Earn vault a sweep may enter, or null while Earn is not enabled. */
  readonly vaultId: string | null;
}

/** Privy's own vocabulary. Kept structural: this is a wire shape, not a domain type. */
export interface PolicyCondition {
  readonly abi?: unknown;
  readonly field: string;
  readonly field_source: string;
  readonly operator: string;
  readonly typed_data?: unknown;
  readonly value: string | readonly string[];
}

export interface PolicyRule {
  readonly action: "ALLOW";
  readonly conditions: readonly PolicyCondition[];
  readonly method: string;
  readonly name: string;
}

/** The EIP-3009 authorization an x402 payment on Base is made of. */
const TRANSFER_WITH_AUTHORIZATION = {
  primary_type: "TransferWithAuthorization",
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
};

/**
 * The expiry, as Privy enforces it.
 *
 * Privy has no expiry on a policy or on a signer — the only thing it honours is
 * this condition, on every rule, compared against its own clock. Seconds, not
 * milliseconds: the mandate carries the same instant in milliseconds, and
 * mixing the two silently expires a grant in 1970 or never.
 */
const notAfter = (allowance: Allowance): PolicyCondition => ({
  field: "current_unix_timestamp",
  field_source: "system",
  operator: "lt",
  value: String(Math.floor(allowance.expiresAt / 1000)),
});

/**
 * Caps go out as decimal strings of USDC's smallest unit.
 *
 * USDC has six decimals and `UsdMicros` is USD millionths, so the two units
 * coincide exactly and no conversion is needed here. That is a coincidence
 * worth stating rather than relying on silently: an asset with other decimals
 * would need converting, and the absence of arithmetic below is a decision, not
 * an oversight.
 */
/**
 * The rule for paying a seller's 402: a typed-data signature, pinned to the
 * asset, the chain and the payee, capped at the person's own ceiling.
 */
const servicePaymentRule = (
  allowance: Allowance,
  pins: PolicyPins,
  cap: number
): PolicyRule => ({
  action: "ALLOW",
  conditions: [
    {
      field: "chainId",
      field_source: "ethereum_typed_data_domain",
      operator: "eq",
      value: pins.chainId,
    },
    {
      field: "verifyingContract",
      field_source: "ethereum_typed_data_domain",
      operator: "eq",
      value: pins.usdc,
    },
    {
      field: "to",
      field_source: "ethereum_typed_data_message",
      operator: "in",
      typed_data: TRANSFER_WITH_AUTHORIZATION,
      value: [pins.servicePayee],
    },
    {
      field: "value",
      field_source: "ethereum_typed_data_message",
      operator: "lte",
      typed_data: TRANSFER_WITH_AUTHORIZATION,
      value: String(cap),
    },
    notAfter(allowance),
  ],
  method: "eth_signTypedData_v4",
  name: "service-payment-x402-usdc",
});

/**
 * The rule for the just-in-time conversion: an EIP-3009 authorization of USDC
 * to the treasury, the same shape as a service payment with the recipient
 * pinned to the treasury instead of the payee.
 *
 * Typed data rather than a signed `transfer`, because the person's wallet
 * holds USDC and no ETH: a transaction of their own has no gas behind it,
 * while an authorization is settled by the treasury (`authorized-transfer.ts`)
 * and the token itself refuses any recipient or amount other than the ones
 * signed here. The old `eth_signTransaction` rule is not written any more; a
 * policy minted before this change keeps it until the person saves their
 * rules again, and until then the conversion is refused by Privy in its own
 * words.
 */
const conversionRule = (
  allowance: Allowance,
  pins: PolicyPins,
  cap: number
): PolicyRule => ({
  action: "ALLOW",
  conditions: [
    {
      field: "chainId",
      field_source: "ethereum_typed_data_domain",
      operator: "eq",
      value: pins.chainId,
    },
    {
      field: "verifyingContract",
      field_source: "ethereum_typed_data_domain",
      operator: "eq",
      value: pins.usdc,
    },
    {
      field: "to",
      field_source: "ethereum_typed_data_message",
      operator: "in",
      typed_data: TRANSFER_WITH_AUTHORIZATION,
      value: [pins.treasury],
    },
    {
      field: "value",
      field_source: "ethereum_typed_data_message",
      operator: "lte",
      typed_data: TRANSFER_WITH_AUTHORIZATION,
      value: String(cap),
    },
    notAfter(allowance),
  ],
  method: "eth_signTypedData_v4",
  name: "conversion-usdc-to-treasury",
});

/**
 * An Earn rule, in the vocabulary Privy's validator named: `action_request_body`
 * with `vault_id` and `raw_amount`. Both Earn methods refuse a rule with no
 * conditions, so the vault is always pinned and the amount always capped.
 */
const earnRule = (
  allowance: Allowance,
  vaultId: string,
  method: "earn_deposit" | "earn_withdraw",
  cap: number
): PolicyRule => ({
  action: "ALLOW",
  conditions: [
    {
      field: "vault_id",
      field_source: "action_request_body",
      operator: "eq",
      value: vaultId,
    },
    {
      field: "raw_amount",
      field_source: "action_request_body",
      operator: "lte",
      value: String(cap),
    },
    notAfter(allowance),
  ],
  method,
  name: method.replace("_", "-"),
});

/** Which kinds this deployment can currently express as a Privy rule. */
const RULED: readonly ActionKind[] = [
  "service_payment",
  "conversion",
  "earn_deposit",
  "earn_withdraw",
];

/**
 * The rules for one person.
 *
 * Every kind the table marks `standing` and this deployment can express gets a
 * rule capped at `ceilingFor`, which is the tighter of the kind's own limit and
 * the person's. Everything else — a transfer, a trade, an unknown kind, and any
 * method not named here at all — has no rule, and Privy's default-deny is what
 * refuses it.
 */
export const personPolicyRules = (
  allowance: Allowance,
  pins: PolicyPins
): readonly PolicyRule[] => {
  const rules: PolicyRule[] = [];
  for (const kind of RULED) {
    const authority = authorityFor(kind);
    const cap = ceilingFor(kind, allowance);
    if (authority === null || authority.side !== "standing" || cap === null) {
      continue;
    }
    if (kind === "service_payment") {
      rules.push(servicePaymentRule(allowance, pins, cap));
    }
    if (kind === "conversion") {
      rules.push(conversionRule(allowance, pins, cap));
    }
    // Earn is skipped rather than pinned to nothing while no vault is enabled;
    // a rule naming an empty vault would be a leash on a door that is bricked up.
    if (
      (kind === "earn_deposit" || kind === "earn_withdraw") &&
      pins.vaultId !== null
    ) {
      rules.push(earnRule(allowance, pins.vaultId, kind, cap));
    }
  }
  return rules;
};

// ---------------------------------------------------------------------------
// One-shot rules for dapp requests
// ---------------------------------------------------------------------------

/**
 * One approved dapp request, as the rule builder needs it. The payload is the
 * exact thing the page asked for and the person saw; `notAfterMs` is when the
 * rule dies whether or not it was used.
 */
export interface DappRuleInput {
  readonly id: WalletRequestId;
  readonly chainId: number;
  readonly payload: WalletRequestPayload;
  readonly notAfterMs: number;
}

const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const ERC20_TRANSFER_FROM_ABI = [
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const PERMIT2_APPROVE_ABI = [
  {
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

/**
 * The ABI shapes whose arguments a rule can pin. Keyed by selector; the value
 * says which ABI decodes it and which arguments to compare, in order.
 *
 * A call outside this table is pinned to `to`, `value` and `chain_id` only:
 * Privy decodes calldata against an ABI or not at all, and there is no ABI for
 * a function we do not know. That is the residual the card's warning names.
 */
const PINNABLE_CALLS = new Map([
  [
    "a9059cbb",
    {
      abi: ERC20_TRANSFER_ABI,
      args: [
        { kind: "address", name: "to" },
        { kind: "uint", name: "amount" },
      ],
      name: "transfer",
    },
  ],
  [
    "095ea7b3",
    {
      abi: ERC20_APPROVE_ABI,
      args: [
        { kind: "address", name: "spender" },
        { kind: "uint", name: "amount" },
      ],
      name: "approve",
    },
  ],
  [
    "23b872dd",
    {
      abi: ERC20_TRANSFER_FROM_ABI,
      args: [
        { kind: "address", name: "from" },
        { kind: "address", name: "to" },
        { kind: "uint", name: "amount" },
      ],
      name: "transferFrom",
    },
  ],
  [
    "87517c45",
    {
      abi: PERMIT2_APPROVE_ABI,
      args: [
        { kind: "address", name: "token" },
        { kind: "address", name: "spender" },
        { kind: "uint", name: "amount" },
        { kind: "uint", name: "expiration" },
      ],
      name: "approve",
    },
  ],
]);

const abiWord = (data: string, index: number): string | null => {
  const start = 8 + index * 64;
  const chunk = data.slice(start, start + 64);
  return chunk.length === 64 ? chunk : null;
};

/** Calldata conditions for a known call, or null when the call is not one we can decode. */
const calldataConditions = (
  data: string
): readonly PolicyCondition[] | null => {
  const hex = data.slice(2).toLowerCase();
  const known = PINNABLE_CALLS.get(hex.slice(0, 8));
  if (known === undefined) {
    return null;
  }
  const conditions: PolicyCondition[] = [];
  for (const [index, arg] of known.args.entries()) {
    const chunk = abiWord(hex, index);
    if (chunk === null) {
      return null;
    }
    conditions.push({
      abi: known.abi,
      field: `${known.name}.${arg.name}`,
      field_source: "ethereum_calldata",
      operator: "eq",
      value:
        arg.kind === "address"
          ? `0x${chunk.slice(24)}`
          : BigInt(`0x${chunk}`).toString(),
    });
  }
  return conditions;
};

const expiresAt = (notAfterMs: number): PolicyCondition => ({
  field: "current_unix_timestamp",
  field_source: "system",
  operator: "lt",
  value: String(Math.floor(notAfterMs / 1000)),
});

const ruleName = (input: DappRuleInput): string =>
  `dapp-${input.payload.kind.replaceAll("_", "-")}-${input.id.slice(-8)}`;

const transactionRule = (
  input: DappRuleInput,
  payload: Extract<WalletRequestPayload, { kind: "send_transaction" }>
): PolicyRule | null => {
  if (payload.to === null) {
    return null;
  }
  return {
    action: "ALLOW",
    conditions: [
      {
        field: "chain_id",
        field_source: "ethereum_transaction",
        operator: "eq",
        value: String(input.chainId),
      },
      {
        field: "to",
        field_source: "ethereum_transaction",
        operator: "eq",
        value: payload.to,
      },
      {
        field: "value",
        field_source: "ethereum_transaction",
        operator: "eq",
        value: BigInt(payload.value).toString(),
      },
      ...(calldataConditions(payload.data) ?? []),
      expiresAt(input.notAfterMs),
    ],
    method: "eth_signTransaction",
    name: ruleName(input),
  };
};

const messageRule = (
  input: DappRuleInput,
  payload: Extract<WalletRequestPayload, { kind: "personal_sign" }>
): PolicyRule => ({
  action: "ALLOW",
  conditions: [
    {
      field: "content",
      field_source: "message",
      operator: "eq",
      value: Buffer.from(payload.message.slice(2), "hex").toString("utf-8"),
    },
    expiresAt(input.notAfterMs),
  ],
  method: "personal_sign",
  name: ruleName(input),
});

/**
 * The primitive leaves of an EIP-712 message, as dot paths, two levels deep.
 * Arrays are skipped: Privy's path syntax names one value, and a batch permit
 * is pinned by its domain, its primary type and its scalar fields instead.
 */
const TypedMessage = Schema.Record(Schema.String, Schema.Unknown);
const isLeaf = Schema.is(Schema.Union([Schema.String, Schema.Number]));
const isNested = Schema.is(TypedMessage);

const messageLeaves = (
  message: typeof TypedMessage.Type,
  prefix = ""
): readonly { readonly path: string; readonly value: string }[] => {
  const leaves: { readonly path: string; readonly value: string }[] = [];
  for (const [key, raw] of Object.entries(message)) {
    const path = `${prefix}${key}`;
    if (isLeaf(raw)) {
      leaves.push({ path, value: String(raw) });
    } else if (prefix === "" && isNested(raw)) {
      leaves.push(...messageLeaves(raw, `${path}.`));
    }
  }
  return leaves;
};

const typedDataRule = (
  input: DappRuleInput,
  payload: Extract<WalletRequestPayload, { kind: "sign_typed_data_v4" }>
): PolicyRule | null => {
  const document = parseTypedData(payload.typedData);
  if (document === null) {
    return null;
  }
  const typed = { primary_type: document.primaryType, types: document.types };
  const conditions: PolicyCondition[] = [
    {
      field: "chainId",
      field_source: "ethereum_typed_data_domain",
      operator: "eq",
      value: String(input.chainId),
    },
  ];
  if (document.domain.verifyingContract !== undefined) {
    conditions.push({
      field: "verifyingContract",
      field_source: "ethereum_typed_data_domain",
      operator: "eq",
      value: document.domain.verifyingContract,
    });
  }
  for (const leaf of messageLeaves(document.message)) {
    conditions.push({
      field: leaf.path,
      field_source: "ethereum_typed_data_message",
      operator: "eq",
      typed_data: typed,
      value: leaf.value,
    });
  }
  conditions.push(expiresAt(input.notAfterMs));
  return {
    action: "ALLOW",
    conditions,
    method: "eth_signTypedData_v4",
    name: ruleName(input),
  };
};

/**
 * One exact rule per approved dapp request, or nothing for a request no rule
 * can express — which the caller must treat as a refusal, not a pass.
 *
 * Every rule pins the chain and the exact thing the person saw, and dies at
 * `notAfterMs`. The transaction rule cannot pin the nonce or, for an unknown
 * function, the calldata: Privy's transaction conditions are `to`, `value` and
 * `chain_id`, and calldata decodes only against an ABI we have. Our own status
 * machine never signs a request twice; the rule's lifetime bounds what a
 * compromised host could do with the rest.
 */
export const dappRule = (input: DappRuleInput): PolicyRule | null => {
  const { payload } = input;
  switch (payload.kind) {
    case "connect": {
      return null;
    }
    case "send_transaction": {
      return transactionRule(input, payload);
    }
    case "personal_sign": {
      return messageRule(input, payload);
    }
    case "sign_typed_data_v4": {
      return typedDataRule(input, payload);
    }
  }
  return null;
};

/** The full rule set the policy is patched to: the standing rules plus the live one-shots. */
export const policyRulesWithDapps = (
  allowance: Allowance,
  pins: PolicyPins,
  dapps: readonly DappRuleInput[]
): readonly PolicyRule[] => [
  ...personPolicyRules(allowance, pins),
  ...dapps.flatMap((input) => {
    const rule = dappRule(input);
    return rule === null ? [] : [rule];
  }),
];

/** What a person's policy is called at Privy. The DID suffix keeps it findable. */
export const personPolicyName = (did: string): string =>
  `froggy-person-${did.slice(-12)}`;
