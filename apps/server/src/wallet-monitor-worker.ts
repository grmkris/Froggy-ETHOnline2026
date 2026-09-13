import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";

import { WalletActivityId } from "@froggy/domain";
import type {
  OnchainAlertRule,
  UserId,
  WalletActivity,
  WalletPriceEvaluation,
  WatchlistItem,
} from "@froggy/domain";
import type { WalletStreamBlock, WalletStreamMessage } from "@froggy/graph";
import type { WalletActivityTransaction, WalletAlert } from "@froggy/wallet";

import {
  describeWalletActivity,
  walletActivityMatches,
  walletActivityText,
} from "./wallet-activity";
import type { WalletVenueVerifier } from "./wallet-activity";
import { alertFor, recordCorrection } from "./wallet-alert-delivery";
import {
  monitorIsActive as active,
  monitorNetworkName,
  ownedMonitorItem,
} from "./wallet-monitor";
import type { WalletMonitorDeps } from "./wallet-monitor";
import { commitPriceRules, readBlockPrices } from "./wallet-price-events";

export { dispatchWalletAlerts } from "./wallet-alert-delivery";
export type WalletAlertDelivery =
  | { readonly kind: "delivered"; readonly messageId: string }
  | { readonly kind: "not_paired" }
  | {
      readonly kind: "definitely_not_sent";
      readonly retryAfterMs: number | null;
    }
  | { readonly kind: "uncertain" };
export interface WalletWorkerDeps extends WalletMonitorDeps {
  readonly verifier: WalletVenueVerifier;
  readonly appUrl: string;
  readonly deliver: (alert: WalletAlert) => Promise<WalletAlertDelivery>;
  readonly invalidate: (owner: UserId) => void;
}
interface Fence {
  readonly epoch: number;
  readonly generation: number;
}
const ownsFence = (
  tx: WalletActivityTransaction,
  fence: Fence,
  now: number
): boolean =>
  tx.checkpoint.epoch === fence.epoch &&
  tx.checkpoint.generation === fence.generation &&
  tx.checkpoint.leaseUntil > now;
