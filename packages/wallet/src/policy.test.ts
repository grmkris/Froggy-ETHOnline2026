import { describe, expect, it } from "bun:test";

import { MandateId, RuleId, SessionId, usdMicros } from "@froggy/domain";
import type { Mandate, Payee, Provenance, SpendIntent } from "@froggy/domain";

import { authorize } from "./policy";
import type { AuthorizeInput, LedgerEntry } from "./policy";

const NOW = 1_756_000_000_000;

const rule = (): RuleId => RuleId.generate();
const micros = usdMicros;

const payee = (overrides: Partial<Payee> = {}): Payee => ({
  id: "0.0.5005",
  label: "Froggy oracle",
  provenance: "server" satisfies Provenance,
  ...overrides,
});

const intent = (overrides: Partial<SpendIntent> = {}): SpendIntent => ({
  amount: {
    asset: {
      decimals: 8,
      id: "0.0.0",
      network: "hedera:testnet",
      symbol: "HBAR",
    },
    units: "1000000",
  },
  idempotencyKey: "key-1",
  payee: payee(),
  purpose: "packed lending snapshot",
  usdMicros: micros(10_000),
  ...overrides,
});

const mandate = (rules: Mandate["rules"], frozen = false): Mandate => ({
  createdAt: NOW,
  frozen,
  id: MandateId.generate(),
  rules,
  sessionId: SessionId.generate(),
});

const withPocket = (
  input: AuthorizeInput,
  pocket: AuthorizeInput["pocket"]
): AuthorizeInput => (pocket === undefined ? input : { ...input, pocket });

const decide = (
  rules: Mandate["rules"],
  overrides: {
    approved?: boolean;
    frozen?: boolean;
    intent?: Partial<SpendIntent>;
    pocket?: AuthorizeInput["pocket"];
    recent?: readonly LedgerEntry[];
  } = {}
) =>
  authorize(
    withPocket(
      {
        approved: overrides.approved ?? false,
        intent: intent(overrides.intent),
        mandate: mandate(rules, overrides.frozen ?? false),
        now: NOW,
        recent: overrides.recent ?? [],
      },
      overrides.pocket
    )
  );

describe("the pocket", () => {
  const hedera = {
    balanceUsdMicros: 5000,
    networks: ["hedera:testnet"],
  } as const;

  it("refuses a spend the pocket cannot cover, and says how much is left", () => {
    const decision = decide([], { pocket: hedera });
    expect(decision).toMatchObject({ _tag: "deny", code: "pocket_exhausted" });
    expect(decision._tag === "deny" ? decision.message : "").toContain(
      "$0.0050 left"
    );
  });

  it("allows a spend the pocket covers", () => {
    const decision = decide([], {
      intent: { usdMicros: micros(5000) },
      pocket: hedera,
    });
    expect(decision._tag).toBe("allow");
  });

  it("ignores the pocket for a network the person's own wallet pays", () => {
    const decision = decide([], {
      intent: {
        amount: {
          asset: {
            decimals: 6,
            id: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            network: "eip155:84532",
            symbol: "USDC",
          },
          units: "10000",
        },
      },
      pocket: { balanceUsdMicros: 0, networks: ["hedera:testnet"] },
    });
    expect(decision._tag).toBe("allow");
  });
});

