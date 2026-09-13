import {
  creditAccounts,
  creditCharges,
  creditEntries,
  creditPurchases,
  tasks,
  users,
} from "@froggy/database";
import {
  Allowance,
  CreditCharge,
  CreditLedgerEntry,
  CreditSummary,
  defaultCreditLimits,
  Task,
  userId,
} from "@froggy/domain";
import { and, desc, eq, gte, inArray, isNotNull, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Schema } from "effect";
import type { Sql } from "postgres";

import {
  CreditStoreError,
  FundingPurchase,
  makeCreditStore,
} from "./credit-store";
import type { CreditRepository, CreditStore } from "./credit-store";

const taskFromRow = (row: typeof tasks.$inferSelect): Task =>
  Schema.decodeUnknownSync(Task)({
    ...row,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    chargeId: row.chargeId ?? undefined,
    priceCreditUnits: row.priceCreditUnits ?? undefined,
    chargeStatus: row.chargeStatus ?? undefined,
  });
const taskValues = (task: Task) => ({
  ...task,
  createdAt: new Date(task.createdAt),
  updatedAt: new Date(task.updatedAt),
  chargeId: task.chargeId ?? null,
  priceCreditUnits: task.priceCreditUnits ?? null,
  chargeStatus: task.chargeStatus ?? null,
});
const fundingFromRow = (
  row: typeof creditPurchases.$inferSelect
): FundingPurchase =>
  Schema.decodeUnknownSync(FundingPurchase)({ ...row, v: 1 });
const accountFromRow = (row: typeof creditAccounts.$inferSelect) =>
  Schema.decodeUnknownSync(CreditSummary)({
    v: 1,
    availableUnits: row.availableUnits,
    reservedUnits: row.reservedUnits,
    spentUnits: row.spentUnits,
    stubbed: row.stubbed,
    limits: {
      perTaskUnits: row.perTaskUnits,
      dailyUnits: row.dailyUnits,
      expiresAt: row.expiresAt,
      frozen: row.frozen,
    },
  });
const fundingValues = (purchase: FundingPurchase) => ({
  id: purchase.id,
  idempotencyKey: purchase.idempotencyKey,
  requestFingerprint: purchase.requestFingerprint,
  creditUnits: purchase.creditUnits,
  network: purchase.network,
  asset: purchase.asset,
  amount: purchase.amount,
  payTo: purchase.payTo,
  status: purchase.status,
  challenge: purchase.challenge,
  expiresAt: purchase.expiresAt,
  createdAt: purchase.createdAt,
  updatedAt: purchase.updatedAt,
  proofHash: purchase.proofHash,
  authorizationKey: purchase.authorizationKey,
  paymentHeader: purchase.paymentHeader,
  transactionId: purchase.transactionId,
  signedTransaction: purchase.signedTransaction,
  transactionNonce: purchase.transactionNonce,
  error: purchase.error,
  stubbed: purchase.stubbed,
});
const uniquenessError = Schema.is(
  Schema.Struct({ code: Schema.Literal("23505") })
);
const count = (limit = 50) => Math.min(1000, Math.max(1, Math.floor(limit)));

