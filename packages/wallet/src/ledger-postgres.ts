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
import type { RunId, SpendId } from "@froggy/domain";
import { and, eq, gte, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

import { NOT_COUNTED, refusalKey, SpendBudgetExceededError } from "./ledger";
import type { Reservation, SpendLedger, SpendRow } from "./ledger";

/** Swallow a settled rejection. Named so the intent is not a bare empty arrow. */
const noop = (): void => undefined;

type Database = ReturnType<typeof drizzle>;

interface Persisted {
  readonly runId: RunId | null;
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
  runId: record.runId ?? undefined,
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
    refuse: async (row) => {
      await database
        .insert(users)
        .values({ did: row.userId })
        .onConflictDoNothing();
      await database
        .insert(spends)
        .values({
          createdAt: new Date(row.at),
          id: row.id,
          idempotencyKey: refusalKey(row.id),
          status: "refused",
          usdMicros: row.usdMicros,
          userId: row.userId,
        })
        .onConflictDoNothing();
    },

    reserve: async (row, budgetUsdMicros) =>
      await serialize(row.userId, async () => {
        await database
          .insert(users)
          .values({ did: row.userId })
          .onConflictDoNothing();
        return await database.transaction(async (tx) => {
          // All reservations for a person share this database lock, across pools.
          await tx
            .select({ did: users.did })
            .from(users)
            .where(eq(users.did, row.userId))
            .for("update");
          const [existing] = await tx
            .select()
            .from(spends)
            .where(
              and(
                eq(spends.userId, row.userId),
                eq(spends.idempotencyKey, row.idempotencyKey)
              )
            )
            .limit(1);
          if (existing !== undefined) {
            return {
              created: false,
              row: toRow(existing),
            } satisfies Reservation;
          }
          if (budgetUsdMicros !== undefined) {
            if (row.runId === undefined) {
              throw new SpendBudgetExceededError();
            }
            const prior = await tx
              .select({ usdMicros: spends.usdMicros })
              .from(spends)
              .where(
                and(
                  eq(spends.userId, row.userId),
                  eq(spends.runId, row.runId),
                  notInArray(spends.status, [...NOT_COUNTED])
                )
              );
            const used = prior.reduce(
              (total, spend) => total + spend.usdMicros,
              0
            );
            if (used + row.usdMicros > budgetUsdMicros) {
              throw new SpendBudgetExceededError();
            }
          }
          const [inserted] = await tx
            .insert(spends)
            .values({
              createdAt: new Date(row.at),
              id: row.id,
              idempotencyKey: row.idempotencyKey,
              runId: row.runId ?? null,
              status: "reserved",
              usdMicros: row.usdMicros,
              userId: row.userId,
            })
            .returning();
          if (inserted === undefined) {
            throw new Error("Spend reservation was not written.");
          }
          return { created: true, row: toRow(inserted) } satisfies Reservation;
        });
      }),

    settle: async (id, status) => {
      // An unsent attempt remains auditable but cannot block a safe retry.
      const patch =
        status === "abandoned"
          ? { status, idempotencyKey: refusalKey(id) }
          : { status };
      await database.update(spends).set(patch).where(eq(spends.id, id));
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
            // would let a rejected spend eat the allowance it was denied; an
            // abandoned spend never sent anything either.
            notInArray(spends.status, [...NOT_COUNTED])
          )
        );
      return rows.map(toRow);
    },
  };
};