describe("authorize", () => {
  it("allows a spend inside every rule", () => {
    const decision = decide([
      { _tag: "per_tx_cap", id: rule(), maxUsdMicros: micros(2_000_000) },
    ]);
    expect(decision._tag).toBe("allow");
  });

  it("refuses everything while frozen, before any other rule is consulted", () => {
    // An empty rule list would otherwise allow: the point is that freezing does
    // not depend on a rule existing, so it cannot be removed by editing rules.
    const decision = decide([], { frozen: true });
    expect(decision).toMatchObject({ _tag: "deny", code: "frozen" });
  });

  it("refuses a payee the model produced, even when it is on the allowlist", () => {
    const allow = rule();
    const decision = decide(
      [{ _tag: "payee_allowlist", id: allow, payeeIds: ["0.0.5005"] }],
      { intent: { payee: payee({ provenance: "model" }) } }
    );
    expect(decision).toMatchObject({
      _tag: "deny",
      code: "untrusted_provenance",
    });
  });

  it("refuses a payee that only appeared in page content", () => {
    const decision = decide([], {
      intent: { payee: payee({ provenance: "page" }) },
    });
    expect(decision).toMatchObject({
      _tag: "deny",
      code: "untrusted_provenance",
    });
  });

  it("pays an address the human typed, subject to every other rule", () => {
    // Provenance is about where the string came from, not whether it should
    // be paid: a person's own address passes this gate and then meets the
    // caps like any other.
    const allow = rule();
    const decision = decide(
      [{ _tag: "payee_allowlist", id: allow, payeeIds: ["0xdead"] }],
      { intent: { payee: payee({ id: "0xdead", provenance: "user" }) } }
    );
    expect(decision._tag).toBe("allow");
  });

  it("lets a person pay an address they typed even when the allowlist omits it", () => {
    // Naming a payee is the act the allowlist stands in for. The host still
    // caps the amount; whether the signer will sign for that address is the
    // signer's policy to decide, and a refusal there lands on the receipt.
    const allow = rule();
    const cap = rule();
    const decision = decide(
      [
        { _tag: "payee_allowlist", id: allow, payeeIds: ["0.0.5005"] },
        { _tag: "per_tx_cap", id: cap, maxUsdMicros: micros(1_000_000) },
      ],
      { intent: { payee: payee({ id: "0xdead", provenance: "user" }) } }
    );
    expect(decision).toEqual({ _tag: "allow", satisfied: [allow, cap] });
  });

  it("still refuses a server-proposed payee the allowlist omits", () => {
    const allow = rule();
    const decision = decide(
      [{ _tag: "payee_allowlist", id: allow, payeeIds: ["0.0.5005"] }],
      { intent: { payee: payee({ id: "0.0.9999", provenance: "server" }) } }
    );
    expect(decision).toMatchObject({
      _tag: "deny",
      code: "payee_not_allowed",
      ruleId: allow,
    });
  });

  it("names the rule that refused, so a refusal is traceable", () => {
    const cap = rule();
    const decision = decide([
      { _tag: "per_tx_cap", id: cap, maxUsdMicros: micros(1000) },
    ]);
    expect(decision).toMatchObject({
      _tag: "deny",
      code: "per_tx_cap_exceeded",
      ruleId: cap,
    });
  });

  it("counts earlier spends inside the rolling window", () => {
    const decision = decide(
      [
        {
          _tag: "window_cap",
          id: rule(),
          maxUsdMicros: micros(15_000),
          windowMs: 60_000,
        },
      ],
      { recent: [{ at: NOW - 30_000, usdMicros: 10_000 }] }
    );
    expect(decision).toMatchObject({
      _tag: "deny",
      code: "window_cap_exceeded",
    });
  });

  it("ignores spends that fell out of the window", () => {
    const decision = decide(
      [
        {
          _tag: "window_cap",
          id: rule(),
          maxUsdMicros: micros(15_000),
          windowMs: 60_000,
        },
      ],
      { recent: [{ at: NOW - 90_000, usdMicros: 10_000 }] }
    );
    expect(decision._tag).toBe("allow");
  });

  it("matches a host allowlist on a label boundary, not a substring", () => {
    // `oracle.example.com.attacker.test` contains the allowed host as a
    // substring. A substring check would pay the attacker.
    const decision = decide(
      [{ _tag: "host_allowlist", hosts: ["oracle.example.com"], id: rule() }],
      { intent: { host: "oracle.example.com.attacker.test" } }
    );
    expect(decision).toMatchObject({ _tag: "deny", code: "host_not_allowed" });
  });

  it("accepts a subdomain of an allowed host", () => {
    const decision = decide(
      [{ _tag: "host_allowlist", hosts: ["example.com"], id: rule() }],
      { intent: { host: "oracle.example.com" } }
    );
    expect(decision._tag).toBe("allow");
  });

  it("asks a human above the threshold", () => {
    const threshold = rule();
    const decision = decide([
      {
        _tag: "approval_threshold",
        id: threshold,
        overUsdMicros: micros(5000),
      },
    ]);
    expect(decision).toMatchObject({ _tag: "ask", ruleId: threshold });
  });

  it("denies rather than asks when the spend also breaks a cap", () => {
    // Otherwise a human would be offered a decision they are not allowed to
    // make, and clicking allow would either fail confusingly or bypass the cap.
    const decision = decide([
      { _tag: "approval_threshold", id: rule(), overUsdMicros: micros(5000) },
      { _tag: "per_tx_cap", id: rule(), maxUsdMicros: micros(6000) },
    ]);
    expect(decision).toMatchObject({
      _tag: "deny",
      code: "per_tx_cap_exceeded",
    });
  });

  it("refuses an expired mandate", () => {
    const decision = decide([
      { _tag: "expiry", id: rule(), notAfter: NOW - 1 },
    ]);
    expect(decision).toMatchObject({ _tag: "deny", code: "expired" });
  });

  it("refuses a chain outside the allowlist", () => {
    const decision = decide([
      { _tag: "network_allowlist", id: rule(), networks: ["eip155:84532"] },
    ]);
    expect(decision).toMatchObject({
      _tag: "deny",
      code: "network_not_allowed",
    });
  });

  describe("the approval threshold", () => {
    const threshold = (): Mandate["rules"][number] => ({
      _tag: "approval_threshold",
      id: rule(),
      overUsdMicros: micros(5000),
    });

    it("asks above the line, naming the rule", () => {
      const ask = threshold();
      const decision = decide([ask]);
      expect(decision).toMatchObject({ _tag: "ask", ruleId: ask.id });
    });

    it("is satisfied by a person's answer, and by nothing else", () => {
      // Approved skips exactly one step. A cap that would have refused still
      // refuses: "yes" to the question is not "yes" to breaking a limit.
      const cap = rule();
      expect(decide([threshold()], { approved: true })._tag).toBe("allow");
      expect(
        decide(
          [
            threshold(),
            { _tag: "per_tx_cap", id: cap, maxUsdMicros: micros(1000) },
          ],
          { approved: true }
        )
      ).toMatchObject({ _tag: "deny", ruleId: cap });
    });

    it("honours a session exemption for the same payee at or under its ceiling", () => {
      const exemption = rule();
      const rules: Mandate["rules"] = [
        threshold(),
        {
          _tag: "ask_exemption",
          id: exemption,
          maxUsdMicros: micros(10_000),
          notAfter: NOW + 60_000,
          payeeId: "0.0.5005",
        },
      ];
      const decision = decide(rules);
      expect(decision._tag).toBe("allow");
      if (decision._tag === "allow") {
        expect(decision.satisfied).toContain(exemption);
      }
    });

    it("ignores an exemption for another payee, a larger amount, or one that has expired", () => {
      const base = {
        _tag: "ask_exemption" as const,
        maxUsdMicros: micros(10_000),
        notAfter: NOW + 60_000,
        payeeId: "0.0.5005",
      };
      expect(
        decide([threshold(), { ...base, id: rule(), payeeId: "0.0.9" }])._tag
      ).toBe("ask");
      expect(
        decide([
          threshold(),
          { ...base, id: rule(), maxUsdMicros: micros(9999) },
        ])._tag
      ).toBe("ask");
      expect(
        decide([threshold(), { ...base, id: rule(), notAfter: NOW - 1 }])._tag
      ).toBe("ask");
    });
  });
});
