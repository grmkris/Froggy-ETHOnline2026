import { describe, expect, it } from "bun:test";

import { defaultAllowance, usd } from "@froggy/domain";
import type { Allowance } from "@froggy/domain";

import { personPolicyName, personPolicyRules } from "./person-policy";
import type { PolicyPins, PolicyRule } from "./person-policy";

const NOW = 1_789_000_000_000;
const ALLOWANCE = defaultAllowance(NOW);

/**
 * The pins from the committed policy, so the generated rules can be compared
 * against shapes Privy has demonstrably accepted rather than invented ones.
 */
const PINS: PolicyPins = {
  chainId: "8453",
  servicePayee: "0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB",
  treasury: "0x8Cc232c9EB25b4b20ee448106858e3B6281708C2",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  vaultId: null,
};

const byName = (rules: readonly PolicyRule[], name: string): PolicyRule => {
  const found = rules.find((rule) => rule.name === name);
  if (found === undefined) {
    throw new Error(`no rule named ${name}`);
  }
  return found;
};

const conditionOn = (rule: PolicyRule, source: string, field: string) => {
  const found = rule.conditions.find(
    (condition) =>
      condition.field_source === source && condition.field === field
  );
  if (found === undefined) {
    throw new Error(`no condition ${source}.${field} on ${rule.name}`);
  }
  return found;
};

describe("personPolicyRules", () => {
  const rules = personPolicyRules(ALLOWANCE, PINS);

  it("writes a rule only for standing kinds this deployment can express", () => {
    expect(rules.map((rule) => rule.name)).toEqual([
      "service-payment-x402-usdc",
      "conversion-usdc-to-treasury",
    ]);
  });

  it("writes no rule for a transfer, so Privy's default-deny is what refuses it", () => {
    // The mechanism the whole design rests on: a person is asked about a payee
    // because the standing key physically cannot sign one, not because our code
    // remembered to check.
    expect(rules.some((rule) => rule.method === "transfer")).toBe(false);
  });

  it("every rule allows, and every rule expires", () => {
    for (const rule of rules) {
      expect(rule.action).toBe("ALLOW");
      const expiry = conditionOn(rule, "system", "current_unix_timestamp");
      expect(expiry.operator).toBe("lt");
      // Seconds, not milliseconds. Getting this wrong expires a grant either in
      // 1970 or never, and Privy would not complain about either.
      expect(expiry.value).toBe(String(Math.floor(ALLOWANCE.expiresAt / 1000)));
    }
  });

  it("caps the x402 payment at the person's own per-spend number", () => {
    const rule = byName(rules, "service-payment-x402-usdc");
    expect(rule.method).toBe("eth_signTypedData_v4");
    const value = conditionOn(rule, "ethereum_typed_data_message", "value");
    expect(value.operator).toBe("lte");
    // $2 of USDC is 2_000_000 of its smallest unit and 2_000_000 micro-dollars.
    expect(value.value).toBe("2000000");
    expect(
      conditionOn(rule, "ethereum_typed_data_message", "to").value
    ).toEqual([PINS.servicePayee]);
    expect(
      conditionOn(rule, "ethereum_typed_data_domain", "verifyingContract").value
    ).toBe(PINS.usdc);
  });

  it("makes the conversion an authorization to the treasury, so it needs no ETH of the person's", () => {
    const rule = byName(rules, "conversion-usdc-to-treasury");
    // Typed data, never a signed transaction: the person's wallet holds no
    // ETH, and a rule for `eth_signTransaction` would let a conversion be
    // signed that the chain then refuses for want of gas.
    expect(rule.method).toBe("eth_signTypedData_v4");
    expect(
      conditionOn(rule, "ethereum_typed_data_domain", "verifyingContract").value
    ).toBe(PINS.usdc);
    expect(
      conditionOn(rule, "ethereum_typed_data_domain", "chainId").value
    ).toBe(PINS.chainId);
    const recipient = conditionOn(rule, "ethereum_typed_data_message", "to");
    expect(recipient.value).toEqual([PINS.treasury]);
    expect(recipient.typed_data).toBeDefined();
    const value = conditionOn(rule, "ethereum_typed_data_message", "value");
    expect(value.operator).toBe("lte");
    expect(value.value).toBe("2000000");
    expect(
      rules.some((candidate) => candidate.method === "eth_signTransaction")
    ).toBe(false);
  });

  it("moves the person's numbers into the rules, rather than a fixed cap", () => {
    const generous: Allowance = { ...ALLOWANCE, perSpendUsdMicros: usd(7.5) };
    const theirs = personPolicyRules(generous, PINS);
    expect(
      conditionOn(
        byName(theirs, "service-payment-x402-usdc"),
        "ethereum_typed_data_message",
        "value"
      ).value
    ).toBe("7500000");
  });

  it("skips Earn entirely while no vault is enabled", () => {
    expect(rules.some((rule) => rule.method.startsWith("earn"))).toBe(false);
  });

  it("pins the vault and caps the amount once a vault exists", () => {
    const withVault = personPolicyRules(ALLOWANCE, {
      ...PINS,
      vaultId: "vault-abc",
    });
    const deposit = byName(withVault, "earn-deposit");
    expect(deposit.method).toBe("earn_deposit");
    expect(conditionOn(deposit, "action_request_body", "vault_id").value).toBe(
      "vault-abc"
    );
    // The kind allows $25 a sweep; this person allows $2 a spend, so $2 wins.
    expect(
      conditionOn(deposit, "action_request_body", "raw_amount").value
    ).toBe("2000000");
    expect(byName(withVault, "earn-withdraw").method).toBe("earn_withdraw");
  });
});

describe("personPolicyName", () => {
  it("stays findable by a human scanning the Privy dashboard", () => {
    const did = "did:privy:cmtq98t70006g0cjrgjhm3oxj";
    expect(personPolicyName(did)).toBe(`froggy-person-${did.slice(-12)}`);
    expect(personPolicyName(did).startsWith("froggy-person-")).toBe(true);
  });

  it("gives two people two names", () => {
    expect(personPolicyName("did:privy:aaaaaaaaaaaaaaaaaaaa")).not.toBe(
      personPolicyName("did:privy:bbbbbbbbbbbbbbbbbbbb")
    );
  });
});
