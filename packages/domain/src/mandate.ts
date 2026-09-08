/**
 * The mandate: what the agent is allowed to spend, expressed as data.
 *
 * Every rule here is one the market kept asking for (per-tx cap, rolling cap,
 * allowlists, expiry, kill switch) and every one of them is evaluated *outside*
 * the model. A jailbreak can make the model ask for anything; it cannot make
 * `authorize` return `allow`.
 *
 * Rules are a tagged union rather than a flat options bag so a refusal can name
 * the exact rule that produced it. "Denied by policy" is not an answer a person
 * can act on; "denied by rule rul_… — daily cap, $10.00 of $10.00 used" is.
 */

import { Schema } from "effect";

import { Payee } from "./address";
import { MandateId, RuleId, SessionId } from "./id";
import { Amount, Network, usd, UsdMicros } from "./money";

/** The most a single spend may be worth. */
export const PerTxCap = Schema.TaggedStruct("per_tx_cap", {
  id: RuleId,
  maxUsdMicros: UsdMicros,
});

/**
 * The most that may be spent inside a rolling window.
 *
 * Rolling rather than calendar-day: an agent that empties the allowance at
 * 23:59 and again at 00:01 has obeyed a calendar rule and broken the promise
 * the rule was standing in for.
 */
export const WindowCap = Schema.TaggedStruct("window_cap", {
  id: RuleId,
  maxUsdMicros: UsdMicros,
  windowMs: Schema.Int,
});

/** Only these payees may receive money, whatever the model believes. */
export const PayeeAllowlist = Schema.TaggedStruct("payee_allowlist", {
  id: RuleId,
  payeeIds: Schema.Array(Schema.String),
});

/** Only these hosts may be paid for a 402. Matched on host, never on full URL. */
export const HostAllowlist = Schema.TaggedStruct("host_allowlist", {
  id: RuleId,
  hosts: Schema.Array(Schema.String),
});

/** Only these chains. A spend on an unexpected chain is a spend nobody planned. */
export const NetworkAllowlist = Schema.TaggedStruct("network_allowlist", {
  id: RuleId,
  networks: Schema.Array(Network),
});

/** The mandate stops being valid at this instant, with or without a human. */
export const Expiry = Schema.TaggedStruct("expiry", {
  id: RuleId,
  notAfter: Schema.Int,
});

/**
 * Spends at or below this are automatic; above it, a human is asked.
 *
 * This is the line the whole product is arguing about: autonomy for a cent,
 * a human for fifty dollars. Without it you either approve every micropayment
 * (which is the UX people say they do not want) or you approve nothing.
 */
export const ApprovalThreshold = Schema.TaggedStruct("approval_threshold", {
  id: RuleId,
  overUsdMicros: UsdMicros,
});

/**
 * "Allow this payee up to this much, for this session, without asking again."
 *
 * Written by exactly one thing: a person answering an approval card with
 * "allow for this session". The threshold rule stays; this is the record of
 * the exception, scoped to one payee, one ceiling and one expiry, so a later
 * reader can see what was pre-approved and until when.
 */
export const AskExemption = Schema.TaggedStruct("ask_exemption", {
  id: RuleId,
  maxUsdMicros: UsdMicros,
  notAfter: Schema.Int,
  payeeId: Schema.String,
});

export const MandateRule = Schema.Union([
  ApprovalThreshold,
  AskExemption,
  Expiry,
  HostAllowlist,
  NetworkAllowlist,
  PayeeAllowlist,
  PerTxCap,
  WindowCap,
]);
export type MandateRule = typeof MandateRule.Type;

export const Mandate = Schema.Struct({
  createdAt: Schema.Int,
  id: MandateId,
  rules: Schema.Array(MandateRule),
  sessionId: SessionId,
});
export type Mandate = typeof Mandate.Type;

/** What the agent is asking to do, before anyone has agreed to it. */
export const SpendIntent = Schema.Struct({
  amount: Amount,
  /**
   * Set for a 402. The host is what the allowlist matches, so it is carried
   * separately rather than re-parsed out of a URL at decision time.
   */
  host: Schema.optional(Schema.String),
  /**
   * Stable across retries of the same logical spend. Tool calls get retried —
   * by the SDK, by a reconnect, by a model that did not see the result — and
   * without this a retry is a second payment.
   */
  idempotencyKey: Schema.String,
  payee: Payee,
  purpose: Schema.String,
  /** Priced at decision time; the quote that produced it lands on the receipt. */
  usdMicros: UsdMicros,
});
export type SpendIntent = typeof SpendIntent.Type;

