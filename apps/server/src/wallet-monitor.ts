import {
  OnchainAlertRuleId,
  OnchainNetwork,
  WALLET_MONITOR_ADDRESS_LIMIT,
  WALLET_MONITOR_DURATION_MS,
  WALLET_MONITOR_USER_LIMIT,
  WalletMonitorId,
  WatchlistItemId,
  watchlistSourceKey,
} from "@froggy/domain";
import type {
  AgentConnectionId,
  OnchainAlertCondition,
  OnchainAlertRule,
  UserId,
  WalletMonitor,
  WalletMonitorStatus,
  WatchlistInput,
  WatchlistItem,
} from "@froggy/domain";
import type { WalletStream } from "@froggy/graph";
import type { Store, WalletActivityTransaction } from "@froggy/wallet";
import { Schema } from "effect";

import { connectionScopes } from "./capabilities";
import type { PriceBlock, PriceResolver } from "./onchain-price";

export interface WalletMonitorDeps {
  readonly store: Store;
  readonly source: WalletStream;
  readonly network: OnchainNetwork;
  readonly now: () => number;
  readonly head: () => Promise<number>;
  readonly headBlock?: () => Promise<PriceBlock>;
  readonly prices?: PriceResolver | undefined;
  readonly authorized?: (
    owner: UserId,
    monitor: WalletMonitor
  ) => Promise<boolean>;
  readonly forNetwork?: (network: OnchainNetwork) => WalletMonitorDeps;
}
export const monitorIsActive = (item: WatchlistItem, now: number): boolean =>
  !item.archived &&
  item.walletMonitor?.enabled === true &&
  item.walletMonitor.expiresAt > now;
export const monitorNetworkName = (network: string): string =>
  network === "eip155:4663" ? "Robinhood" : "Base";
