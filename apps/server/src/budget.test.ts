import { describe, expect, test } from "bun:test";

import { userId } from "@froggy/domain";

import { ModelBudget, ModelBudgetExhaustedError } from "./budget";

const ALICE = userId("did:privy:budget-alice");
const JUDGE = userId("did:privy:budget-judge");
/** 2026-09-06 12:00 UTC. */
const NOON = Date.UTC(2026, 8, 6, 12);

const budgetAt = (clock: { at: number }, runsPerDay = 2, stepsPerDay = 3) =>
  new ModelBudget({
    exempt: JUDGE,
    now: () => clock.at,
    runsPerDay,
    stepsPerDay,
  });

describe("ModelBudget", () => {
  test("lets the day's turns through and refuses the one after, saying when it resets", () => {
    const budget = budgetAt({ at: NOON });
    budget.begin(ALICE);
    budget.begin(ALICE);

    let refusal: Error | null = null;
    try {
      budget.begin(ALICE);
    } catch (error) {
      refusal = error instanceof Error ? error : null;
    }
    expect(refusal).toBeInstanceOf(ModelBudgetExhaustedError);
    expect(refusal?.message).toContain("2 turns");
    expect(refusal?.message).toContain("12 hours");
  });

  test("stops a turn once the day's steps are spent", () => {
    const budget = budgetAt({ at: NOON });
    budget.begin(ALICE);
    expect(budget.exhausted(ALICE)).toBe(false);
    budget.step(ALICE);
    budget.step(ALICE);
    expect(budget.exhausted(ALICE)).toBe(false);
    budget.step(ALICE);
    expect(budget.exhausted(ALICE)).toBe(true);
  });

  test("forgets yesterday", () => {
    const clock = { at: NOON };
    const budget = budgetAt(clock);
    budget.begin(ALICE);
    budget.begin(ALICE);
    clock.at = NOON + 24 * 60 * 60 * 1000;

    expect(() => {
      budget.begin(ALICE);
    }).not.toThrow();
    expect(budget.usageOf(ALICE)).toEqual({
      day: "2026-09-07",
      runs: 1,
      steps: 0,
    });
  });

  test("never refuses the exempt account", () => {
    const budget = budgetAt({ at: NOON }, 0, 0);
    expect(() => {
      budget.begin(JUDGE);
    }).not.toThrow();
    budget.step(JUDGE);
    expect(budget.exhausted(JUDGE)).toBe(false);
    // And the same ceilings do bite everyone else.
    expect(() => {
      budget.begin(ALICE);
    }).toThrow(ModelBudgetExhaustedError);
  });
});
