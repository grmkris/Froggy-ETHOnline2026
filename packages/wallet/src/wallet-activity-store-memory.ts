import {
  WalletActivity,
  WalletPriceEvaluation,
  WatchlistItem,
} from "@froggy/domain";
import type {
  NoticeId,
  UserId,
  WalletActivityId,
  WatchlistItemId,
} from "@froggy/domain";
import { Schema } from "effect";

import {
  emptyWalletStreamCheckpoint,
  WALLET_STORE_PAGE_SIZE,
  WalletAlert,
  WalletStreamCheckpoint,
  walletSummaryAlert,
} from "./wallet-activity-store";
import type {
  StoredWalletActivity,
  WalletActivityStore,
  WalletStreamNetwork,
} from "./wallet-activity-store";
import { validateWatchlistBook } from "./watchlist-store";
import type { WatchlistBook, WatchlistStore } from "./watchlist-store";

interface AlertWindow {
  readonly owner: UserId;
  readonly minute: number;
  readonly slots: number;
  readonly summaryId: NoticeId | null;
}

interface WalletActivityMemoryStores {
  readonly watchlist: WatchlistStore;
  readonly walletActivity: WalletActivityStore;
}
const bump = (book: Map<WalletStreamNetwork, WalletStreamCheckpoint>): void => {
  for (const [network, checkpoint] of book) {
    book.set(network, {
      ...checkpoint,
      generation: checkpoint.generation + 1,
    });
  }
};

