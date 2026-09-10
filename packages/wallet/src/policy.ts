/**
 * The policy engine. One function decides whether money may move.
 *
 * `authorize` is pure: mandate in, spend history in, decision out. No I/O, no
 * clock of its own, no model. That is what makes the jailbreak demo honest —
 * the refusal is a value computed from data, and there is no prompt anywhere in
 * this file for an attacker to talk to.
 *
 * Order of evaluation is part of the contract, not an implementation detail.
 * The kill switch is checked before anything else, provenance before caps, and
 * the approval threshold last — so a spend that is over the human-approval line
 * *and* outside the allowlist is refused outright rather than being offered to
 * the human as a decision they might click through.
 */

import {
  ceilingFor,
  formatUsd,
  isPayable,
  needsPerson,
  normalizePayeeId,
} from "@froggy/domain";
import type {
  Allowance,
  DenialCode,
  Mandate,
  MandateRule,
  Network,
  PolicyDecision,
  Purchase,
  PurchaseGrant,
  PurchaseQuote,
  RuleId,
  SpendIntent,
} from "@froggy/domain";

/** A spend that already happened, for the rolling-window arithmetic. */
export interface LedgerEntry {
  readonly at: number;
  readonly usdMicros: number;
}

export interface AuthorizeInput {
  /**
   * The person's own numbers, when they have granted under their own policy.
   *
   * Present, the human line is drawn by `STANDING_AUTHORITY` and this
   * allowance: some kinds ask however small they are, because the decision is
   * the person's rather than the agent's. Absent — which is every spend until a
   * person has an allowance — the `approval_threshold` rules decide exactly as
   * they always have, so nothing changes for a mandate written before this.
   */
  readonly allowance?: Allowance | null;
  /** Loaded by the server from this person's store, never from a tool argument. */
  readonly purchase?: Purchase | null;
  /**
   * A person has already answered "yes" to this exact intent.
   *
   * Only the threshold step reads it: an approval satisfies "is this big
   * enough to want a human", and nothing else. Every cap, allowlist and the
   * answer are judged again, so a mandate edited while the card was open
   * still refuses.
   */
  readonly approved?: boolean;
  readonly intent: SpendIntent;
  readonly mandate: Mandate;
  readonly now: number;
  /**
   * The person's pocket: their share of the host account that pays these
   * networks. A spend on one of them must fit in the balance. Spends on any
   * other network come from the person's own wallet and are not this
   * balance's business. Absent when nothing is drawn from a pocket.
   */
  readonly pocket?: {
    readonly balanceUsdMicros: number;
    readonly networks: readonly Network[];
  };
  /** Reserved and settled spends. Refused ones must not count against the cap. */
  readonly recent: readonly LedgerEntry[];
}

const deny = (
  code: DenialCode,
  message: string,
  ruleId?: RuleId
): PolicyDecision =>
  ruleId === undefined
    ? { _tag: "deny", code, message }
    : { _tag: "deny", code, message, ruleId };

const rulesOfKind = <K extends MandateRule["_tag"]>(
  mandate: Mandate,
  kind: K
): Extract<MandateRule, { _tag: K }>[] =>
  mandate.rules.filter(
    (rule): rule is Extract<MandateRule, { _tag: K }> => rule._tag === kind
  );

/**
 * Host matching is exact or a single-label suffix, never a substring.
 *
 * A substring check would let `evil-oracle.example.com.attacker.test` satisfy an
 * allowlist entry of `oracle.example.com`, which is a classic and completely
 * silent bypass.
 */
const hostAllowed = (host: string, allowed: readonly string[]): boolean => {
  const candidate = host.toLowerCase();
  return allowed.some((entry) => {
    const target = entry.toLowerCase();
    return candidate === target || candidate.endsWith(`.${target}`);
  });
};

/**
 * An unexpired "allow for this session" that covers this payee at this size.
 *
 * Scoped three ways on purpose. A person who said yes to fifty cents to one
 * host has not said yes to five dollars, nor to a different host, nor to the
 * same host tomorrow.
 */
