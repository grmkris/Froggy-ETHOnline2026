import {
  savedItems,
  users,
  walletActivities,
  walletAlerts,
  walletAlertWindows,
  walletPriceEvaluations,
  walletStreamState,
} from "@froggy/database";
import {
  UserId,
  WalletActivity,
  WalletPriceEvaluation,
  WatchlistItem,
} from "@froggy/domain";
import type { WalletActivityId } from "@froggy/domain";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql as raw,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { Schema } from "effect";
import type { Sql } from "postgres";

import {
  emptyWalletStreamCheckpoint,
  WALLET_STORE_PAGE_SIZE,
  WalletAlert,
  WalletStreamCheckpoint,
  walletSummaryAlert,
} from "./wallet-activity-store";
import type {
  WalletActivityStore,
  WalletStreamNetwork,
} from "./wallet-activity-store";

export const postgresWalletActivityStore = (
  sql: Sql,
  defaultNetwork: WalletStreamNetwork = "eip155:8453"
): WalletActivityStore => {
  const db = drizzle(sql);
  return {
    transact: async (operation, network = defaultNetwork) =>
      await db.transaction(async (tx) => {
        await tx.execute(raw`set local lock_timeout = '5s'`);
        await tx.execute(raw`set local statement_timeout = '10s'`);
        await tx.execute(
          raw`select pg_advisory_xact_lock(hashtextextended('wallet-stream', 0))`
        );
        await tx
          .insert(walletStreamState)
          .values({ network, document: emptyWalletStreamCheckpoint() })
          .onConflictDoNothing();
        const [row] = await tx
          .select()
          .from(walletStreamState)
          .where(eq(walletStreamState.network, network));
        const checkpoint = Schema.decodeUnknownSync(WalletStreamCheckpoint)(
          row?.document
        );
        const readAlert = async (key: string): Promise<WalletAlert | null> => {
          const [alert] = await tx
            .select()
            .from(walletAlerts)
            .where(eq(walletAlerts.key, key));
          return alert
            ? Schema.decodeUnknownSync(WalletAlert)(alert.document)
            : null;
        };
        const saveAlert = async (input: WalletAlert): Promise<void> => {
          const previous = await readAlert(input.key);
          if (
            previous &&
            (previous.owner !== input.owner || previous.id !== input.id)
          ) {
            throw new Error("Alert identity belongs to another record.");
          }
          if (input.itemId) {
            const [item] = await tx
              .select({ id: savedItems.id })
              .from(savedItems)
              .where(
                and(
                  eq(savedItems.id, input.itemId),
                  eq(savedItems.userId, input.owner)
                )
              );
            if (!item) {
              throw new Error("Saved item not found.");
            }
          }
          const alert = Schema.decodeUnknownSync(WalletAlert)({
            ...previous,
            ...input,
          });
          const document = structuredClone(alert);
          await tx
            .insert(walletAlerts)
            .values({
              id: alert.id,
              userId: alert.owner,
              itemId: alert.itemId,
              monitorId: alert.monitorId,
              network: alert.network,
              summaryId: alert.summaryId ?? null,
              key: alert.key,
              state: alert.state,
              notBefore: alert.notBefore,
              createdAt: alert.createdAt,
              document,
            })
            .onConflictDoUpdate({
              target: walletAlerts.key,
              set: {
                document,
                state: alert.state,
                notBefore: alert.notBefore,
                summaryId: alert.summaryId ?? null,
              },
              setWhere: eq(walletAlerts.userId, alert.owner),
            });
        };
        const activityPage = async (
          waiting: boolean,
          after?: WalletActivityId
        ) => {
          const rows = await tx
            .select()
            .from(walletActivities)
            .where(
              and(
                eq(walletActivities.network, network),
                waiting
                  ? and(
                      eq(walletActivities.delivery, "waiting"),
                      ne(walletActivities.finality, "reverted"),
                      ne(walletActivities.finality, "unverified")
                    )
                  : eq(walletActivities.finality, "provisional"),
                after ? gt(walletActivities.id, after) : undefined
              )
            )
            .orderBy(asc(walletActivities.id))
            .limit(WALLET_STORE_PAGE_SIZE);
          return rows.map((activity) => ({
            owner: Schema.decodeUnknownSync(UserId)(activity.userId),
            activity: Schema.decodeUnknownSync(WalletActivity)(
              activity.document
            ),
          }));
        };
        return await operation({
          network,
          checkpoint,
          saveCheckpoint: async (next) => {
            await tx
              .update(walletStreamState)
              .set({
                document: Schema.decodeUnknownSync(WalletStreamCheckpoint)(
                  next
                ),
              })
              .where(eq(walletStreamState.network, network));
          },
          bumpGenerations: async () => {
            await tx.update(walletStreamState).set({
              document: raw`jsonb_set(${walletStreamState.document}, '{generation}', to_jsonb((${walletStreamState.document}->>'generation')::bigint + 1))`,
            });
          },
          watches: async () => {
            const rows = await tx
              .select()
              .from(savedItems)
              .where(
                raw`${savedItems.document}->'walletMonitor'->>'enabled' = 'true'`
              );
            return rows.map((item) => ({
              owner: Schema.decodeUnknownSync(UserId)(item.userId),
              item: Schema.decodeUnknownSync(WatchlistItem)(item.document),
            }));
          },
          items: async (owner) => {
            const rows = await tx
              .select()
              .from(savedItems)
              .where(eq(savedItems.userId, owner));
            return rows.map((item) =>
              Schema.decodeUnknownSync(WatchlistItem)(item.document)
            );
          },
          saveItem: async (owner, item) => {
            await tx.insert(users).values({ did: owner }).onConflictDoNothing();
            const saved = await tx
              .insert(savedItems)
              .values({
                id: item.id,
                userId: owner,
                document: Schema.decodeUnknownSync(WatchlistItem)(item),
              })
              .onConflictDoUpdate({
                target: savedItems.id,
                set: { document: item },
                setWhere: eq(savedItems.userId, owner),
              })
              .returning({ id: savedItems.id });
            if (saved.length !== 1) {
              throw new Error("Saved item belongs to another person.");
            }
          },
          activity: async (owner, itemId, transactionHash) => {
            const [activity] = await tx
              .select()
              .from(walletActivities)
              .where(
                and(
                  eq(walletActivities.userId, owner),
                  eq(walletActivities.itemId, itemId),
                  eq(walletActivities.transactionHash, transactionHash)
                )
              );
            return activity
              ? Schema.decodeUnknownSync(WalletActivity)(activity.document)
              : null;
          },
          saveActivity: async (owner, activity) => {
            const document = Schema.decodeUnknownSync(WalletActivity)(activity);
            const [item] = await tx
              .select({ id: savedItems.id })
              .from(savedItems)
              .where(
                and(
                  eq(savedItems.id, activity.itemId),
                  eq(savedItems.userId, owner)
                )
              );
            if (!item) {
              throw new Error("Activity owner mismatch.");
            }
            const values = {
              id: activity.id,
              userId: owner,
              itemId: activity.itemId,
              network: activity.network,
              transactionHash: activity.transactionHash,
              blockNumber: activity.blockNumber,
              observedAt: activity.observedAt,
              finality: activity.finality,
              delivery: activity.delivery,
              document,
            };
            const saved = await tx
              .insert(walletActivities)
              .values(values)
              .onConflictDoUpdate({
                target: walletActivities.id,
                set: {
                  document,
                  blockNumber: values.blockNumber,
                  finality: values.finality,
                  delivery: values.delivery,
                },
                setWhere: eq(walletActivities.userId, owner),
              })
              .returning({ id: walletActivities.id });
            if (saved.length !== 1) {
              throw new Error("Activity owner mismatch.");
            }
          },
          activities: async (owner, ids) => {
            if (ids.length > WALLET_STORE_PAGE_SIZE) {
              throw new Error("Activity page exceeds its bound.");
            }
            if (ids.length === 0) {
              return [];
            }
            const rows = await tx
              .select()
              .from(walletActivities)
              .where(
                and(
                  eq(walletActivities.userId, owner),
                  inArray(walletActivities.id, [...ids])
                )
              );
            return rows.map((activity) =>
              Schema.decodeUnknownSync(WalletActivity)(activity.document)
            );
          },
          provisional: async (after) => await activityPage(false, after),
          awaitingDelivery: async (after) => await activityPage(true, after),
          alert: readAlert,
          saveAlert,
          pending: async (now) => {
            const rows = await tx
              .select()
              .from(walletAlerts)
              .where(
                and(
                  eq(walletAlerts.network, network),
                  isNull(walletAlerts.summaryId),
                  inArray(walletAlerts.state, ["pending", "sending"]),
                  lt(walletAlerts.notBefore, now + 1)
                )
              )
              .orderBy(asc(walletAlerts.createdAt), asc(walletAlerts.id))
              .limit(50);
            return rows.map((alert) =>
              Schema.decodeUnknownSync(WalletAlert)(alert.document)
            );
          },
          alertsFor: async (monitorId, after) => {
            const rows = await tx
              .select()
              .from(walletAlerts)
              .where(
                and(
                  eq(walletAlerts.monitorId, monitorId),
                  after ? gt(walletAlerts.id, after) : undefined
                )
              )
              .orderBy(asc(walletAlerts.id))
              .limit(WALLET_STORE_PAGE_SIZE);
            return rows.map((alert) =>
              Schema.decodeUnknownSync(WalletAlert)(alert.document)
            );
          },
          claimActivitySlot: async (input, now) => {
            const alert = await readAlert(input.key);
            if (
              !alert ||
              alert.id !== input.id ||
              alert.owner !== input.owner
            ) {
              throw new Error("Save an alert before reserving delivery.");
            }
            if (alert.reservedMinute !== undefined) {
              return true;
            }
            const minute = Math.floor(now / 60_000);
            await tx
              .insert(walletAlertWindows)
              .values({ userId: alert.owner, minute, slots: 0 })
              .onConflictDoNothing();
            const [window] = await tx
              .select()
              .from(walletAlertWindows)
              .where(
                and(
                  eq(walletAlertWindows.userId, alert.owner),
                  eq(walletAlertWindows.minute, minute)
                )
              );
            if (!window || window.slots >= 5) {
              return false;
            }
            await tx
              .update(walletAlertWindows)
              .set({ slots: window.slots + 1 })
              .where(
                and(
                  eq(walletAlertWindows.userId, alert.owner),
                  eq(walletAlertWindows.minute, minute)
                )
              );
            await saveAlert({ ...alert, reservedMinute: minute });
            return true;
          },
          deferToSummary: async (input, now) => {
            const alert = await readAlert(input.key);
            if (
              !alert ||
              alert.id !== input.id ||
              alert.owner !== input.owner
            ) {
              throw new Error("Save an alert before grouping delivery.");
            }
            if (alert.summaryId) {
              const [previous] = await tx
                .select()
                .from(walletAlerts)
                .where(eq(walletAlerts.id, alert.summaryId));
              if (!previous) {
                throw new Error("Summary record is missing.");
              }
              return Schema.decodeUnknownSync(WalletAlert)(previous.document);
            }
            const minute = Math.floor(now / 60_000);
            await tx
              .insert(walletAlertWindows)
              .values({ userId: alert.owner, minute, slots: 0 })
              .onConflictDoNothing();
            const [window] = await tx
              .select()
              .from(walletAlertWindows)
              .where(
                and(
                  eq(walletAlertWindows.userId, alert.owner),
                  eq(walletAlertWindows.minute, minute)
                )
              );
            const [previous] =
              window?.summaryId !== null && window?.summaryId !== undefined
                ? await tx
                    .select()
                    .from(walletAlerts)
                    .where(eq(walletAlerts.id, window.summaryId))
                : [];
            const summary = previous
              ? Schema.decodeUnknownSync(WalletAlert)(previous.document)
              : walletSummaryAlert(alert, minute);
            if (summary.state !== "pending") {
              throw new Error("Cannot append to a claimed summary.");
            }
            await saveAlert(summary);
            await tx
              .update(walletAlertWindows)
              .set({ summaryId: summary.id })
              .where(
                and(
                  eq(walletAlertWindows.userId, alert.owner),
                  eq(walletAlertWindows.minute, minute)
                )
              );
            await saveAlert({
              ...alert,
              state: "grouped",
              summaryId: summary.id,
            });
            return summary;
          },
          summaryMembers: async (summaryId, after) => {
            const rows = await tx
              .select()
              .from(walletAlerts)
              .where(
                and(
                  eq(walletAlerts.summaryId, summaryId),
                  after ? gt(walletAlerts.id, after) : undefined
                )
              )
              .orderBy(asc(walletAlerts.id))
              .limit(WALLET_STORE_PAGE_SIZE);
            return rows.map((alert) =>
              Schema.decodeUnknownSync(WalletAlert)(alert.document)
            );
          },
          summaryCount: async (summaryId) => {
            const [result] = await tx
              .select({ count: count() })
              .from(walletAlerts)
              .where(
                and(
                  eq(walletAlerts.summaryId, summaryId),
                  eq(walletAlerts.state, "grouped")
                )
              );
            return result?.count ?? 0;
          },
          savePriceEvaluation: async (input) => {
            const record = Schema.decodeUnknownSync(WalletPriceEvaluation)(
              input
            );
            const [item] = await tx
              .select({ id: savedItems.id })
              .from(savedItems)
              .where(
                and(
                  eq(savedItems.id, record.itemId),
                  eq(savedItems.userId, record.owner)
                )
              );
            if (record.network !== network || !item) {
              throw new Error("Price evaluation owner or network mismatch.");
            }
            const saved = await tx
              .insert(walletPriceEvaluations)
              .values({
                id: record.id,
                userId: record.owner,
                itemId: record.itemId,
                network,
                blockNumber: record.blockNumber,
                document: record,
              })
              .onConflictDoUpdate({
                target: walletPriceEvaluations.id,
                set: { document: record, blockNumber: record.blockNumber },
                setWhere: raw`${walletPriceEvaluations.userId} = ${record.owner} and ${walletPriceEvaluations.network} = ${network}`,
              })
              .returning({ id: walletPriceEvaluations.id });
            if (saved.length !== 1) {
              throw new Error("Price evaluation owner or network mismatch.");
            }
          },
          priceEvaluationsAfter: async (block, after) => {
            const [cursor] = after
              ? await tx
                  .select()
                  .from(walletPriceEvaluations)
                  .where(
                    and(
                      eq(walletPriceEvaluations.id, after),
                      eq(walletPriceEvaluations.network, network)
                    )
                  )
              : [];
            if (after && !cursor) {
              throw new Error("Invalid price evaluation cursor.");
            }
            const rows = await tx
              .select()
              .from(walletPriceEvaluations)
              .where(
                and(
                  eq(walletPriceEvaluations.network, network),
                  gt(walletPriceEvaluations.blockNumber, block),
                  cursor
                    ? or(
                        lt(
                          walletPriceEvaluations.blockNumber,
                          cursor.blockNumber
                        ),
                        and(
                          eq(
                            walletPriceEvaluations.blockNumber,
                            cursor.blockNumber
                          ),
                          lt(walletPriceEvaluations.id, cursor.id)
                        )
                      )
                    : undefined
                )
              )
              .orderBy(
                desc(walletPriceEvaluations.blockNumber),
                desc(walletPriceEvaluations.id)
              )
              .limit(WALLET_STORE_PAGE_SIZE);
            return rows.map((record) =>
              Schema.decodeUnknownSync(WalletPriceEvaluation)(record.document)
            );
          },
          deletePriceEvaluation: async (id) => {
            await tx
              .delete(walletPriceEvaluations)
              .where(
                and(
                  eq(walletPriceEvaluations.id, id),
                  eq(walletPriceEvaluations.network, network)
                )
              );
          },
        });
      }),
    list: async (owner, itemId, before) => {
      const rows = await db
        .select()
        .from(walletActivities)
        .where(
          and(
            eq(walletActivities.userId, owner),
            eq(walletActivities.itemId, itemId),
            before ? lt(walletActivities.id, before) : undefined
          )
        )
        .orderBy(desc(walletActivities.id))
        .limit(50);
      return rows.map((row) =>
        Schema.decodeUnknownSync(WalletActivity)(row.document)
      );
    },
    forget: async (owner) => {
      await db.transaction(async (tx) => {
        await tx.execute(raw`set local lock_timeout = '5s'`);
        await tx.execute(raw`set local statement_timeout = '10s'`);
        await tx.execute(
          raw`select pg_advisory_xact_lock(hashtextextended('wallet-stream', 0))`
        );
        await tx.delete(walletAlerts).where(eq(walletAlerts.userId, owner));
        await tx
          .delete(walletActivities)
          .where(eq(walletActivities.userId, owner));
        await tx
          .delete(walletAlertWindows)
          .where(eq(walletAlertWindows.userId, owner));
        await tx
          .delete(walletPriceEvaluations)
          .where(eq(walletPriceEvaluations.userId, owner));
        await tx.update(walletStreamState).set({
          document: raw`jsonb_set(${walletStreamState.document}, '{generation}', to_jsonb((${walletStreamState.document}->>'generation')::bigint + 1))`,
        });
      });
    },
    prune: async (before) => {
      await db.transaction(async (tx) => {
        await tx.execute(raw`set local lock_timeout = '5s'`);
        await tx.execute(raw`set local statement_timeout = '10s'`);
        await tx.execute(
          raw`select pg_advisory_xact_lock(hashtextextended('wallet-stream', 0))`
        );
        await tx
          .delete(walletAlerts)
          .where(
            and(
              lt(walletAlerts.createdAt, before),
              inArray(walletAlerts.state, [
                "delivered",
                "cancelled",
                "not_paired",
                "failed",
                "uncertain",
              ])
            )
          );
        await tx
          .delete(walletActivities)
          .where(
            and(
              lt(walletActivities.observedAt, before),
              inArray(walletActivities.finality, [
                "finalized",
                "reverted",
                "unverified",
              ]),
              ne(walletActivities.delivery, "waiting")
            )
          );
        await tx
          .delete(walletAlertWindows)
          .where(
            lt(walletAlertWindows.minute, Math.floor(before / 60_000) - 1)
          );
        await tx
          .delete(walletPriceEvaluations)
          .where(
            raw`${walletPriceEvaluations.blockNumber} <= (select (${walletStreamState.document}->>'finalizedBlock')::bigint from ${walletStreamState} where ${walletStreamState.network} = ${walletPriceEvaluations.network})`
          );
      });
    },
  };
};
