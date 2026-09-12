import { savedItems, users } from "@froggy/database";
import { WatchlistItem } from "@froggy/domain";
import { and, eq, inArray, sql as raw } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Schema } from "effect";
import type { Sql } from "postgres";

import { validateWatchlistBook } from "./watchlist-store";
import type { WatchlistBook, WatchlistStore } from "./watchlist-store";

export const postgresWatchlistStore = (sql: Sql): WatchlistStore => {
  const db = drizzle(sql);
  return {
    transact: async (owner, operation) =>
      await db.transaction(async (tx) => {
        await tx.execute(
          raw`select pg_advisory_xact_lock(hashtextextended(${`watchlist:${owner}`}, 0))`
        );
        await tx.insert(users).values({ did: owner }).onConflictDoNothing();
        const rows = await tx
          .select()
          .from(savedItems)
          .where(eq(savedItems.userId, owner));
        const before: WatchlistBook = new Map();
        for (const row of rows) {
          const item = Schema.decodeUnknownSync(WatchlistItem)(row.document);
          if (item.id !== row.id) {
            throw new Error("Saved item identity mismatch.");
          }
          before.set(item.id, item);
        }
        const after = structuredClone(before);
        const result = operation(after);
        validateWatchlistBook(after);
        const changed = [...after.values()].filter(
          (item) => !Bun.deepEquals(before.get(item.id), item, true)
        );
        if (changed.length > 0) {
          const saved = await tx
            .insert(savedItems)
            .values(
              changed.map((item) => ({
                id: item.id,
                userId: owner,
                document: item,
              }))
            )
            .onConflictDoUpdate({
              target: savedItems.id,
              set: { document: raw`excluded.document` },
              setWhere: eq(savedItems.userId, owner),
            })
            .returning({ id: savedItems.id });
          if (saved.length !== changed.length) {
            throw new Error("Saved item belongs to another person.");
          }
        }
        const removed = [...before.keys()].filter((id) => !after.has(id));
        if (removed.length > 0) {
          await tx
            .delete(savedItems)
            .where(
              and(eq(savedItems.userId, owner), inArray(savedItems.id, removed))
            );
        }
        return structuredClone(result);
      }),
    forget: async (owner) => {
      await db.delete(savedItems).where(eq(savedItems.userId, owner));
    },
  };
};
