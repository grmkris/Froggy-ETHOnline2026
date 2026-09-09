import { launchWatches, users } from "@froggy/database";
import { LaunchWatch, UserId } from "@froggy/domain";
import { eq, sql as raw } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Schema } from "effect";
import type { Sql } from "postgres";

import { validateLaunchBook } from "./launch-store";
import type { LaunchBook, LaunchStore } from "./launch-store";

export const postgresLaunchStore = (sql: Sql): LaunchStore => {
  const db = drizzle(sql);
  return {
    transact: async (owner, operation) =>
      await db.transaction(async (tx) => {
        await tx.execute(
          raw`select pg_advisory_xact_lock(hashtextextended(${`launches:${owner}`}, 0))`
        );
        await tx.insert(users).values({ did: owner }).onConflictDoNothing();
        const rows = await tx
          .select()
          .from(launchWatches)
          .where(eq(launchWatches.userId, owner));
        const before: LaunchBook = new Map();
        for (const row of rows) {
          const watch = Schema.decodeUnknownSync(LaunchWatch)(row.document);
          if (
            watch.id !== row.id ||
            watch.sourceTaskId !== row.sourceTaskId ||
            watch.status !== row.status
          ) {
            throw new Error(
              "watch.record: stored identity or status does not match its document."
            );
          }
          before.set(watch.id, watch);
        }
        const after = structuredClone(before);
        const result = operation(after);
        validateLaunchBook(before, after);
        const changed = [...after.values()].filter(
          (watch) => !Bun.deepEquals(before.get(watch.id), watch, true)
        );
        if (changed.length > 0) {
          const saved = await tx
            .insert(launchWatches)
            .values(
              changed.map((watch) => ({
                id: watch.id,
                userId: owner,
                sourceTaskId: watch.sourceTaskId,
                status: watch.status,
                document: watch,
              }))
            )
            .onConflictDoUpdate({
              target: launchWatches.id,
              set: {
                status: raw`excluded.status`,
                document: raw`excluded.document`,
              },
              setWhere: eq(launchWatches.userId, owner),
            })
            .returning({ id: launchWatches.id });
          if (saved.length !== changed.length) {
            throw new Error("watch.owner: record belongs to another person.");
          }
        }
        return structuredClone(result);
      }),
    pendingOwners: async () => {
      const rows = await db
        .selectDistinct({ userId: launchWatches.userId })
        .from(launchWatches)
        .where(eq(launchWatches.status, "active"));
      return rows.map((row) => Schema.decodeUnknownSync(UserId)(row.userId));
    },
  };
};
