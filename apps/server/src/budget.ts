/**
 * The model budget: how many turns and steps one person may burn in a day.
 *
 * The model key is the one credential a stranger can spend without moving
 * money — every turn costs tokens whether or not it pays anyone. The mandate
 * caps the money; this caps the words. Two ceilings, both per person and per
 * UTC day: turns started, and steps taken across them. The demo account is
 * exempt, because a judge mid-recording must never be told to come back
 * tomorrow.
 *
 * Kept in memory on purpose. A redeploy forgets the counts, which at worst
 * hands everyone one more day's allowance; a budget whose job is to stop a
 * shared link from draining the key overnight does not need to survive the
 * process that would have been drained.
 */

import type { UserId } from "@froggy/domain";

export interface ModelBudgetOptions {
  /** Never refused: the account a judge or the demo uses. */
  readonly exempt: UserId | null;
  readonly now?: () => number;
  readonly runsPerDay: number;
  readonly stepsPerDay: number;
}

export interface ModelBudgetUsage {
  readonly day: string;
  readonly runs: number;
  readonly steps: number;
}

/** The turn was not started. The message is for the person. */
export class ModelBudgetExhaustedError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ModelBudgetExhaustedError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `2026-09-06`: the UTC calendar day, the unit the budget resets on. */
const dayOf = (at: number): string => new Date(at).toISOString().slice(0, 10);

export class ModelBudget {
  private readonly options: ModelBudgetOptions;
  private readonly now: () => number;
  private readonly usage = new Map<UserId, ModelBudgetUsage>();

  constructor(options: ModelBudgetOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  /** Today's counts for this person, with yesterday's forgotten. */
  usageOf(userId: UserId): ModelBudgetUsage {
    const day = dayOf(this.now());
    const current = this.usage.get(userId);
    if (current !== undefined && current.day === day) {
      return current;
    }
    const fresh: ModelBudgetUsage = { day, runs: 0, steps: 0 };
    this.usage.set(userId, fresh);
    return fresh;
  }

  /**
   * A turn is about to start. Counts it, or throws with the reason when the
   * day's turns are spent — before any model call, so a refusal costs nothing.
   */
  begin(userId: UserId): void {
    if (userId === this.options.exempt) {
      return;
    }
    const usage = this.usageOf(userId);
    if (usage.runs >= this.options.runsPerDay) {
      throw new ModelBudgetExhaustedError(
        `This account has used its ${this.options.runsPerDay} turns for today. ${this.resetsIn()}`
      );
    }
    this.usage.set(userId, { ...usage, runs: usage.runs + 1 });
  }

  /** One model step finished. Counted after the fact; the stop rule reads it. */
  step(userId: UserId): void {
    if (userId === this.options.exempt) {
      return;
    }
    const usage = this.usageOf(userId);
    this.usage.set(userId, { ...usage, steps: usage.steps + 1 });
  }

  /** Whether the running turn must stop before its next step. */
  exhausted(userId: UserId): boolean {
    if (userId === this.options.exempt) {
      return false;
    }
    return this.usageOf(userId).steps >= this.options.stepsPerDay;
  }

  private resetsIn(): string {
    const at = this.now();
    const midnight = Math.ceil(at / DAY_MS) * DAY_MS;
    const hours = Math.max(1, Math.round((midnight - at) / 3_600_000));
    return `It resets in about ${hours} hour${hours === 1 ? "" : "s"}.`;
  }
}
