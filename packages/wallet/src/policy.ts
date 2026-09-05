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

import { isPayable, normalizePayeeId, formatUsd } from "@froggy/domain";
import type {
  DenialCode,
  Mandate,
  MandateRule,
  PolicyDecision,
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
   * A person has already answered "yes" to this exact intent.
   *
   * Only the threshold step reads it: an approval satisfies "is this big
   * enough to want a human", and nothing else. Every cap, allowlist and the
   * kill switch are judged again, so a wallet frozen while the card was open
   * still refuses.
   */
  readonly approved?: boolean;
  readonly intent: SpendIntent;
  readonly mandate: Mandate;
  readonly now: number;
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

export const authorize = (input: AuthorizeInput): PolicyDecision => {
  const { intent, mandate, now, recent } = input;
  const satisfied: RuleId[] = [];

  // 1. The kill switch. Before everything, and not rule-shaped: freezing is a
  //    property of the mandate itself, so there is no rule to delete to undo it.
  if (mandate.frozen) {
    return deny(
      "frozen",
      "The wallet is frozen. Unfreeze it in the wallet pane to allow spending again."
    );
  }

  // 2. Where the payee came from. A well-formed address is not a trusted one:
  //    this is the check that stops an address a page suggested from being paid.
  if (!isPayable(intent.payee.provenance)) {
    return deny(
      "untrusted_provenance",
      `Refusing to pay ${intent.payee.id}: it came from ${intent.payee.provenance === "page" ? "page content" : "the model"}, not from you, your allowlist or this server. Type the address yourself, or add it to the mandate, if you meant it.`
    );
  }

  for (const rule of rulesOfKind(mandate, "expiry")) {
    if (now > rule.notAfter) {
      return deny("expired", "This mandate has expired.", rule.id);
    }
    satisfied.push(rule.id);
  }

  for (const rule of rulesOfKind(mandate, "network_allowlist")) {
    if (!rule.networks.includes(intent.amount.asset.network)) {
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
    if (intent.payee.provenance === "user") {
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
      if (!hostAllowed(intent.host, rule.hosts)) {
        return deny(
          "host_not_allowed",
          `${intent.host} is not on the paid-host allowlist.`,
          rule.id
        );
      }
      satisfied.push(rule.id);
    }
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

  // 3. Last: the human's line.
  const ask = threshold(input, satisfied);
  if (ask !== null) {
    return ask;
  }

  return { _tag: "allow", satisfied };
};
