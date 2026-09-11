/**
 * The one list: which money-moving actions run on a standing signature, and
 * which stop and ask the person.
 *
 * Until now that boundary was one number compared in one place — the mandate's
 * `approval_threshold` — while *what kind of thing was being paid for* was
 * inferred from the shape of the intent: a `host` meant a 402, an idempotency
 * key beginning `convert:` meant the just-in-time conversion, anything else was
 * a transfer. Three files sniffed for those, and none of them agreed on where
 * the list of kinds was. A rule that lives in three inferences is not a rule
 * anybody can read, and it is not one a person can be shown.
 *
 * So the kinds are named here, once, and every consumer reads this table:
 *
 *   - The person's Privy policy. A `standing` kind becomes an ALLOW rule with
 *     the person's own cap; an `ask` kind gets **no rule at all**, so Privy's
 *     default-deny refuses it and no standing signature can ever reach it.
 *   - The person's mandate. The same four numbers become `per_tx_cap`,
 *     `window_cap`, `expiry` and `approval_threshold`, so our own engine holds
 *     the identical ceiling synchronously and a Privy outage can never widen
 *     what the agent may spend.
 *   - `authorize`, which looks a kind up here instead of inferring it.
 *     As of 11 September 2026 the server does not yet pass it the allowance,
 *     so at HEAD this table binds through the Privy rules only; decision 0019
 *     records the gap and the change that closes it.
 *
 * This module is deliberately inert: data and two total functions over it, no
 * clock, no I/O and nothing importable from a tool. `packages/domain` is a leaf
 * (see the root `AGENTS.md`) and this is the part of it a person is shown, so
 * it must stay readable by someone who does not know the codebase.
 */

import { Schema } from "effect";

import { UsdMicros, usd, usdMicros } from "./money";

/**
 * What the money is for. Not how it is signed — two kinds can share a signing
 * method and still belong on opposite sides of the line.
 */
export const ActionKind = Schema.Literals([
  /** Paying a seller's 402. The thing the agent exists to do. */
  "service_payment",
  /** USDC to HBAR, only ever nested inside a payment already allowed. */
  "conversion",
  /** Moving idle balance into a vault. */
  "earn_deposit",
  /** Taking it back out, including the just-in-time withdraw before a purchase. */
  "earn_withdraw",
  /** Paying a person. Never the agent's decision, whatever the amount. */
  "transfer",
  /** The trading engine's own authority, judged elsewhere; named so it is not forgotten. */
  "trade",
]);
export type ActionKind = typeof ActionKind.Type;

/** Which side of the line a kind sits on, before any amount is considered. */
export const AuthoritySide = Schema.Literals(["standing", "ask"]);
export type AuthoritySide = typeof AuthoritySide.Type;

export interface ActionAuthority {
  readonly kind: ActionKind;
  /**
   * `standing` still respects the person's caps; it means "no human is asked
   * *because of what this is*". `ask` means a human is asked however small it
   * is, because the decision itself is not the agent's to make.
   */
  readonly side: AuthoritySide;
  /**
   * A ceiling this kind carries on top of the person's per-spend cap, or null
   * when the person's cap is the only one. The tighter of the two always wins.
   */
  readonly perRequestUsdMicros: UsdMicros | null;
  /** Why it sits where it sits, in one sentence, for the person and the reader. */
  readonly because: string;
}

/**
 * The table. Adding a money-moving path means adding a row here first; there is
 * nowhere else that decides this, and a kind with no row is refused rather than
 * assumed to be standing (see `authorityFor`).
 */
export const STANDING_AUTHORITY: readonly ActionAuthority[] = [
  {
    because: "Buying a service is what the agent is for, under your cap.",
    kind: "service_payment",
    perRequestUsdMicros: null,
    side: "standing",
  },
  {
    because:
      "Converting to gas happens inside a payment you already allowed, never on its own.",
    kind: "conversion",
    perRequestUsdMicros: null,
    side: "standing",
  },
  {
    because: "Moving idle money into the vault pays nobody and can be undone.",
    kind: "earn_deposit",
    perRequestUsdMicros: usd(25),
    side: "standing",
  },
  {
    because: "Taking your own money back out of the vault pays nobody.",
    kind: "earn_withdraw",
    perRequestUsdMicros: usd(10),
    side: "standing",
  },
  {
    because: "Paying a person is your decision, whatever the amount.",
    kind: "transfer",
    perRequestUsdMicros: null,
    side: "ask",
  },
  {
    because:
      "A trade is judged by its own rule or by you, never by this table.",
    kind: "trade",
    perRequestUsdMicros: null,
    side: "ask",
  },
];

/**
 * The row for a kind.
 *
 * Returns null rather than a default when a kind has no row, so a path added
 * without a row is refused by its caller instead of quietly inheriting the most
 * permissive behaviour. A missing leash must never fail open.
 */
export const authorityFor = (kind: ActionKind): ActionAuthority | null =>
  STANDING_AUTHORITY.find((entry) => entry.kind === kind) ?? null;

/**
 * What the person chose: the four numbers their policy and their mandate are
 * both built from.
 *
 * One shape, so the Privy rules and the mandate rules cannot drift apart — the
 * failure this whole design exists to prevent is a leash that is tighter in the
 * screen than it is in the signer.
 */
export const Allowance = Schema.Struct({
  /** Above this, a human is asked, whatever the kind. */
  askOverUsdMicros: UsdMicros,
  /** The rolling 24-hour ceiling. Ours to enforce: Privy cannot group by wallet. */
  dailyUsdMicros: UsdMicros,
  /** Unix milliseconds. After this the policy allows nothing and so does the mandate. */
  expiresAt: Schema.Int,
  /** The most any single spend may be worth. */
  perSpendUsdMicros: UsdMicros,
});
export type Allowance = typeof Allowance.Type;

/** How long a grant lasts unless the person says otherwise. Privy's own ceiling. */
export const GRANT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The numbers a person gets if they just tap Allow. */
export const defaultAllowance = (now: number): Allowance => ({
  askOverUsdMicros: usd(1),
  dailyUsdMicros: usd(10),
  expiresAt: now + GRANT_DAYS * DAY_MS,
  perSpendUsdMicros: usd(2),
});

/**
 * The effective ceiling for one spend of one kind: the tighter of the person's
 * cap and the kind's own, never the looser.
 */
export const ceilingFor = (
  kind: ActionKind,
  allowance: Allowance
): UsdMicros | null => {
  const authority = authorityFor(kind);
  if (authority === null) {
    return null;
  }
  return authority.perRequestUsdMicros === null
    ? allowance.perSpendUsdMicros
    : usdMicros(
        Math.min(authority.perRequestUsdMicros, allowance.perSpendUsdMicros)
      );
};

/**
 * Does this spend need a human?
 *
 * Two independent reasons, and either is enough: the kind is one a person
 * decides, or the amount is over the line the person drew. An unknown kind
 * needs a human, because the alternative is a path that authorises itself.
 */
export const needsPerson = (
  kind: ActionKind,
  amountUsdMicros: number,
  allowance: Allowance
): boolean => {
  const authority = authorityFor(kind);
  return (
    authority === null ||
    authority.side === "ask" ||
    amountUsdMicros > allowance.askOverUsdMicros
  );
};