const hasPendingReconciliation = async (
  tx: WalletActivityTransaction
): Promise<boolean> => {
  const provisional = await tx.provisional();
  if (provisional.length > 0) {
    return true;
  }
  const waiting = await tx.awaitingDelivery();
  return waiting.length > 0;
};
const advanceActivities = async (
  tx: WalletActivityTransaction,
  watches: readonly { readonly owner: UserId; readonly item: WatchlistItem }[],
  block: WalletStreamBlock,
  now: number,
  deps: WalletWorkerDeps
): Promise<void> => {
  let after;
  for (;;) {
    const page = await tx.awaitingDelivery(after);
    for (const { owner, activity } of page) {
      if (block.number < activity.blockNumber + 2) {
        continue;
      }
      const item = watches.find(
        (watch) => watch.owner === owner && watch.item.id === activity.itemId
      )?.item;
      const monitor = item?.walletMonitor;
      if (
        !item ||
        !monitor ||
        !active(item, now) ||
        monitor.revision !== activity.monitorRevision ||
        !monitor.telegram ||
        !walletActivityMatches(monitor, activity)
      ) {
        await tx.saveActivity(owner, { ...activity, delivery: "cancelled" });
        continue;
      }
      const key = `activity:${activity.id}:${activity.blockHash}`;
      if (!(await tx.alert(key))) {
        await tx.saveAlert(
          alertFor(
            owner,
            item,
            "activity",
            key,
            walletActivityText(activity, deps.appUrl),
            now,
            [activity.id]
          )
        );
      }
    }
    if (page.length < 200) {
      break;
    }
    after = page.at(-1)?.activity.id;
  }
  after = undefined;
  for (;;) {
    const page = await tx.provisional(after);
    for (const { owner, activity } of page) {
      if (activity.blockNumber <= block.finalizedBlock) {
        await tx.saveActivity(owner, { ...activity, finality: "finalized" });
      }
    }
    if (page.length < 200) {
      break;
    }
    after = page.at(-1)?.activity.id;
  }
};
const commitWatchActivity = async (
  tx: WalletActivityTransaction,
  owner: UserId,
  item: WatchlistItem,
  block: WalletStreamBlock,
  prices: Awaited<ReturnType<typeof readBlockPrices>>,
  descriptions: ReadonlyMap<
    string,
    Awaited<ReturnType<typeof describeWalletActivity>>
  >,
  now: number,
  deps: WalletWorkerDeps
): Promise<void> => {
  const monitor = item.walletMonitor;
  if (!monitor) {
    return;
  }
  if (item.source._tag === "token") {
    await commitPriceRules(tx, owner, item, block, prices, now);
    return;
  }
  if (item.source._tag !== "wallet") {
    return;
  }
  for (const candidate of block.transactions) {
    if (candidate.wallet !== item.source.address.toLowerCase()) {
      continue;
    }
    const description = descriptions.get(
      `${candidate.wallet}:${candidate.hash}`
    );
    if (!description || description.flows.length === 0) {
      continue;
    }
    const previous = await tx.activity(owner, item.id, candidate.hash);
    if (previous?.blockHash === block.hash) {
      continue;
    }
    const activity: WalletActivity = {
      v: 1,
      id: previous?.id ?? WalletActivityId.generate(),
      itemId: item.id,
      monitorId: monitor.id,
      monitorRevision: monitor.revision,
      network: deps.network,
      wallet: item.source.address,
      transactionHash: candidate.hash,
      blockHash: block.hash,
      blockNumber: block.number,
      blockTime: block.timestamp,
      observedAt: now,
      ...description,
      kind: !block.extended || block.truncated ? "activity" : description.kind,
      complete: description.complete && block.extended && !block.truncated,
      finality: "provisional",
      delivery: "waiting",
      telegramMessageId: null,
      stubbed: block.stubbed,
    };
    await tx.saveActivity(owner, activity);
  }
};
const recordReady = async (
  tx: WalletActivityTransaction,
  owner: UserId,
  item: WatchlistItem,
  block: WalletStreamBlock,
  prices: Awaited<ReturnType<typeof readBlockPrices>>,
  now: number,
  deps: WalletWorkerDeps
): Promise<void> => {
  const monitor = item.walletMonitor;
  if (
    monitor?.telegram !== true ||
    !block.extended ||
    block.truncated ||
    now - block.timestamp >= 15_000
  ) {
    return;
  }
  const key = `ready:${monitor.id}:${monitor.revision}`;
  if (await tx.alert(key)) {
    return;
  }
  const waitingPrice =
    item.source._tag === "token" &&
    (monitor.rules?.some((rule) => {
      const observation = rule.source
        ? (prices.get(rule.source.key) ?? rule.latest)
        : null;
      return (
        rule.condition._tag === "price" && observation?.status !== "available"
      );
    }) ??
      false);
  const waiting = waitingPrice ? " Waiting for a valid price observation." : "";
  const mode = block.stubbed ? "Demo: " : "";
  await tx.saveAlert(
    alertFor(
      owner,
      item,
      "ready",
      key,
      `${mode}Watching ${item.title} on ${monitorNetworkName(deps.network)} until ${new Date(monitor.expiresAt).toISOString()}.${waiting}\n${deps.appUrl}/watchlist/${item.id}`,
      now
    )
  );
};
export const commitWalletBlock = async (
  deps: WalletWorkerDeps,
  fence: Fence,
  block: WalletStreamBlock
): Promise<boolean> => {
  const descriptions = new Map<
    string,
    Awaited<ReturnType<typeof describeWalletActivity>>
  >();
  deps.verifier.beginBlock?.(block.number);
  for (const transaction of block.transactions) {
    descriptions.set(
      `${transaction.wallet}:${transaction.hash}`,
      await describeWalletActivity(transaction, block.number, deps.verifier)
    );
  }
  const prices = await readBlockPrices(deps, block);
  const owners = new Set<UserId>();
  let keepStreaming = true;
  const committed = await deps.store.walletActivity.transact(async (tx) => {
    const now = deps.now();
    if (!ownsFence(tx, fence, now)) {
      return false;
    }
    if (
      block.number < tx.checkpoint.block ||
      (block.number === tx.checkpoint.block &&
        tx.checkpoint.blockHash === block.hash)
    ) {
      return true;
    }
    if (
      block.number === tx.checkpoint.block &&
      tx.checkpoint.blockHash !== block.hash
    ) {
      throw new Error("Changed block requires a Substreams undo signal.");
    }
    const savedWatches = await tx.watches();
    const watches = savedWatches.filter(
      ({ item }) =>
        (item.source._tag === "wallet" || item.source._tag === "token") &&
        item.source.network === deps.network
    );
    let { generation } = tx.checkpoint;
    for (const { owner, item } of watches) {
      const monitor = item.walletMonitor;
      if (!monitor) {
        continue;
      }
      const allowed =
        !deps.authorized || (await deps.authorized(owner, monitor));
      if (monitor.enabled && (monitor.expiresAt <= now || !allowed)) {
        await tx.saveItem(owner, {
          ...item,
          revision: item.revision + 1,
          updatedAt: now,
          walletMonitor: {
            ...monitor,
            enabled: false,
            revision: monitor.revision + 1,
          },
        });
        generation += 1;
      }
      if (!allowed || !active(item, now) || block.number < monitor.startBlock) {
        continue;
      }
      owners.add(owner);
      await recordReady(tx, owner, item, block, prices, now, deps);
      await commitWatchActivity(
        tx,
        owner,
        item,
        block,
        prices,
        descriptions,
        now,
        deps
      );
    }
    await advanceActivities(tx, watches, block, now, deps);
    if (
      watches.every(({ item }) => !active(item, now)) &&
      !(await hasPendingReconciliation(tx))
    ) {
      generation += 1;
      keepStreaming = false;
    }
    await tx.saveCheckpoint({
      ...tx.checkpoint,
      generation,
      cursor: block.cursor,
      block: block.number,
      blockHash: block.hash,
      blockAt: block.timestamp,
      finalizedBlock: block.finalizedBlock,
      error:
        block.extended && !block.truncated
          ? null
          : "Onchain stream coverage is incomplete.",
      leaseUntil: now + 45_000,
    });
    return true;
  }, deps.network);
  if (committed) {
    for (const owner of owners) {
      deps.invalidate(owner);
    }
  }
  return committed && keepStreaming;
};
const undoPriceRule = (
  rule: OnchainAlertRule,
  record: WalletPriceEvaluation
): OnchainAlertRule => {
  const previous = record.before.rules?.find((saved) => saved.id === rule.id);
  const after = record.after.rules?.find((saved) => saved.id === rule.id);
  // A rearm or replacement may have changed state since this block was observed.
  // Pause preserves this state, so a paused monitor still receives chain rollback.
  if (
    !previous ||
    !after ||
    rule.source?.key !== after.source?.key ||
    rule.triggeredBlock !== after.triggeredBlock ||
    !isDeepStrictEqual(rule.condition, after.condition) ||
    !isDeepStrictEqual(rule.latest, after.latest)
  ) {
    return rule;
  }
  return {
    ...rule,
    latest: previous.latest,
    triggeredBlock: previous.triggeredBlock,
  };
};
const undoPrices = async (
  tx: WalletActivityTransaction,
  lastValidBlock: number
): Promise<void> => {
  for (;;) {
    const evaluations = await tx.priceEvaluationsAfter(lastValidBlock);
    for (const record of evaluations) {
      const item = await ownedMonitorItem(tx, record.owner, record.itemId);
      if (
        item?.walletMonitor?.id === record.monitorId &&
        item.walletMonitor.rules
      ) {
        const rules = item.walletMonitor.rules.map((rule) =>
          undoPriceRule(rule, record)
        );
        await tx.saveItem(record.owner, {
          ...item,
          walletMonitor: { ...item.walletMonitor, rules },
        });
      }
      await tx.deletePriceEvaluation(record.id);
    }
    if (evaluations.length < 200) {
      break;
    }
  }
};
const cancelActivityAlerts = async (
  tx: WalletActivityTransaction,
  activity: WalletActivity
): Promise<void> => {
  let after;
  for (;;) {
    const alerts = await tx.alertsFor(activity.monitorId, after);
    for (const alert of alerts) {
      if (
        alert.kind !== "correction" &&
        alert.activityIds.includes(activity.id) &&
        (alert.state === "pending" || alert.state === "grouped")
      ) {
        await tx.saveAlert({ ...alert, state: "cancelled" });
      }
    }
    if (alerts.length < 200) {
      break;
    }
    after = alerts.at(-1)?.id;
  }
};
const recoverMonitoringGap = async (
  tx: WalletActivityTransaction,
  deps: WalletWorkerDeps,
  owners: Set<UserId>,
  now: number
): Promise<void> => {
  await undoPrices(tx, tx.checkpoint.finalizedBlock);
  let after;
  for (;;) {
    const page = await tx.provisional(after);
    for (const { owner, activity } of page) {
      const unverified: WalletActivity = {
        ...activity,
        finality: "unverified",
        delivery:
          activity.delivery === "waiting" ? "cancelled" : activity.delivery,
      };
      await tx.saveActivity(owner, unverified);
      await cancelActivityAlerts(tx, unverified);
      if (
        activity.delivery === "delivered" ||
        activity.delivery === "summarized"
      ) {
        await recordCorrection(tx, owner, unverified, deps.appUrl, now);
      }
      owners.add(owner);
    }
    if (page.length < 200) {
      break;
    }
    after = page.at(-1)?.activity.id;
  }
  for (const { owner, item } of await tx.watches()) {
    const monitor = item.walletMonitor;
    if (
      item.source._tag !== "token" ||
      item.source.network !== deps.network ||
      !monitor?.rules
    ) {
      continue;
    }
    const rules = monitor.rules.map((rule) => {
      if (
        rule.triggeredBlock !== null &&
        rule.triggeredBlock <= tx.checkpoint.finalizedBlock
      ) {
        return rule;
      }
      return { ...rule, latest: null, triggeredBlock: null };
    });
    await tx.saveItem(owner, { ...item, walletMonitor: { ...monitor, rules } });
    owners.add(owner);
  }
};
export const undoWalletBlock = async (
  deps: WalletWorkerDeps,
  fence: Fence,
  undo: Extract<WalletStreamMessage, { readonly kind: "undo" }>
): Promise<boolean> => {
  const owners = new Set<UserId>();
  const committed = await deps.store.walletActivity.transact(async (tx) => {
    const now = deps.now();
    if (!ownsFence(tx, fence, now)) {
      return false;
    }
    if (undo.lastValidBlock < tx.checkpoint.finalizedBlock) {
      throw new Error("Substreams attempted to undo finalized activity.");
    }
    await undoPrices(tx, undo.lastValidBlock);
    let after;
    for (;;) {
      const page = await tx.provisional(after);
      for (const { owner, activity } of page) {
        if (activity.blockNumber <= undo.lastValidBlock) {
          continue;
        }
        await tx.saveActivity(owner, {
          ...activity,
          finality: "reverted",
          delivery:
            activity.delivery === "waiting" ? "cancelled" : activity.delivery,
        });
        await cancelActivityAlerts(tx, activity);
        if (
          activity.delivery === "delivered" ||
          activity.delivery === "summarized"
        ) {
          await recordCorrection(tx, owner, activity, deps.appUrl, now);
        }
        owners.add(owner);
      }
      if (page.length < 200) {
        break;
      }
      after = page.at(-1)?.activity.id;
    }
    await tx.saveCheckpoint({
      ...tx.checkpoint,
      cursor: undo.cursor,
      block: undo.lastValidBlock,
      blockHash: undo.lastValidHash.startsWith("0x")
        ? undo.lastValidHash
        : `0x${undo.lastValidHash}`,
      error: "Reconciling a chain reorganization.",
    });
    return true;
  }, deps.network);
  if (committed) {
    for (const owner of owners) {
      deps.invalidate(owner);
    }
  }
  return committed;
};
const pause = async (signal: AbortSignal, ms: number): Promise<void> => {
  await delay(ms, null, { signal }).catch(() => null);
};
const runStream = async (
  deps: WalletWorkerDeps,
  signal: AbortSignal
): Promise<void> => {
  const sourceIdentity = `${deps.network}:${(await deps.source.identity?.()) ?? "froggy-wallet-v2"}`;
  const claim = await deps.store.walletActivity.transact(async (tx) => {
    const now = deps.now();
    if (tx.checkpoint.leaseUntil > now) {
      return null;
    }
    const savedWatches = await tx.watches();
    const watches = savedWatches.filter(
      ({ item }) =>
        active(item, now) &&
        (item.source._tag === "wallet" || item.source._tag === "token") &&
        item.source.network === deps.network
    );
    if (watches.length === 0 && !(await hasPendingReconciliation(tx))) {
      return null;
    }
    const stale =
      tx.checkpoint.blockAt > 0 && now - tx.checkpoint.blockAt > 30 * 60_000;
    const changed =
      tx.checkpoint.sourceIdentity !== undefined &&
      tx.checkpoint.sourceIdentity !== null &&
      tx.checkpoint.sourceIdentity !== sourceIdentity;
    const gapOwners = new Set<UserId>();
    if (stale || changed) {
      await recoverMonitoringGap(tx, deps, gapOwners, now);
    }
    const refreshed = await tx.watches();
    const claimedWatches = refreshed.filter(
      ({ item }) =>
        active(item, now) &&
        (item.source._tag === "wallet" || item.source._tag === "token") &&
        item.source.network === deps.network
    );
    const checkpoint = {
      ...tx.checkpoint,
      sourceIdentity,
      epoch: tx.checkpoint.epoch + 1,
      leaseUntil: now + 45_000,
      cursor: stale || changed ? null : tx.checkpoint.cursor,
      gapSince:
        stale || changed ? tx.checkpoint.blockAt : tx.checkpoint.gapSince,
    };
    await tx.saveCheckpoint(checkpoint);
    return {
      checkpoint,
      gapOwners: [...gapOwners],
      addresses: [
        ...new Set(
          claimedWatches.flatMap(({ item }) =>
            item.source._tag === "wallet"
              ? [item.source.address.toLowerCase()]
              : []
          )
        ),
      ],
      sources: claimedWatches.flatMap(
        ({ item }) =>
          item.walletMonitor?.rules?.flatMap((rule) =>
            rule.source && rule.triggeredBlock === null ? [rule.source] : []
          ) ?? []
      ),
    };
  }, deps.network);
  if (!claim) {
    await pause(signal, 2000);
    return;
  }
  for (const owner of claim.gapOwners) {
    deps.invalidate(owner);
  }
  const controller = new AbortController();
  const cancel = (): void => {
    controller.abort();
  };
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) {
    controller.abort();
  }
  const fence = {
    epoch: claim.checkpoint.epoch,
    generation: claim.checkpoint.generation,
  };
  let lastMessage = deps.now();
  const heartbeat = async (): Promise<void> => {
    while (!controller.signal.aborted) {
      await pause(controller.signal, 5000);
      if (controller.signal.aborted) {
        return;
      }
      const observedAt = lastMessage;
      const valid = await deps.store.walletActivity
        .transact(async (tx) => {
          if (
            !ownsFence(tx, fence, deps.now()) ||
            deps.now() - observedAt > 20_000
          ) {
            return false;
          }
          await tx.saveCheckpoint({
            ...tx.checkpoint,
            leaseUntil: deps.now() + 45_000,
          });
          return true;
        }, deps.network)
        .catch(() => false);
      if (!valid) {
        controller.abort();
      }
    }
  };
  const beating = heartbeat();
  try {
    const subscriptions = new Map(
      claim.sources
        .flatMap((source) => deps.prices?.streamSubscriptions(source) ?? [])
        .map((source) => [
          `${source.key}:${source.contract}:${source.poolId}`,
          source,
        ])
    );
    const { cursor } = claim.checkpoint;
    const request = {
      addresses: claim.addresses,
      priceSources: [...subscriptions.values()],
      startBlock: cursor === null ? -1 : claim.checkpoint.block,
      signal: controller.signal,
    };
    const messages = deps.source.blocks(
      cursor === null ? request : { ...request, cursor }
    );
    for await (const message of messages) {
      lastMessage = deps.now();
      if (
        !(message.kind === "block"
          ? await commitWalletBlock(deps, fence, message)
          : await undoWalletBlock(deps, fence, message))
      ) {
        break;
      }
    }
  } finally {
    controller.abort();
    signal.removeEventListener("abort", cancel);
    await beating;
    await deps.store.walletActivity.transact(async (tx) => {
      if (tx.checkpoint.epoch === fence.epoch) {
        await tx.saveCheckpoint({ ...tx.checkpoint, leaseUntil: 0 });
      }
    }, deps.network);
  }
};
export const runWalletMonitorWorker = async (
  deps: WalletWorkerDeps,
  signal: AbortSignal
): Promise<void> => {
  let failures = 0;
  let lastPrune = 0;
  while (!signal.aborted) {
    if (!deps.source.available) {
      await pause(signal, 2000);
      continue;
    }
    try {
      if (deps.now() - lastPrune >= 24 * 60 * 60_000) {
        await deps.store.walletActivity.prune(
          deps.now() - 30 * 24 * 60 * 60_000
        );
        lastPrune = deps.now();
      }
      await runStream(deps, signal);
      failures = 0;
    } catch {
      failures += 1;
      await deps.store.walletActivity
        .transact(async (tx) => {
          await tx.saveCheckpoint({
            ...tx.checkpoint,
            error:
              "Onchain stream interrupted; reconnecting from its saved cursor.",
          });
        }, deps.network)
        .catch(() => null);
    }
    await pause(signal, Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)));
  }
};
