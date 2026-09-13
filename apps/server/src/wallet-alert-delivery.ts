import { setTimeout as delay } from "node:timers/promises";

import { NoticeId } from "@froggy/domain";
import type {
  UserId,
  WalletActivity,
  WalletActivityId,
  WatchlistItem,
} from "@froggy/domain";
import type { WalletActivityTransaction, WalletAlert } from "@froggy/wallet";

import {
  monitorIsActive,
  monitorNetworkName,
  ownedMonitorItem,
} from "./wallet-monitor";
import type {
  WalletAlertDelivery,
  WalletWorkerDeps,
} from "./wallet-monitor-worker";

export const alertFor = (
  owner: UserId,
  item: WatchlistItem,
  kind: WalletAlert["kind"],
  key: string,
  text: string,
  now: number,
  activityIds: readonly WalletActivityId[] = []
): WalletAlert => {
  if (
    !item.walletMonitor ||
    (item.source._tag !== "wallet" && item.source._tag !== "token")
  ) {
    throw new Error("Missing onchain monitor.");
  }
  const network =
    item.source.network === "eip155:4663" ? "eip155:4663" : "eip155:8453";
  return {
    v: 1,
    id: NoticeId.generate(),
    owner,
    network,
    itemId: item.id,
    monitorId: item.walletMonitor.id,
    revision: item.walletMonitor.revision,
    key,
    kind,
    text,
    activityIds,
    state: "pending",
    createdAt: now,
    notBefore: now,
    attempts: 0,
    claimUntil: 0,
    telegramMessageId: null,
  };
};
export const recordCorrection = async (
  tx: WalletActivityTransaction,
  owner: UserId,
  activity: WalletActivity,
  appUrl: string,
  now: number
): Promise<void> => {
  const item = await ownedMonitorItem(tx, owner, activity.itemId);
  if (!item?.walletMonitor) {
    return;
  }
  const gap = activity.finality === "unverified";
  const key = `${gap ? "gap-correction" : "correction"}:${activity.id}:${activity.blockHash}`;
  const reason = gap
    ? "could not be reverified after a monitoring gap"
    : "was removed by a chain reorganization";
  if (!(await tx.alert(key))) {
    await tx.saveAlert(
      alertFor(
        owner,
        item,
        "correction",
        key,
        `Correction: provisional ${monitorNetworkName(activity.network)} ${activity.kind === "price" ? "price evidence" : "wallet activity"} ${reason}.\n${appUrl}/watchlist/${item.id}`,
        now,
        [activity.id]
      )
    );
  }
};
const eligible = async (
  tx: WalletActivityTransaction,
  alert: WalletAlert,
  now: number,
  deps: WalletWorkerDeps
): Promise<boolean> => {
  if (alert.itemId === null) {
    return false;
  }
  const item = await ownedMonitorItem(tx, alert.owner, alert.itemId);
  if (!item || !item.walletMonitor) {
    return false;
  }
  if (alert.kind === "correction") {
    return true;
  }
  if (
    deps.authorized &&
    !(await deps.authorized(alert.owner, item.walletMonitor))
  ) {
    return false;
  }
  if (
    !monitorIsActive(item, now) ||
    !item.walletMonitor.telegram ||
    item.walletMonitor.revision !== alert.revision
  ) {
    return false;
  }
  const activities = await tx.activities(alert.owner, alert.activityIds);
  return (
    activities.length === alert.activityIds.length &&
    activities.every(
      (activity) =>
        activity.finality !== "reverted" && activity.finality !== "unverified"
    )
  );
};
const markDelivery = async (
  tx: WalletActivityTransaction,
  alert: WalletAlert,
  delivery: WalletActivity["delivery"],
  messageId: string | null,
  deps: WalletWorkerDeps
): Promise<void> => {
  if (alert.kind === "correction") {
    return;
  }
  for (const activity of await tx.activities(alert.owner, alert.activityIds)) {
    await tx.saveActivity(alert.owner, {
      ...activity,
      delivery,
      telegramMessageId: messageId,
    });
    if (
      (activity.finality === "reverted" ||
        activity.finality === "unverified") &&
      (delivery === "delivered" || delivery === "summarized")
    ) {
      await recordCorrection(
        tx,
        alert.owner,
        activity,
        deps.appUrl,
        deps.now()
      );
    }
  }
};
const summaryMembers = async (
  tx: WalletActivityTransaction,
  alert: WalletAlert,
  visit: (member: WalletAlert) => Promise<void>
): Promise<void> => {
  let after;
  for (;;) {
    const page = await tx.summaryMembers(alert.id, after);
    for (const member of page) {
      await visit(member);
    }
    if (page.length < 200) {
      break;
    }
    after = page.at(-1)?.id;
  }
};
const recordOutcome = async (
  tx: WalletActivityTransaction,
  alert: WalletAlert,
  state: "delivered" | "not_paired" | "failed" | "uncertain" | "cancelled",
  messageId: string | null,
  deps: WalletWorkerDeps
): Promise<void> => {
  await tx.saveAlert({ ...alert, state, telegramMessageId: messageId });
  if (alert.kind === "summary") {
    await summaryMembers(tx, alert, async (member) => {
      if (
        member.state !== "sending" &&
        !(state === "delivered" && member.state === "uncertain")
      ) {
        return;
      }
      await tx.saveAlert({ ...member, state, telegramMessageId: messageId });
      await markDelivery(
        tx,
        member,
        state === "delivered" ? "summarized" : state,
        messageId,
        deps
      );
    });
    return;
  }
  await markDelivery(tx, alert, state, messageId, deps);
};
const claimSummary = async (
  tx: WalletActivityTransaction,
  alert: WalletAlert,
  now: number,
  deps: WalletWorkerDeps
): Promise<WalletAlert | null> => {
  let count = 0;
  await summaryMembers(tx, alert, async (member) => {
    if (member.state === "sending") {
      count += 1;
      return;
    }
    if (member.state !== "grouped") {
      return;
    }
    if (!(await eligible(tx, member, now, deps))) {
      await recordOutcome(tx, member, "cancelled", null, deps);
      return;
    }
    await tx.saveAlert({
      ...member,
      state: "sending",
      claimUntil: now + 30_000,
      attempts: member.attempts + 1,
    });
    count += 1;
  });
  if (count === 0) {
    await tx.saveAlert({ ...alert, state: "cancelled" });
    return null;
  }
  return {
    ...alert,
    text: `${count} more onchain alerts matched your watches this minute.\nOpen Watchlist for the amounts, prices, networks and confirmation status.\n${deps.appUrl}/watchlist`,
  };
};
const deliverAndReconcile = async (
  deps: WalletWorkerDeps,
  alert: WalletAlert
): Promise<WalletAlertDelivery> => {
  const outcome = await deps
    .deliver(alert)
    .catch((): WalletAlertDelivery => ({ kind: "uncertain" }));
  if (outcome.kind === "delivered") {
    // A timed-out request can still finish. Its receipt resolves uncertainty without another send.
    await deps.store.walletActivity.transact(async (tx) => {
      const current = await tx.alert(alert.key);
      if (
        current?.state === "uncertain" &&
        current.attempts === alert.attempts
      ) {
        await recordOutcome(tx, current, "delivered", outcome.messageId, deps);
      }
    }, deps.network);
    deps.invalidate(alert.owner);
  }
  return outcome;
};
const boundedDelivery = async (
  deps: WalletWorkerDeps,
  alert: WalletAlert
): Promise<WalletAlertDelivery> => {
  const controller = new AbortController();
  try {
    return await Promise.race([
      deliverAndReconcile(deps, alert),
      delay(20_000, null, { signal: controller.signal }).then(
        (): WalletAlertDelivery => ({ kind: "uncertain" })
      ),
    ]);
  } finally {
    controller.abort();
  }
};
export const dispatchWalletAlerts = async (
  deps: WalletWorkerDeps
): Promise<void> => {
  const claimed = await deps.store.walletActivity.transact(async (tx) => {
    const now = deps.now();
    const result: WalletAlert[] = [];
    for (const entry of await tx.pending(now)) {
      if (entry.state === "sending") {
        if (entry.claimUntil <= now) {
          await recordOutcome(tx, entry, "uncertain", null, deps);
        }
        continue;
      }
      let alert: WalletAlert | null = entry;
      if (entry.kind === "summary") {
        alert = await claimSummary(tx, entry, now, deps);
      } else if (!(await eligible(tx, entry, now, deps))) {
        await recordOutcome(tx, entry, "cancelled", null, deps);
        continue;
      }
      if (!alert) {
        continue;
      }
      if (
        alert.kind === "activity" &&
        !(await tx.claimActivitySlot(alert, now))
      ) {
        await tx.deferToSummary(alert, now);
        continue;
      }
      const next: WalletAlert = {
        ...alert,
        state: "sending",
        attempts: alert.attempts + 1,
        claimUntil: now + 30_000,
      };
      await tx.saveAlert(next);
      result.push(next);
      if (result.length >= 5) {
        break;
      }
    }
    return result;
  }, deps.network);
  await Promise.all(
    claimed.map(async (alert) => {
      const outcome = await boundedDelivery(deps, alert);
      await deps.store.walletActivity.transact(async (tx) => {
        const current = await tx.alert(alert.key);
        if (
          !current ||
          current.state !== "sending" ||
          current.attempts !== alert.attempts
        ) {
          return;
        }
        if (outcome.kind === "delivered") {
          await recordOutcome(
            tx,
            current,
            "delivered",
            outcome.messageId,
            deps
          );
        } else if (outcome.kind === "not_paired") {
          await recordOutcome(tx, current, "not_paired", null, deps);
        } else if (
          outcome.kind === "definitely_not_sent" &&
          outcome.retryAfterMs !== null &&
          current.attempts < 3
        ) {
          await tx.saveAlert({
            ...current,
            state: "pending",
            notBefore:
              deps.now() +
              Math.max(outcome.retryAfterMs, 1000 * 2 ** current.attempts),
          });
        } else {
          await recordOutcome(
            tx,
            current,
            outcome.kind === "definitely_not_sent" ? "failed" : "uncertain",
            null,
            deps
          );
        }
      }, deps.network);
      deps.invalidate(alert.owner);
    })
  );
};