const exempted = (
  intent: SpendIntent,
  mandate: Mandate,
  now: number
): RuleId | null => {
  const payeeId = normalizePayeeId(intent.payee.id);
  for (const rule of rulesOfKind(mandate, "ask_exemption")) {
    if (
      now <= rule.notAfter &&
      normalizePayeeId(rule.payeeId) === payeeId &&
      intent.usdMicros <= rule.maxUsdMicros
    ) {
      return rule.id;
    }
  }
  return null;
};

/**
 * Step 3: within every limit, but is it big enough to want a human?
 *
 * Returns the `ask` when it is, else null with the satisfied rules appended.
 * Deliberately after the caps, so "ask" is only ever offered for a spend that
 * would otherwise have been allowed.
 */
/**
 * The rule a kind-driven question is attributed to.
 *
 * An ask must always name the rule that produced it — "denied by policy" is not
 * something a person can act on, and neither is a question from nowhere. A
 * kind-driven ask *is* the person's approval line doing its job, so it carries
 * that rule's id. An allowance always writes one (`defaultRules`), so null here
 * means a mandate that predates the allowance, and the caller falls back to the
 * numeric threshold rather than inventing an id.
 */
const askRuleId = (mandate: Mandate): RuleId | null =>
  rulesOfKind(mandate, "approval_threshold")[0]?.id ?? null;

/**
 * Under an allowance: does the *kind* of this spend need a person, whatever the
 * `approval_threshold` rules say?
 *
 * An approval the person already gave for this exact intent settles it, and so
 * does an unexpired "allow for this session" — otherwise a person who said yes
 * would be asked again for the same thing, which is how an approval flow
 * becomes noise people click through.
 */
const kindNeedsPerson = (
  input: AuthorizeInput,
  allowance: Allowance
): boolean => {
  const { intent, mandate, now } = input;
  if (input.approved === true || exempted(intent, mandate, now) !== null) {
    return false;
  }
  // No kind means a spend built before kinds existed. Ask, rather than assume.
  return (
    intent.kind === undefined ||
    needsPerson(intent.kind, intent.usdMicros, allowance)
  );
};

const threshold = (
  input: AuthorizeInput,
  satisfied: RuleId[]
): PolicyDecision | null => {
  const { intent, mandate, now } = input;
  for (const rule of rulesOfKind(mandate, "approval_threshold")) {
    if (intent.usdMicros > rule.overUsdMicros) {
      if (input.approved === true) {
        satisfied.push(rule.id);
        continue;
      }
      const exemption = exempted(intent, mandate, now);
      if (exemption !== null) {
        satisfied.push(rule.id, exemption);
        continue;
      }
      return {
        _tag: "ask",
        question: `Approve ${formatUsd(intent.usdMicros)} to ${intent.payee.label}? (${intent.purpose})`,
        ruleId: rule.id,
      };
    }
    satisfied.push(rule.id);
  }
  return null;
};

/**
 * The pocket, after the caps and before the human: an allowance the person
 * has not topped up is not a question for them to answer, it is a fact.
 * Null when there is no pocket for this network or it covers the spend.
 */
const pocketShortfall = (input: AuthorizeInput): PolicyDecision | null => {
  const { intent, pocket } = input;
  if (
    pocket === undefined ||
    !pocket.networks.includes(intent.amount.asset.network) ||
    intent.usdMicros <= pocket.balanceUsdMicros
  ) {
    return null;
  }
  return deny(
    "pocket_exhausted",
    `${formatUsd(intent.usdMicros)} is more than the ${formatUsd(pocket.balanceUsdMicros)} left in the pocket. Top it up to continue.`
  );
};

const matchesPurchasePayment = (
  intent: SpendIntent,
  quote: PurchaseQuote
): boolean =>
  !(
    normalizePayeeId(intent.payee.id) !== normalizePayeeId(quote.payTo) ||
    intent.amount.asset.network !== quote.amount.asset.network ||
    normalizePayeeId(intent.amount.asset.id) !==
      normalizePayeeId(quote.amount.asset.id) ||
    intent.amount.asset.decimals !== quote.amount.asset.decimals ||
    intent.amount.asset.symbol !== quote.amount.asset.symbol ||
    intent.amount.units !== quote.amount.units ||
    intent.host !== new URL(quote.origin).host
  );

