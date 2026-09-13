import { savedItems, updates, users } from "@froggy/database";
import { Update } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import { and, count, desc, eq, isNull, lt, sql as raw } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Schema } from "effect";
import type { Sql } from "postgres";

import type { UpdateStore } from "./update-store";

type Database = ReturnType<typeof drizzle>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export const readUpdate = (row: typeof updates.$inferSelect): Update =>
  Schema.decodeUnknownSync(Update)({
    ...Schema.decodeUnknownSync(Update)(row.document),
    readAt: row.readAt,
  });
export const transactionalUpdates = (tx: Transaction) => ({
  byKey: async (owner: UserId, key: string): Promise<Update | null> => {
    const [row] = await tx
      .select()
      .from(updates)
      .where(and(eq(updates.userId, owner), eq(updates.key, key)));
    return row ? readUpdate(row) : null;
  },
  save: async (owner: UserId, input: Update): Promise<Update> => {
    await tx.execute(
      raw`select pg_advisory_xact_lock(hashtextextended(${`updates:${owner}`}, 0))`
    );
    await tx.insert(users).values({ did: owner }).onConflictDoNothing();
    const update = Schema.decodeUnknownSync(Update)(input);
    if (update.itemId) {
      const [item] = await tx
        .select({ id: savedItems.id })
        .from(savedItems)
        .where(
          and(eq(savedItems.id, update.itemId), eq(savedItems.userId, owner))
        );
      if (!item) {
        throw new Error("Saved item not found.");
      }
    }
    const [row] = await tx
      .insert(updates)
      .values({
        id: update.id,
        userId: owner,
        itemId: update.itemId,
        kind: update.kind,
        key: update.key,
        at: update.at,
        readAt: update.readAt,
        document: update,
      })
      .onConflictDoUpdate({
        target: [updates.userId, updates.key],
        set: {
          kind: update.kind,
          itemId: update.itemId,
          document: raw`jsonb_set(jsonb_set(excluded.document, '{id}', to_jsonb(${updates.document}->>'id')), '{at}', to_jsonb(${updates.at}))`,
        },
      })
      .returning();
    if (!row) {
      throw new Error("Update was not stored.");
    }
    return readUpdate(row);
  },
});
export const postgresUpdateStore = (sql: Sql): UpdateStore => {
  const db = drizzle(sql);
  const unread = async (owner: UserId): Promise<number> => {
    const [row] = await db
      .select({ value: count() })
      .from(updates)
      .where(and(eq(updates.userId, owner), isNull(updates.readAt)));
    return row?.value ?? 0;
  };
  return {
    save: async (owner, update) =>
      await db.transaction(
        async (tx) => await transactionalUpdates(tx).save(owner, update)
      ),
    byId: async (owner, id) => {
      const [row] = await db
        .select()
        .from(updates)
        .where(and(eq(updates.userId, owner), eq(updates.id, id)));
      return row ? readUpdate(row) : null;
    },
    byKey: async (owner, key) => {
      const [row] = await db
        .select()
        .from(updates)
        .where(and(eq(updates.userId, owner), eq(updates.key, key)));
      return row ? readUpdate(row) : null;
    },
    unread,
    list: async (owner, before) => {
      const rows = await db
        .select()
        .from(updates)
        .where(
          and(
            eq(updates.userId, owner),
            before ? lt(updates.id, before) : undefined
          )
        )
        .orderBy(desc(updates.id))
        .limit(31);
      return {
        v: 1,
        updates: rows.slice(0, 30).map(readUpdate),
        next: rows.length > 30 ? (rows[29]?.id ?? null) : null,
        unread: await unread(owner),
      };
    },
    markRead: async (owner, id, at) => {
      const rows = await db
        .update(updates)
        .set({ readAt: raw`coalesce(${updates.readAt}, ${at})` })
        .where(and(eq(updates.userId, owner), eq(updates.id, id)))
        .returning({ id: updates.id });
      return rows.length > 0;
    },
    markAllRead: async (owner, at) => {
      await db
        .update(updates)
        .set({ readAt: at })
        .where(and(eq(updates.userId, owner), isNull(updates.readAt)));
    },
    forget: async (owner) => {
      await db.delete(updates).where(eq(updates.userId, owner));
    },
  };
};