/** Machine-readable refusal reasons. The UI renders these; logs group by them. */
export const DenialCode = Schema.Literals([
  "frozen",
  "expired",
  "per_tx_cap_exceeded",
  "window_cap_exceeded",
  "payee_not_allowed",
  "host_not_allowed",
  "network_not_allowed",
  "untrusted_provenance",
  "unpriceable",
  /** The pocket the host pays from does not hold enough. A top-up fixes it. */
  "pocket_exhausted",
  /**
   * The pocket was short and converting the person's USDC into HBAR did not
   * happen. The message names who refused: the signer, the chain, or the
   * balance itself.
   */
  "conversion_failed",
  "run_budget_exceeded",
  "price_changed",
  /** The policy asked, and the person said no. */
  "approval_denied",
  /** The policy asked, and nobody answered in time. */
  "approval_timeout",
  /** The policy asked, and there was no one to ask. */
  "approval_unavailable",
]);
export type DenialCode = typeof DenialCode.Type;

export const Allow = Schema.TaggedStruct("allow", {
  /** Rules that were checked and passed, so an allow is as auditable as a deny. */
  satisfied: Schema.Array(RuleId),
});

export const Deny = Schema.TaggedStruct("deny", {
  code: DenialCode,
  /** Plain sentence for the human. Never the only record — `code` is the record. */
  message: Schema.String,
  /** Absent only for `unpriceable`, and for `frozen` on receipts written before the kill switch was removed. */
  ruleId: Schema.optional(RuleId),
});

/**
 * Within the mandate, but above the threshold: park the turn and ask.
 *
 * Deliberately a third outcome rather than a deny the model can retry around.
 * A model that can turn "ask a human" into "try again differently" has removed
 * the human from the loop by persistence.
 */
export const Ask = Schema.TaggedStruct("ask", {
  question: Schema.String,
  ruleId: RuleId,
});

export const PolicyDecision = Schema.Union([Allow, Ask, Deny]);
export type PolicyDecision = typeof PolicyDecision.Type;

/**
 * The mandate a new session starts with.
 *
 * Allowlists only, unless the deployment keeps spending limits on. Restraint
 * lives in three other places: the payee and host allowlists here, the
 * provenance rule that never lets a page-supplied address reach a key, and
 * Privy's own policy on the signer. Caps and the approval threshold are the
 * "advanced settings" of a later iteration; a deployment that turns
 * `limits` on gets the same seven rules it always had.
 *
 * `payeeIds` starts empty and is filled by the server when it mints its own
 * oracle `payTo`, so there is no moment where an allowlist exists but means
 * nothing.
 */
export const defaultRules = (params: {
  readonly hosts: readonly string[];
  readonly ids: () => RuleId;
  /** Caps, an expiry and an approval threshold, when the deployment keeps them. */
  readonly limits: boolean;
  readonly now: number;
  readonly payeeIds: readonly string[];
}): readonly MandateRule[] => {
  const allowlists: readonly MandateRule[] = [
    { _tag: "payee_allowlist", id: params.ids(), payeeIds: params.payeeIds },
    { _tag: "host_allowlist", hosts: params.hosts, id: params.ids() },
    {
      _tag: "network_allowlist",
      id: params.ids(),
      networks: [
        "eip155:8453",
        "eip155:84532",
        "hedera:mainnet",
        "hedera:testnet",
      ],
    },
  ];
  if (!params.limits) {
    return allowlists;
  }
  return [
    {
      _tag: "per_tx_cap",
      id: params.ids(),
      maxUsdMicros: usd(2),
    },
    {
      _tag: "window_cap",
      id: params.ids(),
      maxUsdMicros: usd(10),
      windowMs: 24 * 60 * 60 * 1000,
    },
    ...allowlists,
    {
      _tag: "expiry",
      id: params.ids(),
      notAfter: params.now + 24 * 60 * 60 * 1000,
    },
    {
      _tag: "approval_threshold",
      id: params.ids(),
      overUsdMicros: usd(1),
    },
  ];
};

/** The rules a deployment without spending limits strips from any mandate. */
export const LIMIT_RULES: ReadonlySet<MandateRule["_tag"]> = new Set([
  "per_tx_cap",
  "window_cap",
  "expiry",
  "approval_threshold",
]);

/** The mandate without its limits; the same object when there were none. */
export const withoutLimits = (mandate: Mandate): Mandate =>
  mandate.rules.some((rule) => LIMIT_RULES.has(rule._tag))
    ? {
        ...mandate,
        rules: mandate.rules.filter((rule) => !LIMIT_RULES.has(rule._tag)),
      }
    : mandate;
