import { tradeRules, trades, users } from "@froggy/database";
import { UserId, Trade, TradeRule } from "@froggy/domain";
import { eq, inArray, sql as raw } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Schema } from "effect";
import type { Sql } from "postgres";

import { emptyTradeBook, validateTradeBook } from "./trading-store";
import type { TradingStore } from "./trading-store";

export const postgresTradingStore = (sql: Sql): TradingStore => {
  const db = drizzle(sql);
  return {
    transact: async (userId, operation) =>
      await db.transaction(async (tx) => {
        // Shared across processes, including revocation and post-crash recovery.
        await tx.execute(
          raw`select pg_advisory_xact_lock(hashtextextended(${`trading:${userId}`}, 0))`
        );
        await tx.insert(users).values({ did: userId }).onConflictDoNothing();
        const rows = await tx
          .select()
          .from(trades)
          .where(eq(trades.userId, userId));
        const rules = await tx
          .select()
          .from(tradeRules)
          .where(eq(tradeRules.userId, userId));
        const before = emptyTradeBook();
        const [owner] = await tx
          .select({ stopped: users.tradingStopped })
          .from(users)
          .where(eq(users.did, userId));
        if (owner === undefined) {
          throw new Error("trade.owner: owner record is unavailable.");
        }
        before.stopped = owner.stopped;
        // Fail closed: dropping unreadable records would reset capital limits.
        for (const row of rows) {
          const trade = Schema.decodeUnknownSync(Trade)(row.document);
          before.trades.set(trade.id, trade);
        }
        for (const row of rules) {
          const rule = Schema.decodeUnknownSync(TradeRule)(row.document);
          before.rules.set(rule.id, rule);
        }
        const after = structuredClone(before);
        const result = operation(after);
        validateTradeBook(before, after);
        if (before.stopped !== after.stopped) {
          await tx
            .update(users)
            .set({ tradingStopped: after.stopped })
            .where(eq(users.did, userId));
        }
        const changedTrades = [...after.trades.values()].filter(
          (trade) =>
            JSON.stringify(before.trades.get(trade.id)) !==
            JSON.stringify(trade)
        );
        if (changedTrades.length > 0) {
          const saved = await tx
            .insert(trades)
            .values(
              changedTrades.map((trade) => ({
                id: trade.id,
                userId,
                idempotencyKey: trade.idempotencyKey,
                status: trade.status,
                document: trade,
              }))
            )
            .onConflictDoUpdate({
              target: trades.id,
              set: {
                status: raw`excluded.status`,
                document: raw`excluded.document`,
              },
              setWhere: eq(trades.userId, userId),
            })
            .returning({ id: trades.id });
          if (saved.length !== changedTrades.length) {
            throw new Error("trade.owner: record belongs to another person.");
          }
        }
        const changedRules = [...after.rules.values()].filter(
          (rule) =>
            JSON.stringify(before.rules.get(rule.id)) !== JSON.stringify(rule)
        );
        if (changedRules.length > 0) {
          const saved = await tx
            .insert(tradeRules)
            .values(
              changedRules.map((rule) => ({
                id: rule.id,
                userId,
                document: rule,
              }))
            )
            .onConflictDoUpdate({
              target: tradeRules.id,
              set: { document: raw`excluded.document` },
              setWhere: eq(tradeRules.userId, userId),
            })
            .returning({ id: tradeRules.id });
          if (saved.length !== changedRules.length) {
            throw new Error("trade.owner: rule belongs to another person.");
          }
        }
        return structuredClone(result);
      }),
    pendingOwners: async () => {
      const rows = await db
        .selectDistinct({ userId: trades.userId })
        .from(trades)
        .where(inArray(trades.status, ["executing", "uncertain"]));
      return rows.map((row) => Schema.decodeUnknownSync(UserId)(row.userId));
    },
  };
};
