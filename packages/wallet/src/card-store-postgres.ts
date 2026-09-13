import {
  cardCheckouts,
  paymentMethods,
  paymentMethodCredentials,
  users,
} from "@froggy/database";
import {
  CardCheckout,
  CardVaultEnvelope,
  PaymentMethod,
  UserId,
} from "@froggy/domain";
import { eq, sql as raw } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Schema } from "effect";
import type { Sql } from "postgres";

import { emptyCardBook, validateCardBook } from "./card-store";
import type { CardStore } from "./card-store";

export const postgresCardStore = (sql: Sql): CardStore => {
  const db = drizzle(sql);
  return {
    transact: async (owner, operation) =>
      await db.transaction(async (tx) => {
        await tx.execute(
          raw`select pg_advisory_xact_lock(hashtextextended(${`cards:${owner}`}, 0))`
        );
        await tx.insert(users).values({ did: owner }).onConflictDoNothing();
        const before = emptyCardBook();
        const methods = await tx
          .select()
          .from(paymentMethods)
          .where(eq(paymentMethods.userId, owner));
        const credentials = await tx
          .select()
          .from(paymentMethodCredentials)
          .where(eq(paymentMethodCredentials.userId, owner));
        const checkouts = await tx
          .select()
          .from(cardCheckouts)
          .where(eq(cardCheckouts.userId, owner));
        for (const row of methods) {
          const method = Schema.decodeUnknownSync(PaymentMethod)(row.document);
          if (row.id !== method.id) {
            throw new Error("card.identity: payment method mismatch.");
          }
          before.methods.set(method.id, method);
        }
        for (const row of credentials) {
          before.credentials.set(
            row.id,
            Schema.decodeUnknownSync(CardVaultEnvelope)(row.envelope)
          );
        }
        for (const row of checkouts) {
          const checkout = Schema.decodeUnknownSync(CardCheckout)(row.document);
          if (row.id !== checkout.id) {
            throw new Error("card.identity: checkout mismatch.");
          }
          before.checkouts.set(checkout.id, checkout);
        }
        const after = structuredClone(before);
        const result = operation(after);
        validateCardBook(before, after);
        await Promise.all(
          [...after.methods.values()].map(async (method) => {
            if (Bun.deepEquals(before.methods.get(method.id), method, true)) {
              return;
            }
            const saved = await tx
              .insert(paymentMethods)
              .values({ id: method.id, userId: owner, document: method })
              .onConflictDoUpdate({
                target: paymentMethods.id,
                set: { document: method },
                setWhere: eq(paymentMethods.userId, owner),
              })
              .returning({ id: paymentMethods.id });
            if (saved.length !== 1) {
              throw new Error(
                "card.owner: payment method belongs to another owner."
              );
            }
            const envelope = after.credentials.get(method.id);
            await (envelope === undefined
              ? tx.delete(paymentMethodCredentials).where(eq(paymentMethodCredentials.id, method.id))
              : tx.insert(paymentMethodCredentials).values({ id: method.id, userId: owner, envelope }).onConflictDoUpdate({ target: paymentMethodCredentials.id, set: { envelope }, setWhere: eq(paymentMethodCredentials.userId, owner) }));

          })
        );
        await Promise.all(
          [...after.checkouts.values()].map(async (checkout) => {
            if (
              Bun.deepEquals(before.checkouts.get(checkout.id), checkout, true)
            ) {
              return;
            }
            const saved = await tx
              .insert(cardCheckouts)
              .values({
                id: checkout.id,
                userId: owner,
                idempotencyKey: checkout.idempotencyKey,
                document: checkout,
              })
              .onConflictDoUpdate({
                target: cardCheckouts.id,
                set: { document: checkout },
                setWhere: eq(cardCheckouts.userId, owner),
              })
              .returning({ id: cardCheckouts.id });
            if (saved.length !== 1) {
              throw new Error("card.owner: checkout belongs to another owner.");
            }
          })
        );
        return structuredClone(result);
      }),
    pendingOwners: async () => {
      const rows = await db
        .selectDistinct({ owner: cardCheckouts.userId })
        .from(cardCheckouts)
        .where(
          raw`${cardCheckouts.document}->'bridge'->>'destinationConfirmed' = 'false'`
        );
      return rows.map((row) => Schema.decodeUnknownSync(UserId)(row.owner));
    },
  };
};
