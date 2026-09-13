import { monitoringAccounts, users } from "@froggy/database";
import { emptyMonitoringBook, MonitoringBook, userId } from "@froggy/domain";
import { eq, sql as raw } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Schema } from "effect";
import type { Sql } from "postgres";

import type { MonitoringStore } from "./monitoring-store";

export const postgresMonitoringStore = (sql: Sql): MonitoringStore => {
  const db = drizzle(sql);
  return {
    transact: async (owner, operation) =>
      await db.transaction(async (tx) => {
        await tx.execute(
          raw`select pg_advisory_xact_lock(hashtextextended(${`monitoring:${owner}`}, 0))`
        );
        await tx.insert(users).values({ did: owner }).onConflictDoNothing();
        const [row] = await tx
          .select()
          .from(monitoringAccounts)
          .where(eq(monitoringAccounts.userId, owner));
        const before = row
          ? Schema.decodeUnknownSync(MonitoringBook)(row.document)
          : emptyMonitoringBook();
        const { book, result } = operation(structuredClone(before));
        Schema.decodeUnknownSync(MonitoringBook)(book);
        if (!row || !Bun.deepEquals(book, before, true)) {
          await tx
            .insert(monitoringAccounts)
            .values({ userId: owner, document: book })
            .onConflictDoUpdate({
              target: monitoringAccounts.userId,
              set: { document: book },
            });
        }
        return structuredClone(result);
      }),
    owners: async () => {
      const rows = await db
        .select({ id: users.did })
        .from(monitoringAccounts)
        .innerJoin(users, eq(users.did, monitoringAccounts.userId));
      return rows.map((row) => userId(row.id));
    },
    forget: async (owner) => {
      await db
        .delete(monitoringAccounts)
        .where(eq(monitoringAccounts.userId, owner));
    },
  };
};
