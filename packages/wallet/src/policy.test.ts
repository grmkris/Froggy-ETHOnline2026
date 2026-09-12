import { describe, expect, it } from "bun:test";

import {
  ApprovalId,
  defaultAllowance,
  KNOWN_ASSETS,
  MandateId,
  PurchaseId,
  RuleId,
  RunId,
  SessionId,
  usdMicros,
} from "@froggy/domain";
import type {
  Mandate,
  Payee,
  Provenance,
  Purchase,
  SpendIntent,
} from "@froggy/domain";

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

const mandate = (rules: Mandate["rules"]): Mandate => ({
  createdAt: NOW,
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
        mandate: mandate(rules),
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

const grantedPurchase = (): Purchase => {
  const approvalId = ApprovalId.generate();
  return {
    id: PurchaseId.generate(),
    createdAt: NOW,
    updatedAt: NOW,
    idempotencyKey: "one-purchase",
    source: "chat",
    connectionId: null,
    runId: RunId.generate(),
    toolCallId: null,
    browserPaymentId: null,
    request: {
      method: "GET",
      url: "https://merchant.example/quote",
      body: null,
    },
    requestFingerprint: "request-v1",
    purpose: "Live price data",
    maxUsdMicros: micros(100_000),
    budgetUsdMicros: micros(1_000_000),
    preferredNetwork: null,
    contactApprovedAt: null,
    status: "paying",
    quote: {
      amount: {
        asset: KNOWN_ASSETS["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:usdc"],
        units: "10000",
      },
      payTo: "H32YnqbzL62YkHMSCzfKcLry9yuipwwx1EMztiCSPhjb",
      origin: "https://merchant.example",
      scheme: "exact",
      extra: {},
      maxTimeoutSeconds: 60,
      usdMicros: micros(10_000),
      fingerprint: "quote-v1",
    },
    approvalId,
    expiresAt: NOW + 60_000,
    grant: {
      source: "human",
      ruleId: rule(),
      approvalId,
      directoryId: null,
      grantedAt: NOW,
      expiresAt: NOW + 60_000,
      requestFingerprint: "request-v1",
      quoteFingerprint: "quote-v1",
    },
    payment: {
      state: "none",
      proofHash: null,
      transactionId: null,
      sentAt: null,
    },
    delivery: {
      state: "pending",
      status: null,
      contentType: null,
      body: null,
      bodyHash: null,
    },
    receiptId: null,
    error: null,
    stubbed: false,
  };
};

const purchaseInput = (
  purchase: Purchase,
  rules: Mandate["rules"] = []
): AuthorizeInput => {
  const { quote } = purchase;
  if (quote === null) {
    throw new Error("Missing purchase fixture quote.");
  }
  return {
    purchase,
    mandate: mandate(rules),
    now: NOW,
    recent: [],
    intent: intent({
      amount: quote.amount,
      host: "merchant.example",
      idempotencyKey: `purchase:${purchase.id}`,
      payee: payee({ id: quote.payTo }),
      usdMicros: quote.usdMicros,
      purchase: {
        id: purchase.id,
        requestFingerprint: purchase.requestFingerprint,
        quoteFingerprint: quote.fingerprint,
      },
    }),
  };
};

describe("exact purchase grants", () => {
  it("allows the named merchant and network without widening the mandate", () => {
    const purchase = grantedPurchase();
    const input = purchaseInput(purchase, [
      { _tag: "network_allowlist", id: rule(), networks: ["hedera:testnet"] },
      { _tag: "host_allowlist", id: rule(), hosts: ["original.example"] },
      { _tag: "payee_allowlist", id: rule(), payeeIds: ["0.0.5005"] },
      { _tag: "approval_threshold", id: rule(), overUsdMicros: micros(1) },
    ]);
    expect(authorize(input)._tag).toBe("allow");
    expect(input.mandate.rules[0]).toMatchObject({
      networks: ["hedera:testnet"],
    });
    expect(authorize({ ...input, purchase: null })).toMatchObject({
      code: "approval_denied",
    });
  });

  it("rejects mismatched request, quote, destination, amount, host, or signing state", () => {
    const input = purchaseInput(grantedPurchase());
    const context = input.intent.purchase;
    if (
      context === undefined ||
      input.purchase === undefined ||
      input.purchase === null
    ) {
      throw new Error("Missing purchase fixture context.");
    }
    const changed: AuthorizeInput[] = [
      {
        ...input,
        intent: {
          ...input.intent,
          purchase: { ...context, id: PurchaseId.generate() },
        },
      },
      {
        ...input,
        intent: {
          ...input.intent,
          purchase: { ...context, requestFingerprint: "different-request" },
        },
      },
      {
        ...input,
        intent: {
          ...input.intent,
          purchase: { ...context, quoteFingerprint: "different-quote" },
        },
      },
      { ...input, intent: { ...input.intent, idempotencyKey: "another-key" } },
      {
        ...input,
        intent: {
          ...input.intent,
          payee: {
            ...input.intent.payee,
            id: input.intent.payee.id.toLowerCase(),
          },
        },
      },
      {
        ...input,
        intent: {
          ...input.intent,
          amount: { ...input.intent.amount, units: "10001" },
        },
      },
      {
        ...input,
        intent: {
          ...input.intent,
          amount: {
            ...input.intent.amount,
            asset: { ...input.intent.amount.asset, decimals: 9 },
          },
        },
      },
      { ...input, intent: { ...input.intent, host: "other.example" } },
      {
        ...input,
        purchase: { ...input.purchase, status: "awaiting_approval" },
      },
      {
        ...input,
        purchase: { ...input.purchase, approvalId: ApprovalId.generate() },
      },
      { ...input, purchase: { ...input.purchase, expiresAt: NOW - 1 } },
      { ...input, now: NOW + 60_001 },
    ];
    for (const candidate of changed) {
      expect(authorize(candidate)).toMatchObject({
        _tag: "deny",
        code: "approval_denied",
      });
    }
  });

  it("cannot override provenance, expiry, transaction caps, rolling caps, or pocket funds", () => {
    const purchase = grantedPurchase();
    const input = purchaseInput(purchase);
    expect(
      authorize({
        ...input,
        intent: {
          ...input.intent,
          payee: { ...input.intent.payee, provenance: "page" },
        },
      })
    ).toMatchObject({ code: "untrusted_provenance" });
    expect(
      authorize(
        purchaseInput(purchase, [
          { _tag: "expiry", id: rule(), notAfter: NOW - 1 },
        ])
      )
    ).toMatchObject({ code: "expired" });
    expect(
      authorize(
        purchaseInput(purchase, [
          { _tag: "per_tx_cap", id: rule(), maxUsdMicros: micros(9999) },
        ])
      )
    ).toMatchObject({ code: "per_tx_cap_exceeded" });
    expect(
      authorize(
        purchaseInput(purchase, [
          {
            _tag: "window_cap",
            id: rule(),
            maxUsdMicros: micros(9999),
            windowMs: 60_000,
          },
        ])
      )
    ).toMatchObject({ code: "window_cap_exceeded" });
    expect(
      authorize({
        ...input,
        pocket: {
          balanceUsdMicros: 0,
          networks: [input.intent.amount.asset.network],
        },
      })
    ).toMatchObject({ code: "pocket_exhausted" });
  });
});

/**
 * The allowance regime.
 *
 * These are the tests that matter for the claim the product makes: that some
 * things run on a standing signature and some things stop and ask, and that
 * which is which is a property of the *kind* rather than only of the amount.
 */
describe("under a person's own allowance", () => {
  const allowance = defaultAllowance(NOW);

  /** What `defaultRules` writes for an allowance: the four numbers as rules. */
  const allowanceRules = (): Mandate["rules"] => [
    {
      _tag: "per_tx_cap",
      id: rule(),
      maxUsdMicros: allowance.perSpendUsdMicros,
    },
    {
      _tag: "window_cap",
      id: rule(),
      maxUsdMicros: allowance.dailyUsdMicros,
      windowMs: 24 * 60 * 60 * 1000,
    },
    { _tag: "expiry", id: rule(), notAfter: allowance.expiresAt },
    {
      _tag: "approval_threshold",
      id: rule(),
      overUsdMicros: allowance.askOverUsdMicros,
    },
  ];

  const judge = (
    overrides: {
      approved?: boolean;
      intent?: Partial<SpendIntent>;
      recent?: readonly LedgerEntry[];
    } = {}
  ) =>
    authorize({
      allowance,
      approved: overrides.approved ?? false,
      intent: intent(overrides.intent),
      mandate: mandate(allowanceRules()),
      now: NOW,
      recent: overrides.recent ?? [],
    });

  it("lets a small service payment run without asking", () => {
    const decision = judge({
      intent: { kind: "service_payment", usdMicros: micros(50_000) },
    });
    expect(decision._tag).toBe("allow");
  });

  it("asks once a service payment is over the person's line", () => {
    const decision = judge({
      intent: { kind: "service_payment", usdMicros: micros(1_500_000) },
    });
    expect(decision._tag).toBe("ask");
  });

  it("asks for a transfer however small, because the payee is the person's call", () => {
    const decision = judge({
      intent: { kind: "transfer", usdMicros: micros(1) },
    });
    expect(decision._tag).toBe("ask");
    if (decision._tag === "ask") {
      expect(decision.question).toContain(
        "Paying a person is your decision, whatever the amount."
      );
    }
  });

  it("asks from the allowance even when the mandate has no approval_threshold", () => {
    const decision = authorize({
      allowance,
      intent: intent({ kind: "transfer", usdMicros: micros(1) }),
      mandate: mandate(
        allowanceRules().filter((entry) => entry._tag !== "approval_threshold")
      ),
      now: NOW,
      recent: [],
    });
    expect(decision._tag).toBe("ask");
    if (decision._tag === "ask") {
      expect(decision.ruleId).toBeUndefined();
      expect(decision.question).toContain(
        "Paying a person is your decision, whatever the amount."
      );
    }
  });

  it("lets a service payment under askOver run without a threshold rule", () => {
    const decision = authorize({
      allowance,
      intent: intent({ kind: "service_payment", usdMicros: micros(50_000) }),
      mandate: mandate(
        allowanceRules().filter((entry) => entry._tag !== "approval_threshold")
      ),
      now: NOW,
      recent: [],
    });
    expect(decision._tag).toBe("allow");
  });

  it("names a real rule on a kind-driven question", () => {
    // An ask from nowhere is as unactionable as "denied by policy". The rule it
    // names is the person's own approval line, which is what is doing the work.
    const rules = allowanceRules();
    const decision = authorize({
      allowance,
      intent: intent({ kind: "transfer", usdMicros: micros(1) }),
      mandate: mandate(rules),
      now: NOW,
      recent: [],
    });
    if (decision._tag !== "ask") {
      throw new Error("expected an ask");
    }
    expect(rules.some((entry) => entry.id === decision.ruleId)).toBe(true);
  });

  it("does not ask again once the person has approved that exact spend", () => {
    const decision = judge({
      approved: true,
      intent: { kind: "transfer", usdMicros: micros(1) },
    });
    expect(decision._tag).toBe("allow");
  });

  it("does not ask for the nested conversion, which rides an allowed payment", () => {
    const decision = judge({
      intent: { kind: "conversion", usdMicros: micros(500_000) },
    });
    expect(decision._tag).toBe("allow");
  });

  it("would ask for a conversion over the ask line if it were judged alone", () => {
    const decision = judge({
      intent: { kind: "conversion", usdMicros: micros(1_500_000) },
    });
    expect(decision._tag).toBe("ask");
  });

  it("does not ask for a conversion over the ask line once the parent is approved", () => {
    const decision = judge({
      approved: true,
      intent: { kind: "conversion", usdMicros: micros(1_500_000) },
    });
    expect(decision._tag).toBe("allow");
  });

  it("refuses an amount over the kind's own ceiling rather than asking about it", () => {
    // The person allows $2 a spend; a withdraw's own ceiling is $10. The tighter
    // wins, and $3 is nobody's to authorise — so it is a refusal, not a question.
    const decision = judge({
      intent: { kind: "earn_withdraw", usdMicros: micros(3_000_000) },
    });
    expect(decision._tag).toBe("deny");
    if (decision._tag === "deny") {
      expect(decision.code).toBe("per_tx_cap_exceeded");
    }
  });

  it("asks about a spend whose kind was never recorded, rather than allowing it", () => {
    const decision = judge({ intent: { usdMicros: micros(1) } });
    expect(decision._tag).toBe("ask");
  });

  it("still refuses a payee the provenance rule rejects, before ever asking", () => {
    // Order is the contract: provenance comes first, so a page-supplied address
    // is refused outright rather than offered to a person to click through.
    const decision = judge({
      intent: {
        kind: "service_payment",
        payee: payee({ provenance: "page" }),
        usdMicros: micros(1),
      },
    });
    expect(decision._tag).toBe("deny");
    if (decision._tag === "deny") {
      expect(decision.code).toBe("untrusted_provenance");
    }
  });
});

describe("without an allowance, nothing changes", () => {
  it("ignores the kind entirely and obeys the threshold rules alone", () => {
    // The regression that matters: every mandate written before allowances
    // existed must judge exactly as it did, including for a transfer, which
    // under an allowance would always ask.
    const decision = decide(
      [
        {
          _tag: "approval_threshold",
          id: rule(),
          overUsdMicros: micros(1_000_000),
        },
      ],
      { intent: { kind: "transfer", usdMicros: micros(1) } }
    );
    expect(decision._tag).toBe("allow");
  });
});
