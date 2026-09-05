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
import { decodeUserId, NO_DIGEST } from "@froggy/domain";
import type { DigestSchedule, UserId } from "@froggy/domain";
import { desc, eq, isNotNull } from "drizzle-orm";
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
    digest: {
      all: async () => {
        const rows = await database
          .select({
            did: users.did,
            hour: users.digestHour,
            timezone: users.digestTimezone,
          })
          .from(users)
          .where(isNotNull(users.digestHour));
        const scheduled: {
          readonly schedule: DigestSchedule;
          readonly userId: UserId;
        }[] = [];
        for (const row of rows) {
          const decoded = decodeUserId(row.did);
          if (Result.isSuccess(decoded) && row.hour !== null) {
            scheduled.push({
              schedule: { hour: row.hour, timezone: row.timezone ?? "UTC" },
              userId: decoded.success,
            });
          }
        }
        return scheduled;
      },
      load: async (userId) => {
        const rows = await database
          .select({ hour: users.digestHour, timezone: users.digestTimezone })
          .from(users)
          .where(eq(users.did, userId))
          .limit(1);
        const [row] = rows;
        return row === undefined
          ? NO_DIGEST
          : { hour: row.hour, timezone: row.timezone ?? "UTC" };
      },
      save: async (userId, schedule) => {
        await ensureUser(userId);
        await database
          .update(users)
          .set({ digestHour: schedule.hour, digestTimezone: schedule.timezone })
          .where(eq(users.did, userId));
      },
    },
    forget: async (userId) => {
      await database.delete(receipts).where(eq(receipts.userId, userId));
      await database.delete(mandates).where(eq(mandates.userId, userId));
      // The row itself stays: the ledger's spends reference it, and a spend
      // is a money record that outlives the person's preferences.
      await database
        .update(users)
        .set({ digestHour: null, digestTimezone: null, frozenAt: null })
        .where(eq(users.did, userId));
    },
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