export const postgresCreditStore = (sql: Sql): CreditStore => {
  const db = drizzle(sql);
  const transact: CreditRepository["transact"] = async (
    owner,
    initialLimits,
    operation
  ) => {
    try {
      return await db.transaction(async (tx) => {
        await tx.insert(users).values({ did: owner }).onConflictDoNothing();
        const [person] = await tx
          .select({ allowance: users.privyPolicyAllowance })
          .from(users)
          .where(eq(users.did, owner));
        const allowance =
          person?.allowance === null || person?.allowance === undefined
            ? null
            : Schema.decodeUnknownSync(Allowance)(person.allowance);
        const limits = initialLimits ?? defaultCreditLimits(allowance);
        await tx
          .insert(creditAccounts)
          .values({ userId: owner, ...limits })
          .onConflictDoNothing();
        const [accountRow] = await tx
          .select()
          .from(creditAccounts)
          .where(eq(creditAccounts.userId, owner))
          .for("update");
        if (!accountRow) {
          throw new CreditStoreError(
            "not_found",
            "Credit account could not be loaded."
          );
        }
        const result = await operation({
          account: accountFromRow(accountRow),
          saveAccount: async (account) => {
            Schema.decodeUnknownSync(CreditSummary)(account);
            await tx
              .update(creditAccounts)
              .set({
                ...account.limits,
                availableUnits: account.availableUnits,
                reservedUnits: account.reservedUnits,
                spentUnits: account.spentUnits,
                stubbed: account.stubbed,
              })
              .where(eq(creditAccounts.userId, owner));
          },
          task: async (id) => {
            const [row] = await tx
              .select()
              .from(tasks)
              .where(and(eq(tasks.userId, owner), eq(tasks.id, id)))
              .for("update");
            return row ? taskFromRow(row) : null;
          },
          taskByKey: async (key) => {
            const [row] = await tx
              .select()
              .from(tasks)
              .where(
                and(eq(tasks.userId, owner), eq(tasks.idempotencyKey, key))
              )
              .for("update");
            return row ? taskFromRow(row) : null;
          },
          activeBrowse: async (except) => {
            const rows = await tx
              .select({ id: tasks.id })
              .from(tasks)
              .where(
                and(
                  eq(tasks.userId, owner),
                  eq(tasks.kind, "browse"),
                  ne(tasks.id, except),
                  inArray(tasks.status, [
                    "paid",
                    "running",
                    "paused",
                    "uncertain",
                    "awaiting_approval",
                  ])
                )
              )
              .limit(1);
            return rows.length > 0;
          },
          saveTask: async (task) => {
            const values = taskValues(task);
            const saved = await tx
              .insert(tasks)
              .values({ ...values, userId: owner })
              .onConflictDoUpdate({
                target: tasks.id,
                set: values,
                setWhere: eq(tasks.userId, owner),
              })
              .returning({ id: tasks.id });
            if (!saved.length) {
              throw new CreditStoreError(
                "credit_conflict",
                "Task belongs to another account."
              );
            }
          },
          charge: async (id) => {
            const [row] = await tx
              .select()
              .from(creditCharges)
              .where(
                and(
                  eq(creditCharges.userId, owner),
                  eq(creditCharges.taskId, id)
                )
              );
            return row ? Schema.decodeUnknownSync(CreditCharge)(row) : null;
          },
          recentCharges: async (since) => {
            const rows = await tx
              .select()
              .from(creditCharges)
              .where(
                and(
                  eq(creditCharges.userId, owner),
                  or(
                    inArray(creditCharges.status, ["reserved", "uncertain"]),
                    and(
                      eq(creditCharges.status, "captured"),
                      gte(creditCharges.updatedAt, since)
                    )
                  )
                )
              );
            return rows.map((row) =>
              Schema.decodeUnknownSync(CreditCharge)(row)
            );
          },
          runCharges: async (id) => {
            const rows = await tx
              .select({ charge: creditCharges })
              .from(creditCharges)
              .innerJoin(tasks, eq(tasks.id, creditCharges.taskId))
              .where(and(eq(creditCharges.userId, owner), eq(tasks.runId, id)));
            return rows.map((row) =>
              Schema.decodeUnknownSync(CreditCharge)(row.charge)
            );
          },
          saveCharge: async (charge) => {
            await tx
              .insert(creditCharges)
              .values({ ...charge, userId: owner })
              .onConflictDoUpdate({
                target: creditCharges.id,
                set: charge,
                setWhere: eq(creditCharges.userId, owner),
              });
          },
          funding: async (id) => {
            const [row] = await tx
              .select()
              .from(creditPurchases)
              .where(
                and(
                  eq(creditPurchases.userId, owner),
                  eq(creditPurchases.id, id)
                )
              );
            return row ? fundingFromRow(row) : null;
          },
          fundingByKey: async (key) => {
            const [row] = await tx
              .select()
              .from(creditPurchases)
              .where(
                and(
                  eq(creditPurchases.userId, owner),
                  eq(creditPurchases.idempotencyKey, key)
                )
              );
            return row ? fundingFromRow(row) : null;
          },
          conflictingFundingMode: async (stubbed) => {
            const rows = await tx
              .select({ id: creditPurchases.id })
              .from(creditPurchases)
              .where(
                and(
                  eq(creditPurchases.userId, owner),
                  ne(creditPurchases.stubbed, stubbed),
                  inArray(creditPurchases.status, [
                    "pending",
                    "uncertain",
                    "confirmed",
                  ])
                )
              )
              .limit(1);
            return rows.length > 0;
          },
          saveFunding: async (purchase) => {
            const values = fundingValues(purchase);
            const saved = await tx
              .insert(creditPurchases)
              .values({ ...values, userId: owner })
              .onConflictDoUpdate({
                target: creditPurchases.id,
                set: values,
                setWhere: eq(creditPurchases.userId, owner),
              })
              .returning({ id: creditPurchases.id });
            if (!saved.length) {
              throw new CreditStoreError(
                "credit_conflict",
                "Purchase belongs to another account."
              );
            }
          },
          append: async (entry) => {
            await tx.insert(creditEntries).values({ ...entry, userId: owner });
          },
        });
        return result;
      });
    } catch (error) {
      if (
        uniquenessError(error) ||
        (error instanceof Error && uniquenessError(error.cause))
      ) {
        throw new CreditStoreError(
          "payment_reused",
          "This payment or request already belongs to another credit purchase or task."
        );
      }
      throw error;
    }
  };
  return makeCreditStore({
    transact,
    entries: async (owner, limit) => {
      const rows = await db
        .select()
        .from(creditEntries)
        .where(eq(creditEntries.userId, owner))
        .orderBy(desc(creditEntries.at), desc(creditEntries.id))
        .limit(count(limit));
      return rows.map((row) =>
        Schema.decodeUnknownSync(CreditLedgerEntry)(row)
      );
    },
    listFunding: async (owner, limit) => {
      const rows = await db
        .select()
        .from(creditPurchases)
        .where(eq(creditPurchases.userId, owner))
        .orderBy(desc(creditPurchases.createdAt))
        .limit(count(limit));
      return rows.map(fundingFromRow);
    },
    pendingSettlement: async (network, exceptPurchaseId) => {
      const rows = await db
        .select({ id: creditPurchases.id })
        .from(creditPurchases)
        .where(
          and(
            eq(creditPurchases.network, network),
            exceptPurchaseId === undefined
              ? undefined
              : ne(creditPurchases.id, exceptPurchaseId),
            isNotNull(creditPurchases.signedTransaction),
            inArray(creditPurchases.status, ["pending", "uncertain"])
          )
        )
        .limit(1);
      return rows.length > 0;
    },
    pendingFunding: async (limit) => {
      const rows = await db
        .select()
        .from(creditPurchases)
        .where(inArray(creditPurchases.status, ["pending", "uncertain"]))
        .orderBy(creditPurchases.updatedAt)
        .limit(count(limit));
      return rows.map((row) => ({
        userId: userId(row.userId),
        purchase: fundingFromRow(row),
      }));
    },
    pendingTasks: async (limit) => {
      const rows = await db
        .select({ task: tasks })
        .from(creditCharges)
        .innerJoin(tasks, eq(tasks.id, creditCharges.taskId))
        .where(inArray(creditCharges.status, ["reserved", "uncertain"]))
        .orderBy(creditCharges.updatedAt)
        .limit(count(limit));
      return rows.map((row) => ({
        userId: userId(row.task.userId),
        task: taskFromRow(row.task),
      }));
    },
  });
};
