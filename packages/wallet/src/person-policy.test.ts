import { describe, expect, it } from "bun:test";

import {
  defaultAllowance,
  EvmAddress,
  usd,
  WalletRequestId,
} from "@froggy/domain";
import type { Allowance } from "@froggy/domain";
import { Schema } from "effect";

import {
  dappRule,
  personPolicyName,
  personPolicyRules,
  policyRulesWithDapps,
} from "./person-policy";
import type { PolicyPins, PolicyRule } from "./person-policy";

const address = Schema.decodeUnknownSync(EvmAddress);

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

const pad = (hex: string): string => hex.replace(/^0x/u, "").padStart(64, "0");
const must = (rule: PolicyRule | null): PolicyRule => {
  if (rule === null) {
    throw new Error("expected a rule");
  }
  return rule;
};

describe("dappRule", () => {
  const ME = address("0x1111111111111111111111111111111111111111");
  const SHOP = address("0x2222222222222222222222222222222222222222");
  const NOT_AFTER = NOW + 10 * 60 * 1000;
  const id = WalletRequestId.generate();

  it("pins a USDC transfer to the chain, the token, the recipient and the exact amount", () => {
    const rule = must(
      dappRule({
        chainId: 8453,
        id,
        notAfterMs: NOT_AFTER,
        payload: {
          data: `0xa9059cbb${pad(SHOP)}${pad((12_500_000).toString(16))}`,
          from: ME,
          kind: "send_transaction",
          to: address(PINS.usdc),
          value: "0x0",
        },
      })
    );
    expect(rule.method).toBe("eth_signTransaction");
    expect(conditionOn(rule, "ethereum_transaction", "chain_id").value).toBe(
      "8453"
    );
    expect(conditionOn(rule, "ethereum_transaction", "to").value).toBe(
      PINS.usdc
    );
    expect(conditionOn(rule, "ethereum_transaction", "value").value).toBe("0");
    expect(conditionOn(rule, "ethereum_calldata", "transfer.to").value).toBe(
      SHOP.toLowerCase()
    );
    const amount = conditionOn(rule, "ethereum_calldata", "transfer.amount");
    expect(amount.operator).toBe("eq");
    expect(amount.value).toBe("12500000");
    expect(conditionOn(rule, "system", "current_unix_timestamp").value).toBe(
      String(Math.floor(NOT_AFTER / 1000))
    );
  });

  it("pins an unknown call to its recipient and value only, and says nothing more", () => {
    const rule = dappRule({
      chainId: 8453,
      id,
      notAfterMs: NOT_AFTER,
      payload: {
        data: "0xdeadbeef",
        from: ME,
        kind: "send_transaction",
        to: SHOP,
        value: "0x2386f26fc10000",
      },
    });
    expect(rule?.conditions.map((condition) => condition.field_source)).toEqual(
      [
        "ethereum_transaction",
        "ethereum_transaction",
        "ethereum_transaction",
        "system",
      ]
    );
    expect(conditionOn(must(rule), "ethereum_transaction", "value").value).toBe(
      "10000000000000000"
    );
  });

  it("refuses to write a rule for contract creation or a connection", () => {
    expect(
      dappRule({
        chainId: 8453,
        id,
        notAfterMs: NOT_AFTER,
        payload: {
          data: "0x60",
          from: ME,
          kind: "send_transaction",
          to: null,
          value: "0x0",
        },
      })
    ).toBeNull();
    expect(
      dappRule({
        chainId: 8453,
        id,
        notAfterMs: NOT_AFTER,
        payload: { kind: "connect" },
      })
    ).toBeNull();
  });

  it("pins a personal_sign to the exact decoded text", () => {
    const text = `app.uniswap.org wants you to sign in with your Ethereum account:\n${ME}`;
    const rule = dappRule({
      chainId: 8453,
      id,
      notAfterMs: NOT_AFTER,
      payload: {
        address: ME,
        kind: "personal_sign",
        message: `0x${Buffer.from(text, "utf-8").toString("hex")}`,
      },
    });
    expect(rule?.method).toBe("personal_sign");
    const content = conditionOn(must(rule), "message", "content");
    expect(content.operator).toBe("eq");
    expect(content.value).toBe(text);
  });

  it("pins typed data to its domain and every scalar of its message", () => {
    const typedData = JSON.stringify({
      domain: { chainId: 8453, name: "Permit2", verifyingContract: SHOP },
      message: {
        details: {
          amount: "2500000",
          expiration: 1,
          nonce: 0,
          token: PINS.usdc,
        },
        sigDeadline: "99",
        spender: ME,
      },
      primaryType: "PermitSingle",
      types: { PermitSingle: [] },
    });
    const rule = dappRule({
      chainId: 8453,
      id,
      notAfterMs: NOT_AFTER,
      payload: { address: ME, kind: "sign_typed_data_v4", typedData },
    });
    expect(rule?.method).toBe("eth_signTypedData_v4");
    expect(
      conditionOn(must(rule), "ethereum_typed_data_domain", "verifyingContract")
        .value
    ).toBe(SHOP);
    const amount = conditionOn(
      must(rule),
      "ethereum_typed_data_message",
      "details.amount"
    );
    expect(amount.value).toBe("2500000");
    expect(amount.typed_data).toEqual({
      primary_type: "PermitSingle",
      types: { PermitSingle: [] },
    });
    expect(
      conditionOn(must(rule), "ethereum_typed_data_message", "spender").value
    ).toBe(ME);
  });

  it("appends the one-shots after the standing rules in the full set", () => {
    const all = policyRulesWithDapps(ALLOWANCE, PINS, [
      {
        chainId: 8453,
        id,
        notAfterMs: NOT_AFTER,
        payload: { kind: "connect" },
      },
      {
        chainId: 8453,
        id,
        notAfterMs: NOT_AFTER,
        payload: { address: ME, kind: "personal_sign", message: "0x68690a" },
      },
    ]);
    expect(all.map((rule) => rule.name)).toEqual([
      "service-payment-x402-usdc",
      "conversion-usdc-to-treasury",
      `dapp-personal-sign-${id.slice(-8)}`,
    ]);
  });
});
