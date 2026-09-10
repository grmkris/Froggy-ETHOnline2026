import { describe, expect, it } from "bun:test";

import {
  ActionKind,
  authorityFor,
  ceilingFor,
  defaultAllowance,
  needsPerson,
  STANDING_AUTHORITY,
} from "./authority";
import { usd } from "./money";

const NOW = 1_789_000_000_000;
const ALLOWANCE = defaultAllowance(NOW);

describe("the authority table", () => {
  it("names every kind exactly once, so a kind cannot have two answers", () => {
    const kinds = STANDING_AUTHORITY.map((entry) => entry.kind);
    expect([...new Set(kinds)]).toHaveLength(kinds.length);
    expect(kinds.toSorted()).toEqual([...ActionKind.literals].toSorted());
  });

  it("gives every row a reason, because the person is shown this", () => {
    for (const entry of STANDING_AUTHORITY) {
      expect(entry.because.length).toBeGreaterThan(0);
    }
  });
});

describe("needsPerson", () => {
  it("lets a small service payment run without asking", () => {
    expect(needsPerson("service_payment", usd(0.05), ALLOWANCE)).toBe(false);
  });

  it("asks once a service payment is over the person's line", () => {
    expect(needsPerson("service_payment", usd(1.01), ALLOWANCE)).toBe(true);
  });

  it("asks for a transfer however small, because the payee is the person's call", () => {
    expect(needsPerson("transfer", 1, ALLOWANCE)).toBe(true);
  });

  it("does not ask for the conversion, which is nested in an allowed payment", () => {
    expect(needsPerson("conversion", usd(0.5), ALLOWANCE)).toBe(false);
  });

  it("asks for an unknown kind rather than assuming it may run", () => {
    // SAFETY: reaching past the union on purpose. The behaviour under test is
    // what happens when a kind has no row, which by construction cannot be
    // expressed by a well-typed caller — and is exactly the case that must fail
    // closed if someone adds a money path and forgets the table.
    const unknown = "not_a_kind_yet" as ActionKind;
    expect(authorityFor(unknown)).toBeNull();
    expect(needsPerson(unknown, 1, ALLOWANCE)).toBe(true);
  });
});

describe("ceilingFor", () => {
  it("uses the person's cap when the kind carries none", () => {
    expect(ceilingFor("service_payment", ALLOWANCE)).toBe(usd(2));
  });

  it("takes the tighter of the two, never the looser", () => {
    // The kind allows $10 a withdraw, the person allows $2 a spend.
    expect(ceilingFor("earn_withdraw", ALLOWANCE)).toBe(usd(2));
    const generous = { ...ALLOWANCE, perSpendUsdMicros: usd(50) };
    expect(ceilingFor("earn_withdraw", generous)).toBe(usd(10));
  });

  it("has no ceiling to offer for a kind with no row", () => {
    // SAFETY: as above — the unrepresentable case is the one worth testing.
    const unknown = "not_a_kind_yet" as ActionKind;
    expect(ceilingFor(unknown, ALLOWANCE)).toBeNull();
  });
});

describe("defaultAllowance", () => {
  it("expires thirty days out, which is Privy's own ceiling for a session", () => {
    expect(ALLOWANCE.expiresAt - NOW).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
