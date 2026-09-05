/**
 * The durable ledger.
 *
 * Same contract as `memoryLedger`, with the two guarantees moved from a Map
 * into the database:
 *
 *   - **Idempotency** is the unique index on `(user_id, idempotency_key)`.
 *     `on conflict do nothing` plus a follow-up read means two callers racing
 *     the same key both end up with the row one of them wrote, whether they
 *     are two tool calls in one process or two processes entirely.
 *   - **Durability** means a cap survives a redeploy. A user who spent $4 of a
 *     $5 daily allowance and then triggered a deploy has spent $4, not $0.
 *
 * What is *not* solved here, and is honest about it: the window total is read
 * by `session.spend` before `reserve` is called, outside any transaction. Two
 * spends with *different* keys can therefore each read the same total and
 * jointly exceed a cap neither of them broke alone. Within one process the
 * per-user promise chain below closes that window, which is why the service
 * runs at one replica. Across replicas it is open, and closing it needs the
 * authorize-and-reserve pair to happen under one lock — a change in
 * `session.ts`, not here.
 */

import { spends, users } from "@froggy/database";
import { spendStatus, usdMicros, userId } from "@froggy/domain";
import type { SpendId } from "@froggy/domain";
import { and, eq, gte, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

import type { SpendLedger, SpendRow } from "./ledger";

/** Swallow a settled rejection. Named so the intent is not a bare empty arrow. */
const noop = (): void => undefined;

type Database = ReturnType<typeof drizzle>;

interface Persisted {
  readonly createdAt: Date;
  readonly id: SpendId;
  readonly idempotencyKey: string;
  readonly status: string;
  readonly usdMicros: number;
  readonly userId: string;
}

/**
 * A database row as the rest of the system reads it.
 *
 * Every widened column is parsed back rather than asserted. Postgres has no
 * cheap sum type and no branded number, so `status`, `usd_micros` and
 * `user_id` all leave the database as plain values; this is the one place they
 * re-enter the application, and a row somebody edited by hand fails here
 * rather than flowing into the policy engine as a status nothing handles.
 */
const toRow = (record: Persisted): SpendRow => ({
  at: record.createdAt.getTime(),
  id: record.id,
  idempotencyKey: record.idempotencyKey,
  status: spendStatus(record.status),
  usdMicros: usdMicros(record.usdMicros),
  userId: userId(record.userId),
});

export const postgresLedger = (sql: Sql): SpendLedger => {
  const database: Database = drizzle(sql);
  /** Per-user serialisation, exactly as in memory. See the note above. */
  const chains = new Map<string, Promise<unknown>>();

  const serialize = async <T>(
    user: string,
    work: () => Promise<T>
  ): Promise<T> => {
    const previous = chains.get(user);
    const next = (async () => {
      // The predecessor's outcome is irrelevant; only its completion matters.
      if (previous !== undefined) {
        await previous.catch(noop);
      }
      return await work();
    })();
    // The stored chain must never reject, or the next caller inherits it.
    chains.set(
      user,
      (async () => {
        await next.catch(noop);
      })()
    );
    return await next;
  };

  return {
    reserve: async (row) =>
      await serialize(row.userId, async () => {
        // The user row is created here rather than at sign-in because this is
        // the first moment anything has to be true about them: a spend needs an
        // owner. Signing in and never spending leaves no trace, which is the
        // right default for a table that exists to hold custody, not identity.
        await database
          .insert(users)
          .values({ did: row.userId })
          .onConflictDoNothing();

        const inserted = await database
          .insert(spends)
          .values({
            createdAt: new Date(row.at),
            id: row.id,
            idempotencyKey: row.idempotencyKey,
            status: "reserved",
            usdMicros: row.usdMicros,
            userId: row.userId,
          })
          .onConflictDoNothing({
            target: [spends.userId, spends.idempotencyKey],
          })
          .returning();

        const [first] = inserted;
        if (first !== undefined) {
          return toRow(first);
        }

        // Lost the race, or this key has been seen before. Either way the
        // winner's row is the answer, and the caller must treat a `settled`
        // one as already paid.
        const existing = await database
          .select()
          .from(spends)
          .where(
            and(
              eq(spends.userId, row.userId),
              eq(spends.idempotencyKey, row.idempotencyKey)
            )
          )
          .limit(1);
        const [found] = existing;
        if (found === undefined) {
          throw new Error(
            `Spend ${row.idempotencyKey} neither inserted nor found.`
          );
        }
        return toRow(found);
      }),

    settle: async (id, status) => {
      await database.update(spends).set({ status }).where(eq(spends.id, id));
    },

    since: async (owner, from) => {
      const rows = await database
        .select()
        .from(spends)
        .where(
          and(
            eq(spends.userId, owner),
            gte(spends.createdAt, new Date(from)),
            // A refusal never consumed anything, so counting it against the cap
            // would let a rejected spend eat the allowance it was denied.
            ne(spends.status, "refused")
          )
        );
      return rows.map(toRow);
    },
  };
};
