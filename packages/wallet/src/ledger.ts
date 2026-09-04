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
 * Spends also serialise per session: `reserve` runs under a per-session
 * promise chain, so the read-then-write of the window total cannot interleave.
 */

import type {
  SessionId,
  SpendId,
  SpendStatus,
  UsdMicros,
} from "@froggy/domain";

export interface SpendRow {
  readonly at: number;
  readonly id: SpendId;
  readonly idempotencyKey: string;
  readonly sessionId: SessionId;
  status: SpendStatus;
  readonly usdMicros: UsdMicros;
}

export interface SpendLedger {
  /**
   * Reserve capacity for a spend, or hand back the existing row when this key
   * has been seen. The caller must treat a returned `settled` row as "already
   * paid" and not pay again.
   */
  readonly reserve: (row: Omit<SpendRow, "status">) => Promise<SpendRow>;
  readonly settle: (id: SpendId, status: SpendStatus) => Promise<void>;
  /** Rows inside the window that should count against a cap. */
  readonly since: (
    sessionId: SessionId,
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

export const memoryLedger = (): SpendLedger => {
  const rows = new Map<SpendId, SpendRow>();
  const byKey = new Map<string, SpendId>();
  /** Per-session serialisation. Cheap, and it removes the read-then-write race. */
  const chains = new Map<SessionId, Promise<unknown>>();

  const serialize = async <T>(
    sessionId: SessionId,
    work: () => Promise<T>
  ): Promise<T> => {
    const previous = chains.get(sessionId);
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
      sessionId,
      (async () => {
        await next.catch(noop);
      })()
    );
    return await next;
  };

  return {
    reserve: async (row) =>
      await serialize(row.sessionId, async () => {
        await Promise.resolve();
        const key = `${row.sessionId}:${row.idempotencyKey}`;
        const existingId = byKey.get(key);
        if (existingId !== undefined) {
          const existing = rows.get(existingId);
          if (existing !== undefined) {
            return existing;
          }
        }
        const created: SpendRow = { ...row, status: "reserved" };
        rows.set(created.id, created);
        byKey.set(key, created.id);
        return created;
      }),

    settle: async (id, status) => {
      await Promise.resolve();
      const row = rows.get(id);
      if (row !== undefined) {
        row.status = status;
      }
    },

    since: async (sessionId, from) => {
      await Promise.resolve();
      return [...rows.values()].filter(
        (row) =>
          row.sessionId === sessionId &&
          row.at >= from &&
          // A refusal never consumed anything, so counting it against the cap
          // would let a rejected spend eat the allowance it was denied.
          row.status !== "refused"
      );
    },
  };
};