const selectMonitorNetwork = (
  deps: WalletMonitorDeps,
  network: string
): WalletMonitorDeps => {
  const parsed = Schema.decodeUnknownSync(OnchainNetwork)(network);
  if (parsed === deps.network) {
    return deps;
  }
  const selected = deps.forNetwork?.(parsed);
  if (!selected) {
    throw new Error("Onchain monitoring is unavailable on this network.");
  }
  return selected;
};
export const ownedMonitorItem = async (
  tx: WalletActivityTransaction,
  owner: UserId,
  itemId: WatchlistItemId
): Promise<WatchlistItem | undefined> => {
  const items = await tx.items(owner);
  return items.find((item) => item.id === itemId);
};
interface MonitorOptions {
  readonly telegram: boolean;
  readonly conditions: readonly OnchainAlertCondition[];
  readonly connectionId?: AgentConnectionId | null;
}
const sameConditions = (
  item: WatchlistItem,
  options: MonitorOptions,
  now: number
): boolean => {
  const monitor = item.walletMonitor;
  return (
    monitorIsActive(item, now) &&
    monitor?.telegram === options.telegram &&
    JSON.stringify(monitor.rules?.map((rule) => rule.condition)) ===
      JSON.stringify(options.conditions)
  );
};
const resolveRules = async (
  deps: WalletMonitorDeps,
  input: WatchlistInput,
  options: MonitorOptions,
  block: PriceBlock | undefined
): Promise<OnchainAlertRule[]> => {
  const rules: OnchainAlertRule[] = [];
  for (const condition of options.conditions) {
    let source = null;
    if (condition._tag === "price") {
      if (
        !deps.prices ||
        !block ||
        input.source._tag !== "token" ||
        !/[1-9]/u.test(condition.threshold)
      ) {
        throw new Error(
          "A positive threshold and live price source are required."
        );
      }
      source = await deps.prices.resolve({
        network: deps.network,
        token: input.source.address,
        quoteCurrency: condition.quoteCurrency,
        block,
      });
    }
    rules.push({
      id: OnchainAlertRuleId.generate(),
      condition,
      source,
      latest: null,
      triggeredBlock: null,
    });
  }
  return rules;
};
const configuredItem = (
  input: WatchlistInput,
  current: WatchlistItem | undefined,
  options: MonitorOptions,
  rules: readonly OnchainAlertRule[],
  now: number,
  head: number
): WatchlistItem => {
  const previous = current?.walletMonitor;
  const expiresAt =
    current && previous && monitorIsActive(current, now)
      ? previous.expiresAt
      : now + WALLET_MONITOR_DURATION_MS;
  return {
    ...input,
    ...current,
    v: 1,
    id: current?.id ?? WatchlistItemId.generate(),
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    revision: (current?.revision ?? 0) + 1,
    archived: false,
    walletMonitor: {
      v: 1,
      id: previous?.id ?? WalletMonitorId.generate(),
      revision: (previous?.revision ?? 0) + 1,
      enabled: true,
      connectionId: options.connectionId ?? null,
      startedAt: now,
      expiresAt,
      startBlock: head + 1,
      telegram: options.telegram,
      swaps: rules.some((rule) => rule.condition._tag === "swap"),
      transfers: rules.some((rule) => rule.condition._tag === "transfer"),
      rules,
    },
  };
};
const assertCapacity = async (
  tx: WalletActivityTransaction,
  owner: UserId,
  item: WatchlistItem,
  now: number
): Promise<void> => {
  const watches = await tx.watches();
  const active = watches.filter(
    (row) => row.item.id !== item.id && monitorIsActive(row.item, now)
  );
  if (
    active.filter((row) => row.owner === owner).length >=
    WALLET_MONITOR_USER_LIMIT
  ) {
    throw new Error("You can watch three items at a time. Pause one first.");
  }
  const sameNetwork = active.filter(
    (row) =>
      (row.item.source._tag === "wallet" || row.item.source._tag === "token") &&
      (item.source._tag === "wallet" || item.source._tag === "token") &&
      row.item.source.network === item.source.network
  );
  const addresses = new Set(
    sameNetwork
      .filter((row) => row.item.source._tag === "wallet")
      .map((row) => watchlistSourceKey(row.item.source))
  );
  if (item.source._tag === "wallet") {
    addresses.add(watchlistSourceKey(item.source));
  }
  const sources = new Set(
    [...sameNetwork.map((row) => row.item), item].flatMap(
      (saved) =>
        saved.walletMonitor?.rules?.flatMap((rule) =>
          rule.source ? [rule.source.key] : []
        ) ?? []
    )
  );
  if (addresses.size > WALLET_MONITOR_ADDRESS_LIMIT || sources.size > 20) {
    throw new Error(
      "Onchain monitoring is at capacity. Try again after a watch expires."
    );
  }
};
const cancelPending = async (
  tx: WalletActivityTransaction,
  monitor: WalletMonitor
): Promise<void> => {
  let activityAfter;
  for (;;) {
    const page = await tx.awaitingDelivery(activityAfter);
    for (const { owner, activity } of page) {
      if (activity.monitorId === monitor.id) {
        await tx.saveActivity(owner, { ...activity, delivery: "cancelled" });
      }
    }
    if (page.length < 200) {
      break;
    }
    activityAfter = page.at(-1)?.activity.id;
  }
  let after;
  for (;;) {
    const alerts = await tx.alertsFor(monitor.id, after);
    for (const alert of alerts) {
      if (
        (alert.state === "pending" || alert.state === "grouped") &&
        alert.kind !== "correction"
      ) {
        await tx.saveAlert({ ...alert, state: "cancelled" });
        for (const activity of await tx.activities(
          alert.owner,
          alert.activityIds
        )) {
          await tx.saveActivity(alert.owner, {
            ...activity,
            delivery: "cancelled",
          });
        }
      }
    }
    if (alerts.length < 200) {
      break;
    }
    after = alerts.at(-1)?.id;
  }
};
export const configureOnchainMonitor = async (
  initial: WalletMonitorDeps,
  owner: UserId,
  input: WatchlistInput,
  options: MonitorOptions
): Promise<WatchlistItem> => {
  if (input.source._tag !== "wallet" && input.source._tag !== "token") {
    throw new Error("Onchain alerts require a wallet or token.");
  }
  const deps = selectMonitorNetwork(initial, input.source.network);
  if (!deps.source.available) {
    throw new Error("Onchain streaming is unavailable on this deployment.");
  }
  if (options.conditions.length < 1 || options.conditions.length > 4) {
    throw new Error("Choose between one and four alert conditions.");
  }
  if (
    options.conditions.some(
      (condition) =>
        (condition._tag === "price") !== (input.source._tag === "token")
    )
  ) {
    throw new Error(
      "Price alerts belong to a saved token; movement alerts belong to a saved wallet."
    );
  }
  const existing = await deps.store.walletActivity.transact(async (tx) => {
    const items = await tx.items(owner);
    return items.find(
      (item) =>
        watchlistSourceKey(item.source) === watchlistSourceKey(input.source)
    );
  }, deps.network);
  if (existing && sameConditions(existing, options, deps.now())) {
    return existing;
  }
  const priceBlock = options.conditions.some(
    (condition) => condition._tag === "price"
  )
    ? await deps.headBlock?.()
    : undefined;
  const head = priceBlock?.number ?? (await deps.head());
  const rules = await resolveRules(deps, input, options, priceBlock);
  return await deps.store.walletActivity.transact(async (tx) => {
    const now = deps.now();
    const items = await tx.items(owner);
    const current = items.find(
      (item) =>
        watchlistSourceKey(item.source) === watchlistSourceKey(input.source)
    );
    if (current && sameConditions(current, options, now)) {
      return current;
    }
    if (current && current.revision !== existing?.revision) {
      throw new Error(
        "This watch changed while its source was being checked. Try again."
      );
    }
    if (!current && items.length >= 200) {
      throw new Error("Your watchlist is full. Remove an archived item first.");
    }
    if (current?.walletMonitor) {
      await cancelPending(tx, current.walletMonitor);
    }
    const item = configuredItem(
      input,
      current,
      options,
      rules,
      now,
      Math.max(head, tx.checkpoint.block)
    );
    await assertCapacity(tx, owner, item, now);
    await tx.saveItem(owner, item);
    await tx.bumpGenerations();
    return item;
  }, deps.network);
};
export const trackWallet = async (
  deps: WalletMonitorDeps,
  owner: UserId,
  input: WatchlistInput,
  options: {
    readonly telegram: boolean;
    readonly swaps: boolean;
    readonly transfers: boolean;
    readonly connectionId?: AgentConnectionId | null;
  }
): Promise<WatchlistItem> => {
  const conditions: OnchainAlertCondition[] = [];
  if (options.transfers) {
    conditions.push({ _tag: "transfer", direction: "both", token: null });
  }
  if (options.swaps) {
    conditions.push({ _tag: "swap", side: "both", token: null });
  }
  return await configureOnchainMonitor(deps, owner, input, {
    telegram: options.telegram,
    conditions,
    connectionId: options.connectionId ?? null,
  });
};
const changedMonitor = (
  item: WatchlistItem,
  monitor: WalletMonitor,
  action: "pause" | "resume" | "extend" | "rearm",
  now: number,
  head: number
): WalletMonitor => {
  const continuous = action === "extend" && monitorIsActive(item, now);
  const reset = action === "rearm" || (action === "extend" && !continuous);
  const next = {
    ...monitor,
    enabled: action !== "pause",
    revision: continuous ? monitor.revision : monitor.revision + 1,
    startedAt: continuous || action === "pause" ? monitor.startedAt : now,
    startBlock:
      continuous || action === "pause" ? monitor.startBlock : head + 1,
    expiresAt:
      action === "extend"
        ? now + WALLET_MONITOR_DURATION_MS
        : monitor.expiresAt,
  };
  if (monitor.rules) {
    next.rules = monitor.rules.map((rule) => ({
      ...rule,
      latest: action === "pause" || continuous ? rule.latest : null,
      triggeredBlock: reset ? null : rule.triggeredBlock,
    }));
  }
  return next;
};
export const updateWalletMonitor = async (
  initial: WalletMonitorDeps,
  owner: UserId,
  itemId: WatchlistItemId,
  action: "pause" | "resume" | "extend" | "rearm"
): Promise<WatchlistItem> => {
  const found = await initial.store.walletActivity.transact(
    async (tx) => await ownedMonitorItem(tx, owner, itemId)
  );
  if (
    !found?.walletMonitor ||
    (found.source._tag !== "wallet" && found.source._tag !== "token")
  ) {
    throw new Error("Onchain monitor not found.");
  }
  const deps = selectMonitorNetwork(initial, found.source.network);
  if (action !== "pause" && !deps.source.available) {
    throw new Error("Onchain streaming is unavailable on this deployment.");
  }
  const head = action === "pause" ? 0 : await deps.head();
  return await deps.store.walletActivity.transact(async (tx) => {
    const item = await ownedMonitorItem(tx, owner, itemId);
    const monitor = item?.walletMonitor;
    if (!item || !monitor) {
      throw new Error("Onchain monitor not found.");
    }
    const now = deps.now();
    if (action !== "pause" && item.archived) {
      throw new Error("Restore this saved item before restarting its watch.");
    }
    if (
      (action === "resume" || action === "rearm") &&
      monitor.expiresAt <= now
    ) {
      throw new Error(
        "This watch expired. Extend it to start a new 24-hour watch."
      );
    }
    if (
      (action === "pause" && !monitor.enabled) ||
      (action === "resume" && monitorIsActive(item, now))
    ) {
      return item;
    }
    if (action !== "pause") {
      await assertCapacity(tx, owner, item, now);
    }
    const next = {
      ...item,
      updatedAt: now,
      revision: item.revision + 1,
      walletMonitor: changedMonitor(
        item,
        monitor,
        action,
        now,
        Math.max(head, tx.checkpoint.block)
      ),
    };
    if (next.walletMonitor.revision !== monitor.revision) {
      await cancelPending(tx, monitor);
    }
    await tx.saveItem(owner, next);
    await tx.bumpGenerations();
    return next;
  }, deps.network);
};
export const walletMonitorStatus = async (
  initial: WalletMonitorDeps,
  owner: UserId,
  itemId: WatchlistItemId
): Promise<WalletMonitorStatus> => {
  const found = await initial.store.walletActivity.transact(
    async (tx) => await ownedMonitorItem(tx, owner, itemId)
  );
  if (
    !found ||
    (found.source._tag !== "wallet" && found.source._tag !== "token")
  ) {
    throw new Error("Saved onchain item not found.");
  }
  const deps = selectMonitorNetwork(initial, found.source.network);
  const paired = await deps.store.telegram.forUser(owner);
  return await deps.store.walletActivity.transact(async (tx) => {
    const item = await ownedMonitorItem(tx, owner, itemId);
    if (!item) {
      throw new Error("Saved onchain item not found.");
    }
    const now = deps.now();
    const monitor = item.walletMonitor ?? null;
    let state: WalletMonitorStatus["state"] = "saved";
    if (monitor) {
      const prices =
        monitor.rules?.filter((rule) => rule.condition._tag === "price") ?? [];
      if (monitor.expiresAt <= now) {
        state = "expired";
      } else if (item.archived || !monitor.enabled) {
        state = "paused";
      } else if (!deps.source.available) {
        state = "unavailable";
      } else if (
        prices.length > 0 &&
        prices.every((rule) => rule.triggeredBlock !== null)
      ) {
        state = "triggered";
      } else if (tx.checkpoint.block < monitor.startBlock) {
        state = "starting";
      } else if (
        now - tx.checkpoint.blockAt > 15_000 ||
        tx.checkpoint.error !== null
      ) {
        state = "delayed";
      } else if (prices.some((rule) => rule.latest?.status !== "available")) {
        state = "waiting_price";
      } else {
        state = "watching";
      }
    }
    return {
      v: 1,
      itemId,
      monitor,
      state,
      latestBlock: tx.checkpoint.block || null,
      latestBlockAt: tx.checkpoint.blockAt || null,
      telegramPaired: paired !== null,
      gapSince: tx.checkpoint.gapSince,
      coverage: `${monitorNetworkName(deps.network)} ETH and ERC20 transfers; verified Uniswap v2/v3/v4 ${deps.network === "eip155:8453" ? "and Aerodrome classic" : "and registered Pons"} swaps. Price source and units are shown per rule. Alerts are provisional until finalized.`,
      stubbed: deps.source.stubbed,
    };
  }, deps.network);
};
export const walletMonitorDependencies = (
  services: {
    readonly store: WalletMonitorDeps["store"];
    readonly walletStream: WalletStream;
    readonly walletStreams?: Readonly<Record<OnchainNetwork, WalletStream>>;
    readonly onchainPrices?: PriceResolver;
    readonly environment: {
      readonly walletStream: { readonly network: "eip155:8453" };
    };
  },
  network: OnchainNetwork = services.environment.walletStream.network
): WalletMonitorDeps => {
  const source = services.walletStreams?.[network] ?? services.walletStream;
  const headBlock = async (): Promise<PriceBlock> => {
    const checkpoint = await services.store.walletActivity.transact(
      async (tx) => await Promise.resolve(tx.checkpoint),
      network
    );
    if (
      Date.now() - checkpoint.blockAt < 5000 &&
      checkpoint.blockHash !== null &&
      checkpoint.error === null
    ) {
      return {
        number: checkpoint.block,
        hash: checkpoint.blockHash,
        timestamp: checkpoint.blockAt,
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, 15_000);
    try {
      for await (const message of source.blocks({
        addresses: [],
        startBlock: -1,
        signal: controller.signal,
      })) {
        if (
          message.kind === "block" &&
          message.extended &&
          !message.truncated &&
          Date.now() - message.timestamp < 15_000
        ) {
          controller.abort();
          return {
            number: message.number,
            hash: message.hash,
            timestamp: message.timestamp,
          };
        }
      }
      throw new Error(
        "The stream has not reached the current head. Try again shortly."
      );
    } catch {
      throw new Error(
        "The stream has not reached the current head. Try again shortly."
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  };
  return {
    store: services.store,
    source,
    network,
    now: Date.now,
    headBlock,
    head: async () => {
      const block = await headBlock();
      return block.number;
    },
    prices: services.onchainPrices,
    authorized: async (owner, monitor) => {
      if (!monitor.connectionId) {
        return true;
      }
      try {
        const scopes = await connectionScopes(
          services.store,
          owner,
          monitor.connectionId
        );
        return (
          scopes === null ||
          (scopes.has("automation") &&
            scopes.has("watchlist:write") &&
            (!monitor.telegram || scopes.has("notifications")))
        );
      } catch {
        return false;
      }
    },
    forNetwork: (selected) => walletMonitorDependencies(services, selected),
  };
};