interface GrantedPurchase extends Purchase {
  readonly grant: PurchaseGrant;
  readonly quote: PurchaseQuote;
}

/** A grant covers one immutable request/offer and the ledger key of that purchase. */
const permittedPurchase = (input: AuthorizeInput): GrantedPurchase | null => {
  const { intent, purchase, now } = input;
  const context = intent.purchase;
  const grant = purchase?.grant;
  const quote = purchase?.quote;
  if (
    !context ||
    !purchase ||
    !grant ||
    !quote ||
    purchase.status !== "paying" ||
    !URL.canParse(quote.origin)
  ) {
    return null;
  }
  if (
    context.id !== purchase.id ||
    purchase.approvalId !== grant.approvalId ||
    now > purchase.expiresAt ||
    intent.idempotencyKey !== `purchase:${purchase.id}` ||
    context.requestFingerprint !== purchase.requestFingerprint ||
    context.requestFingerprint !== grant.requestFingerprint ||
    context.quoteFingerprint !== quote.fingerprint ||
    context.quoteFingerprint !== grant.quoteFingerprint ||
    now > grant.expiresAt ||
    grant.grantedAt > now ||
    !matchesPurchasePayment(intent, quote)
  ) {
    return null;
  }
  return { ...purchase, grant, quote };
};

const checkAllowlists = (
  input: AuthorizeInput,
  purchase: Purchase | null,
  satisfied: RuleId[]
): PolicyDecision | null => {
  const { intent, mandate } = input;
  for (const rule of rulesOfKind(mandate, "network_allowlist")) {
    if (
      purchase === null &&
      !rule.networks.includes(intent.amount.asset.network)
    ) {
      return deny(
        "network_not_allowed",
        `${intent.amount.asset.network} is not in this mandate's network allowlist.`,
        rule.id
      );
    }
    satisfied.push(rule.id);
  }

  for (const rule of rulesOfKind(mandate, "payee_allowlist")) {
    // An address the person typed this turn is theirs to pay. The allowlist
    // is for payees the server or a 402 proposed; a person naming a payee is
    // the act the allowlist stands in for. Every cap below still applies, and
    // so does the signer's own policy — Privy is the outer leash, and a typed
    // address it has no rule for is refused there, in its words.
    if (purchase !== null || intent.payee.provenance === "user") {
      satisfied.push(rule.id);
      continue;
    }
    const allowed = rule.payeeIds.map(normalizePayeeId);
    if (!allowed.includes(normalizePayeeId(intent.payee.id))) {
      return deny(
        "payee_not_allowed",
        `${intent.payee.id} is not on the payee allowlist.`,
        rule.id
      );
    }
    satisfied.push(rule.id);
  }

  if (intent.host !== undefined) {
    for (const rule of rulesOfKind(mandate, "host_allowlist")) {
      if (purchase === null && !hostAllowed(intent.host, rule.hosts)) {
        return deny(
          "host_not_allowed",
          `${intent.host} is not on the paid-host allowlist.`,
          rule.id
        );
      }
      satisfied.push(rule.id);
    }
  }

  return null;
};

/**
 * A ceiling the *kind* carries, tighter than the person's per-spend cap — a
 * sweep into a vault is capped whatever a purchase is allowed to cost.
 *
 * Checked with the other caps and before anyone is asked: an amount nobody may
 * authorise is a refusal, not a question to put in front of a person.
 */
const kindCeiling = (input: AuthorizeInput): PolicyDecision | null => {
  const { allowance, intent } = input;
  if (
    allowance === undefined ||
    allowance === null ||
    intent.kind === undefined
  ) {
    return null;
  }
  const ceiling = ceilingFor(intent.kind, allowance);
  if (ceiling === null || intent.usdMicros <= ceiling) {
    return null;
  }
  return deny(
    "per_tx_cap_exceeded",
    `${formatUsd(intent.usdMicros)} is over the ${formatUsd(ceiling)} limit for ${intent.kind.replace("_", " ")}.`
  );
};

