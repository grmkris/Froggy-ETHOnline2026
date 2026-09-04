import { describe, expect, it } from "bun:test";

import { MandateId, RuleId, SessionId, usdMicros } from "@froggy/domain";
import type { Mandate, Payee, Provenance, SpendIntent } from "@froggy/domain";

import { authorize } from "./policy";
import type { LedgerEntry } from "./policy";

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

const decide = (
  rules: Mandate["rules"],
  overrides: {
    frozen?: boolean;
    intent?: Partial<SpendIntent>;
    recent?: readonly LedgerEntry[];
  } = {}
) =>
  authorize({
    intent: intent(overrides.intent),
    mandate: mandate(rules, overrides.frozen ?? false),
    now: NOW,
    recent: overrides.recent ?? [],
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
      { _tag: "network_allowlist", id: rule(), networks: ["base-sepolia"] },
    ]);
    expect(decision).toMatchObject({
      _tag: "deny",
      code: "network_not_allowed",
    });
  });
});
