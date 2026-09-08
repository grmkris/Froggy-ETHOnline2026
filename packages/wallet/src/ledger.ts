/**
 * The spend ledger.
 *
 * Two properties, both of which exist because of the same failure mode: a tool
 * call that gets retried.
 *
 *   1. **Reserve before the outbound call, not after.** The row is written with
 *      status `reserved` *before* any money moves, then flipped to `settled` or
 *      `failed`. A ledger written after settlement cannot see an in-flight
 *      spend, so two concurrent tool calls would each read a stale total and
 *      both pass a cap they jointly break.
 *   2. **Idempotency keys are unique.** The AI SDK retries, a reconnect
 *      replays, a model that never saw the result tries again. Without the key,
 *      each of those is a second payment for one decision.
 *
 * Spends also serialise per user: `reserve` runs under a per-user promise
 * chain, so the read-then-write of the window total cannot interleave.
 *
 * Rows are keyed by the **user**, not the session. A session id is generated
 * per process, so a ledger keyed on it would hand a returning user a fresh
 * allowance after every restart — which is not a ledger, it is a nightly
 * amnesty. The user's DID is the thing that is actually stable across a
 * redeploy, and the cap is a statement about them.
 */

import type {
  RunId,
  SpendId,
  SpendStatus,
  UsdMicros,
  UserId,
} from "@froggy/domain";

export interface SpendRow {
  readonly runId?: RunId | undefined;
  readonly at: number;
  readonly id: SpendId;
  readonly idempotencyKey: string;
  status: SpendStatus;
  readonly usdMicros: UsdMicros;
  readonly userId: UserId;
}

/**
 * The result of reserving.
 *
 * `created` is the load-bearing field, and it exists because the previous
 * shape could not express the thing that actually matters. Two concurrent tool
 * calls with the same key both used to get back a row in state `reserved` —
 * neither could tell that the other had written it — so both went on to pay.
 * Reproduced: `settle() ran 2 time(s)`.
 *
 * Now exactly one caller is told it created the row, and only that caller is
 * allowed to move money. The other has, by definition, nothing to do.
 */
export interface Reservation {
  /** True for the caller whose insert won. Only that caller may settle. */
  readonly created: boolean;
  readonly row: SpendRow;
}

export class SpendBudgetExceededError extends Error {
  constructor() {
    super(
      "This scheduled run has no budget left for this payment, including pending payments."
    );
    this.name = "SpendBudgetExceededError";
  }
}

export interface SpendLedger {
  /**
   * Record a refusal. "It did not spend" and "it was told not to" are
   * different facts, and only the second one is reassuring — a row makes the
   * second one auditable in the same place as the money. Refusals never
   * occupy the idempotency key: a retry after the human widened the mandate
   * is a new decision, not a replay of the old one.
   */
  readonly refuse: (row: Omit<SpendRow, "status">) => Promise<void>;
  /**
   * Reserve capacity for a spend, or hand back the existing row when this key
   * has been seen. Only the caller that `created` the row may pay.
   */
  readonly reserve: (
    row: Omit<SpendRow, "status">,
    budgetUsdMicros?: number
  ) => Promise<Reservation>;
  readonly settle: (id: SpendId, status: SpendStatus) => Promise<void>;
  /** Rows inside the window that should count against a cap. */
  readonly since: (
    userId: UserId,
    from: number
  ) => Promise<readonly SpendRow[]>;
}

/**
 * In-memory ledger.
 *
 * Correct for one process, which is what this build runs. It is not correct
 * across replicas — the Railway service is pinned to one replica for exactly
 * this reason, and a second replica would need the Postgres implementation with
 * a unique index on `(session_id, idempotency_key)` doing the work this Map does.
 */
/** Swallow a settled rejection. Named so the intent is not a bare empty arrow. */
const noop = (): void => undefined;

/** Rows that never moved money and must not consume allowance. */
export const NOT_COUNTED: readonly SpendStatus[] = ["refused", "abandoned"];

/** The key a refusal is filed under, so it can never collide with a payment. */
export const refusalKey = (id: SpendId): string => `refused:${id}`;

export const memoryLedger = (): SpendLedger => {
  const rows = new Map<SpendId, SpendRow>();
  const byKey = new Map<string, SpendId>();
  /** Per-user serialisation. Cheap, and it removes the read-then-write race. */
  const chains = new Map<UserId, Promise<unknown>>();

  const serialize = async <T>(
    userId: UserId,
    work: () => Promise<T>
  ): Promise<T> => {
    const previous = chains.get(userId);
    const next = (async () => {
      // The predecessor's *outcome* is irrelevant; only its completion matters.
      // A failed reservation must not stop the next one from being attempted.
      if (previous !== undefined) {
        await previous.catch(noop);
      }
      return await work();
    })();
    // The stored chain must never reject, or the next caller inherits it.
    chains.set(
      userId,
      (async () => {
        await next.catch(noop);
      })()
    );
    return await next;
  };

  return {
    refuse: async (row) => {
      await Promise.resolve();
      const refused: SpendRow = {
        ...row,
        idempotencyKey: refusalKey(row.id),
        status: "refused",
      };
      rows.set(refused.id, refused);
    },

    reserve: async (row, budgetUsdMicros) =>
      await serialize(row.userId, async () => {
        await Promise.resolve();
        const key = `${row.userId}:${row.idempotencyKey}`;
        const existingId = byKey.get(key);
        if (existingId !== undefined) {
          const existing = rows.get(existingId);
          if (existing !== undefined) {
            return { created: false, row: existing };
          }
        }
        if (budgetUsdMicros !== undefined) {
          const used = [...rows.values()]
            .filter(
              (prior) =>
                prior.userId === row.userId &&
                prior.runId === row.runId &&
                !NOT_COUNTED.includes(prior.status)
            )
            .reduce((total, prior) => total + prior.usdMicros, 0);
          if (
            row.runId === undefined ||
            used + row.usdMicros > budgetUsdMicros
          ) {
            throw new SpendBudgetExceededError();
          }
        }
        const fresh: SpendRow = { ...row, status: "reserved" };
        rows.set(fresh.id, fresh);
        byKey.set(key, fresh.id);
        return { created: true, row: fresh };
      }),

    settle: async (id, status) => {
      await Promise.resolve();
      const row = rows.get(id);
      if (row !== undefined) {
        if (status === "abandoned") {
          const key = `${row.userId}:${row.idempotencyKey}`;
          if (byKey.get(key) === id) {
            byKey.delete(key);
          }
          rows.set(id, { ...row, idempotencyKey: refusalKey(id), status });
        } else {
          row.status = status;
        }
      }
    },

    since: async (userId, from) => {
      await Promise.resolve();
      return [...rows.values()].filter(
        (row) =>
          row.userId === userId &&
          row.at >= from &&
          // A refusal never consumed anything, so counting it against the cap
          // would let a rejected spend eat the allowance it was denied. An
          // abandoned spend never sent anything either.
          !NOT_COUNTED.includes(row.status)
      );
    },
  };
};