export const memoryWalletActivityStores = (): WalletActivityMemoryStores => {
  let items = new Map<UserId, WatchlistBook>();
  let activities = new Map<WalletActivityId, StoredWalletActivity>();
  let alerts = new Map<string, WalletAlert>();
  let checkpoints = new Map<WalletStreamNetwork, WalletStreamCheckpoint>();
  let windows = new Map<string, AlertWindow>();
  let evaluations = new Map<WalletActivityId, WalletPriceEvaluation>();
  let pending: Promise<unknown> = Promise.resolve();
  const lock = async <T>(operation: () => Promise<T>): Promise<T> => {
    const previous = pending;
    const release = Promise.withResolvers<null>();
    pending = release.promise;
    await previous;
    try {
      return await operation();
    } finally {
      release.resolve(null);
    }
  };
  const forget = (owner: UserId): void => {
    for (const [key, row] of activities) {
      if (row.owner === owner) {
        activities.delete(key);
      }
    }
    for (const [key, row] of alerts) {
      if (row.owner === owner) {
        alerts.delete(key);
      }
    }
    for (const [key, row] of windows) {
      if (row.owner === owner) {
        windows.delete(key);
      }
    }
    for (const [key, row] of evaluations) {
      if (row.owner === owner) {
        evaluations.delete(key);
      }
    }
    bump(checkpoints);
  };
  const removeItem = (owner: UserId, id: WatchlistItemId): void => {
    for (const [key, row] of activities) {
      if (row.owner === owner && row.activity.itemId === id) {
        activities.delete(key);
      }
    }
    for (const [key, row] of alerts) {
      if (row.owner === owner && row.itemId === id) {
        alerts.delete(key);
      }
    }
    for (const [key, row] of evaluations) {
      if (row.owner === owner && row.itemId === id) {
        evaluations.delete(key);
      }
    }
  };
  const watchlist: WatchlistStore = {
    transact: async (owner, operation) =>
      await lock(async () => {
        const before =
          items.get(owner) ?? new Map<WatchlistItemId, WatchlistItem>();
        const after = structuredClone(before);
        const result = operation(after);
        validateWatchlistBook(after);
        let changed = false;
        for (const item of before.values()) {
          const next = after.get(item.id);
          if (!next) {
            removeItem(owner, item.id);
          }
          if (
            !item.walletMonitor ||
            Bun.deepEquals(
              { archived: item.archived, monitor: item.walletMonitor },
              { archived: next?.archived, monitor: next?.walletMonitor },
              true
            )
          ) {
            continue;
          }
          for (const alert of alerts.values()) {
            if (
              alert.owner === owner &&
              alert.itemId === item.id &&
              ["pending", "grouped"].includes(alert.state) &&
              alert.kind !== "correction"
            ) {
              alerts.set(alert.key, { ...alert, state: "cancelled" });
            }
          }
          for (const [id, row] of activities) {
            if (
              row.owner === owner &&
              row.activity.itemId === item.id &&
              row.activity.delivery === "waiting"
            ) {
              activities.set(id, {
                ...row,
                activity: { ...row.activity, delivery: "cancelled" },
              });
            }
          }
          changed = true;
        }
        if (changed) {
          bump(checkpoints);
        }
        items.set(owner, after);
        return await Promise.resolve(structuredClone(result));
      }),
    forget: async (owner) => {
      await lock(async () => {
        items.delete(owner);
        forget(owner);
        await Promise.resolve();
      });
    },
  };
  const walletActivity: WalletActivityStore = {
    transact: async (operation, network = "eip155:8453") =>
      await lock(async () => {
        const nextItems = structuredClone(items);
        const nextActivities = structuredClone(activities);
        const nextAlerts = structuredClone(alerts);
        const nextCheckpoints = structuredClone(checkpoints);
        const nextWindows = structuredClone(windows);
        const nextEvaluations = structuredClone(evaluations);
        const checkpoint =
          nextCheckpoints.get(network) ?? emptyWalletStreamCheckpoint();
        nextCheckpoints.set(network, checkpoint);
        const saveAlert = async (input: WalletAlert): Promise<void> => {
          const previous = nextAlerts.get(input.key);
          if (
            previous &&
            (previous.owner !== input.owner || previous.id !== input.id)
          ) {
            throw new Error("Alert identity belongs to another record.");
          }
          if (
            input.itemId &&
            nextItems.get(input.owner)?.has(input.itemId) !== true
          ) {
            throw new Error("Saved item not found.");
          }
          const alert = Schema.decodeUnknownSync(WalletAlert)({
            ...previous,
            ...input,
          });
          nextAlerts.set(alert.key, structuredClone(alert));
          await Promise.resolve();
        };
        const activityPage = (
          predicate: (activity: WalletActivity) => boolean,
          after?: WalletActivityId
        ): readonly StoredWalletActivity[] =>
          [...nextActivities.values()]
            .filter(
              (row) =>
                row.activity.network === network &&
                (!after || row.activity.id > after) &&
                predicate(row.activity)
            )
            .toSorted((a, b) => a.activity.id.localeCompare(b.activity.id))
            .slice(0, WALLET_STORE_PAGE_SIZE);
        const alertPage = (
          predicate: (alert: WalletAlert) => boolean,
          after?: NoticeId
        ): readonly WalletAlert[] =>
          [...nextAlerts.values()]
            .filter((alert) => (!after || alert.id > after) && predicate(alert))
            .toSorted((a, b) => a.id.localeCompare(b.id))
            .slice(0, WALLET_STORE_PAGE_SIZE);
        const result = await operation({
          network,
          checkpoint: structuredClone(checkpoint),
          saveCheckpoint: async (value) => {
            nextCheckpoints.set(
              network,
              Schema.decodeUnknownSync(WalletStreamCheckpoint)(value)
            );
            await Promise.resolve();
          },
          bumpGenerations: async () => {
            bump(nextCheckpoints);
            await Promise.resolve();
          },
          watches: async () =>
            await Promise.resolve(
              [...nextItems].flatMap(([owner, book]) =>
                [...book.values()]
                  .filter((item) => item.walletMonitor?.enabled === true)
                  .map((item) => ({ owner, item }))
              )
            ),
          items: async (owner) =>
            await Promise.resolve([...(nextItems.get(owner)?.values() ?? [])]),
          saveItem: async (owner, item) => {
            for (const [other, book] of nextItems) {
              if (other !== owner && book.has(item.id)) {
                throw new Error("Saved item belongs to another person.");
              }
            }
            const book = nextItems.get(owner) ?? new Map();
            book.set(item.id, Schema.decodeUnknownSync(WatchlistItem)(item));
            validateWatchlistBook(book);
            nextItems.set(owner, book);
            await Promise.resolve();
          },
          activity: async (owner, itemId, transactionHash) =>
            await Promise.resolve(
              [...nextActivities.values()].find(
                (row) =>
                  row.owner === owner &&
                  row.activity.itemId === itemId &&
                  row.activity.transactionHash === transactionHash
              )?.activity ?? null
            ),
          saveActivity: async (owner, activity) => {
            const previous = nextActivities.get(activity.id);
            if (
              (previous && previous.owner !== owner) ||
              nextItems.get(owner)?.has(activity.itemId) !== true
            ) {
              throw new Error("Activity owner mismatch.");
            }
            const duplicate = [...nextActivities.values()].some(
              (row) =>
                row.owner === owner &&
                row.activity.itemId === activity.itemId &&
                activity.transactionHash !== null &&
                row.activity.transactionHash === activity.transactionHash &&
                row.activity.id !== activity.id
            );
            if (duplicate) {
              throw new Error("Duplicate wallet transaction.");
            }
            nextActivities.set(activity.id, {
              owner,
              activity: Schema.decodeUnknownSync(WalletActivity)(activity),
            });
            await Promise.resolve();
          },
          activities: async (owner, ids) => {
            if (ids.length > WALLET_STORE_PAGE_SIZE) {
              throw new Error("Activity page exceeds its bound.");
            }
            return await Promise.resolve(
              [...nextActivities.values()]
                .filter(
                  (row) => row.owner === owner && ids.includes(row.activity.id)
                )
                .map((row) => row.activity)
            );
          },
          provisional: async (after) =>
            await Promise.resolve(
              activityPage(
                (activity) => activity.finality === "provisional",
                after
              )
            ),
          awaitingDelivery: async (after) =>
            await Promise.resolve(
              activityPage(
                (activity) =>
                  activity.delivery === "waiting" &&
                  activity.finality !== "reverted" &&
                  activity.finality !== "unverified",
                after
              )
            ),
          alert: async (key) =>
            await Promise.resolve(nextAlerts.get(key) ?? null),
          saveAlert,
          pending: async (now) =>
            await Promise.resolve(
              [...nextAlerts.values()]
                .filter(
                  (alert) =>
                    alert.network === network &&
                    alert.summaryId === undefined &&
                    ["pending", "sending"].includes(alert.state) &&
                    alert.notBefore <= now
                )
                .toSorted(
                  (a, b) =>
                    a.createdAt - b.createdAt || a.id.localeCompare(b.id)
                )
                .slice(0, 50)
            ),
          alertsFor: async (monitorId, after) =>
            await Promise.resolve(
              alertPage((alert) => alert.monitorId === monitorId, after)
            ),
          claimActivitySlot: async (input, now) => {
            const alert = nextAlerts.get(input.key);
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
            const key = `${alert.owner}:${minute}`;
            const window = nextWindows.get(key) ?? {
              owner: alert.owner,
              minute,
              slots: 0,
              summaryId: null,
            };
            if (window.slots >= 5) {
              return false;
            }
            nextWindows.set(key, { ...window, slots: window.slots + 1 });
            await saveAlert({ ...alert, reservedMinute: minute });
            return true;
          },
          deferToSummary: async (input, now) => {
            const alert = nextAlerts.get(input.key);
            if (
              !alert ||
              alert.id !== input.id ||
              alert.owner !== input.owner
            ) {
              throw new Error("Save an alert before grouping delivery.");
            }
            if (alert.summaryId) {
              const previous = [...nextAlerts.values()].find(
                (candidate) => candidate.id === alert.summaryId
              );
              if (!previous) {
                throw new Error("Summary record is missing.");
              }
              return previous;
            }
            const minute = Math.floor(now / 60_000);
            const key = `${alert.owner}:${minute}`;
            const window = nextWindows.get(key) ?? {
              owner: alert.owner,
              minute,
              slots: 0,
              summaryId: null,
            };
            const summary = window.summaryId
              ? [...nextAlerts.values()].find(
                  (candidate) => candidate.id === window.summaryId
                )
              : walletSummaryAlert(alert, minute);
            if (!summary || summary.state !== "pending") {
              throw new Error("Cannot append to a claimed summary.");
            }
            await saveAlert(summary);
            nextWindows.set(key, { ...window, summaryId: summary.id });
            await saveAlert({
              ...alert,
              state: "grouped",
              summaryId: summary.id,
            });
            return summary;
          },
          summaryMembers: async (summaryId, after) =>
            await Promise.resolve(
              alertPage((alert) => alert.summaryId === summaryId, after)
            ),
          summaryCount: async (summaryId) =>
            await Promise.resolve(
              [...nextAlerts.values()].filter(
                (alert) =>
                  alert.summaryId === summaryId && alert.state === "grouped"
              ).length
            ),
          savePriceEvaluation: async (input) => {
            const record = Schema.decodeUnknownSync(WalletPriceEvaluation)(
              input
            );
            const previous = nextEvaluations.get(record.id);
            if (
              record.network !== network ||
              (previous && previous.owner !== record.owner) ||
              nextItems.get(record.owner)?.has(record.itemId) !== true
            ) {
              throw new Error("Price evaluation owner or network mismatch.");
            }
            nextEvaluations.set(record.id, record);
            await Promise.resolve();
          },
          priceEvaluationsAfter: async (block, after) => {
            const cursor = after ? nextEvaluations.get(after) : undefined;
            if (after && (!cursor || cursor.network !== network)) {
              throw new Error("Invalid price evaluation cursor.");
            }
            return await Promise.resolve(
              [...nextEvaluations.values()]
                .filter(
                  (record) =>
                    record.network === network &&
                    record.blockNumber > block &&
                    (!cursor ||
                      record.blockNumber < cursor.blockNumber ||
                      (record.blockNumber === cursor.blockNumber &&
                        record.id < cursor.id))
                )
                .toSorted(
                  (a, b) =>
                    b.blockNumber - a.blockNumber || b.id.localeCompare(a.id)
                )
                .slice(0, WALLET_STORE_PAGE_SIZE)
            );
          },
          deletePriceEvaluation: async (id) => {
            if (nextEvaluations.get(id)?.network === network) {
              nextEvaluations.delete(id);
            }
            await Promise.resolve();
          },
        });
        items = nextItems;
        activities = nextActivities;
        alerts = nextAlerts;
        checkpoints = nextCheckpoints;
        windows = nextWindows;
        evaluations = nextEvaluations;
        return structuredClone(result);
      }),
    list: async (owner, itemId, before) =>
      await lock(
        async () =>
          await Promise.resolve(
            [...activities.values()]
              .filter(
                (row) =>
                  row.owner === owner &&
                  row.activity.itemId === itemId &&
                  (!before || row.activity.id < before)
              )
              .map((row) => row.activity)
              .toSorted((a, b) => b.id.localeCompare(a.id))
              .slice(0, 50)
          )
      ),
    forget: async (owner) => {
      await lock(async () => {
        forget(owner);
        await Promise.resolve();
      });
    },
    prune: async (before) => {
      await lock(async () => {
        for (const [key, row] of activities) {
          if (
            row.activity.observedAt < before &&
            row.activity.finality !== "provisional" &&
            row.activity.delivery !== "waiting"
          ) {
            activities.delete(key);
          }
        }
        for (const [key, row] of alerts) {
          if (
            row.createdAt < before &&
            !["pending", "sending", "grouped"].includes(row.state)
          ) {
            alerts.delete(key);
          }
        }
        for (const [key, row] of windows) {
          if ((row.minute + 1) * 60_000 < before) {
            windows.delete(key);
          }
        }
        for (const [key, row] of evaluations) {
          if (
            row.blockNumber <=
            (checkpoints.get(row.network)?.finalizedBlock ?? -1)
          ) {
            evaluations.delete(key);
          }
        }
        await Promise.resolve();
      });
    },
  };
  return { watchlist, walletActivity };
};
