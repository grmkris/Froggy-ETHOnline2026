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

import type { ActionKind, Allowance } from "@froggy/domain";
import { authorityFor, ceilingFor } from "@froggy/domain";

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

/** What a person's policy is called at Privy. The DID suffix keeps it findable. */
export const personPolicyName = (did: string): string =>
  `froggy-person-${did.slice(-12)}`;
