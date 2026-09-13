import { savedItemData, users } from "@froggy/database";
import { WatchlistData, userId } from "@froggy/domain";
import { and, eq, inArray, sql as raw } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Schema } from "effect";
import type { Sql } from "postgres";

import { validateWatchlistData } from "./watchlist-data-store";
import type {
  WatchlistDataBook,
  WatchlistDataStore,
} from "./watchlist-data-store";

export const postgresWatchlistDataStore = (sql: Sql): WatchlistDataStore => {
  const db = drizzle(sql);
  return {
    transact: async (owner, operation) =>
      await db.transaction(async (tx) => {
        await tx.execute(
          raw`select pg_advisory_xact_lock(hashtextextended(${`watchlist-data:${owner}`}, 0))`
        );
        await tx.insert(users).values({ did: owner }).onConflictDoNothing();
        const rows = await tx
          .select()
          .from(savedItemData)
          .where(eq(savedItemData.userId, owner));
        const book: WatchlistDataBook = new Map(
          rows.map((row) => [
            row.itemId,
            Schema.decodeUnknownSync(WatchlistData)(row.document),
          ])
        );
        const before = structuredClone(book);
        const result = operation(book);
        validateWatchlistData(book);
        const changed = [...book].filter(([itemId, document]) => !Bun.deepEquals(before.get(itemId), document, true));
        if (changed.length > 0) {
          await tx.insert(savedItemData).values(changed.map(([itemId, document]) => ({ userId: owner, itemId, document }))).onConflictDoUpdate({ target: [savedItemData.userId, savedItemData.itemId], set: { document: raw`excluded.document` } });
        }
        const removed = [...before.keys()].filter((id) => !book.has(id));
        if (removed.length > 0) {
          await tx
            .delete(savedItemData)
            .where(
              and(
                eq(savedItemData.userId, owner),
                inArray(savedItemData.itemId, removed)
              )
            );
        }
        return structuredClone(result);
      }),
    owners: async () => { const rows = await db.selectDistinct({ id: savedItemData.userId }).from(savedItemData); return rows.map((row) => userId(row.id)); },
    forget: async (owner) => {
      await db.delete(savedItemData).where(eq(savedItemData.userId, owner));
    },
  };
};
