/**
 * The durable store: frozen flags, mandates and receipts in Postgres.
 *
 * Receipts and mandates are stored as documents. A receipt is an immutable
 * record of a past decision, and a mandate is whatever the person last
 * saved; normalising either into columns would mean a later schema change
 * silently rewrites history. `frozen_at` is a timestamp on the user row so
 * "frozen at 14:02, unfrozen at 14:09" stays answerable.
 */

import { mandates, receipts, users } from "@froggy/database";
import type { UserId } from "@froggy/domain";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Result } from "effect";
import type { Sql } from "postgres";

import { decodeMandate, readReceipts } from "./store";
import type { Store } from "./store";

export const postgresStore = (sql: Sql): Store => {
  const database = drizzle(sql);
  const ensureUser = async (userId: UserId): Promise<void> => {
    await database.insert(users).values({ did: userId }).onConflictDoNothing();
  };
  return {
    frozen: {
      load: async (userId) => {
        const rows = await database
          .select({ frozenAt: users.frozenAt })
          .from(users)
          .where(eq(users.did, userId))
          .limit(1);
        const [row] = rows;
        return row?.frozenAt !== null && row?.frozenAt !== undefined;
      },
      save: async (userId, frozen) => {
        await ensureUser(userId);
        await database
          .update(users)
          .set({ frozenAt: frozen ? new Date() : null })
          .where(eq(users.did, userId));
      },
    },
    mandates: {
      load: async (userId) => {
        const rows = await database
          .select({ document: mandates.document })
          .from(mandates)
          .where(eq(mandates.userId, userId))
          .limit(1);
        const [row] = rows;
        if (row === undefined) {
          return null;
        }
        const decoded = decodeMandate(row.document);
        return Result.isSuccess(decoded) ? decoded.success : null;
      },
      save: async (userId, mandate) => {
        await ensureUser(userId);
        await database
          .insert(mandates)
          .values({ document: mandate, updatedAt: new Date(), userId })
          .onConflictDoUpdate({
            set: { document: mandate, updatedAt: new Date() },
            target: mandates.userId,
          });
      },
    },
    receipts: {
      append: async (userId, receipt) => {
        await ensureUser(userId);
        await database
          .insert(receipts)
          .values({
            createdAt: new Date(receipt.at),
            document: receipt,
            id: receipt.id,
            sessionId: receipt.sessionId,
            spendId: receipt.spendId,
            stubbed: receipt.stubbed,
            userId,
          })
          .onConflictDoNothing();
      },
      recent: async (userId, limit) => {
        const rows = await database
          .select({ document: receipts.document })
          .from(receipts)
          .where(eq(receipts.userId, userId))
          .orderBy(desc(receipts.createdAt))
          .limit(limit);
        return readReceipts(rows.map((row) => row.document));
      },
    },
  };
};