/**
 * Whether to stop and ask, under either regime.
 *
 * With an allowance the *kind* can demand a person however small the amount is
 * — paying a person is their decision, not a number to clear — so that is asked
 * first and the numeric threshold is the fallback. Without one, this is exactly
 * the behaviour that was here before: the `approval_threshold` rules decide.
 */
const humanLine = (
  input: AuthorizeInput,
  boundPurchase: boolean,
  satisfied: RuleId[]
): PolicyDecision | null => {
  const { allowance, intent, mandate } = input;
  const approved = input.approved === true || boundPurchase;
  const askRule = askRuleId(mandate);
  if (
    allowance !== undefined &&
    allowance !== null &&
    askRule !== null &&
    !approved &&
    kindNeedsPerson(input, allowance)
  ) {
    return {
      _tag: "ask",
      question: `Approve ${formatUsd(intent.usdMicros)} to ${intent.payee.label}? (${intent.purpose})`,
      ruleId: askRule,
    };
  }
  return threshold({ ...input, approved }, satisfied);
};

export const authorize = (input: AuthorizeInput): PolicyDecision => {
  const { intent, mandate, now, recent } = input;
  const satisfied: RuleId[] = [];
  const purchase = permittedPurchase(input);

  // 2. Where the payee came from. A well-formed address is not a trusted one:
  //    this is the check that stops an address a page suggested from being paid.
  if (!isPayable(intent.payee.provenance)) {
    return deny(
      "untrusted_provenance",
      `Refusing to pay ${intent.payee.id}: it came from ${intent.payee.provenance === "page" ? "page content" : "the model"}, not from you, your allowlist or this server. Type the address yourself, or add it to the mandate, if you meant it.`
    );
  }

  if (intent.purchase !== undefined && purchase === null) {
    return deny(
      "approval_denied",
      "This purchase has no current permission matching its exact request and payment offer."
    );
  }
  if (purchase !== null) {
    if (
      intent.usdMicros >
      Math.min(purchase.maxUsdMicros, purchase.quote.usdMicros)
    ) {
      return deny(
        "per_tx_cap_exceeded",
        "The purchase exceeds its approved spending ceiling.",
        purchase.grant.ruleId
      );
    }
    satisfied.push(purchase.grant.ruleId);
  }

  for (const rule of rulesOfKind(mandate, "expiry")) {
    if (now > rule.notAfter) {
      return deny("expired", "This mandate has expired.", rule.id);
    }
    satisfied.push(rule.id);
  }

  const allowlistDecision = checkAllowlists(input, purchase, satisfied);
  if (allowlistDecision !== null) {
    return allowlistDecision;
  }

  for (const rule of rulesOfKind(mandate, "per_tx_cap")) {
    if (intent.usdMicros > rule.maxUsdMicros) {
      return deny(
        "per_tx_cap_exceeded",
        `${formatUsd(intent.usdMicros)} is over the ${formatUsd(rule.maxUsdMicros)} per-transaction cap.`,
        rule.id
      );
    }
    satisfied.push(rule.id);
  }

  for (const rule of rulesOfKind(mandate, "window_cap")) {
    const since = now - rule.windowMs;
    const spent = recent
      .filter((entry) => entry.at >= since)
      .reduce((total, entry) => total + entry.usdMicros, 0);
    if (spent + intent.usdMicros > rule.maxUsdMicros) {
      return deny(
        "window_cap_exceeded",
        `${formatUsd(intent.usdMicros)} would exceed the ${formatUsd(rule.maxUsdMicros)} rolling cap — ${formatUsd(spent)} already spent in the window.`,
        rule.id
      );
    }
    satisfied.push(rule.id);
  }

  const overKind = kindCeiling(input);
  if (overKind !== null) {
    return overKind;
  }

  const shortfall = pocketShortfall(input);
  if (shortfall !== null) {
    return shortfall;
  }

  // 3. Last: the human's line.
  const ask = humanLine(input, purchase !== null, satisfied);
  if (ask !== null) {
    return ask;
  }

  return { _tag: "allow", satisfied };
};
