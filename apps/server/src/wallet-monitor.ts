import {
  OnchainAlertRuleId,
  OnchainNetwork,
  WALLET_MONITOR_ADDRESS_LIMIT,
  WALLET_MONITOR_DURATION_MS,
  WALLET_MONITOR_USER_LIMIT,
  WalletMonitorId,
  WatchlistItemId,
  listChainNames,
  monitorCoverage,
  monitorStartBlock,
  supportedPresence,
  visiblePresence,
  watchlistSourceKey,
} from "@froggy/domain";
import type {
  AgentConnectionId,
  OnchainAlertCondition,
  OnchainAlertRule,
  UserId,
  WalletMonitor,
  WalletMonitorCoverage,
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
/** Whether a saved watch streams on this chain; rows written before decision 0037 name one chain on their source. */
export const watchCovers = (
  item: WatchlistItem,
  network: OnchainNetwork
): boolean => {
  const monitor = item.walletMonitor;
  if (!monitor) {
    return false;
  }
  const coverage = monitorCoverage(monitor);
  if (coverage.length > 0) {
    return coverage.some((entry) => entry.network === network);
  }
  return (
    (item.source._tag === "wallet" || item.source._tag === "token") &&
    item.source.network === network
  );
};
/** The block this chain's stream starts reading from, null when the watch does not cover it. */
export const watchStartBlock = (
  item: WatchlistItem,
  network: OnchainNetwork
): number | null => {
  const monitor = item.walletMonitor;
  if (!monitor || !watchCovers(item, network)) {
    return null;
  }
  return monitorStartBlock(monitor, network) ?? monitor.startBlock;
};
const coveredNetworks = (item: WatchlistItem): readonly OnchainNetwork[] => {
  const monitor = item.walletMonitor;
  if (!monitor) {
    return [];
  }
  const coverage = monitorCoverage(monitor);
  if (coverage.length > 0) {
    return coverage.map((entry) => entry.network);
  }
  const named =
    item.source._tag === "wallet" || item.source._tag === "token"
      ? item.source.network
      : null;
  return named !== null && Schema.is(OnchainNetwork)(named) ? [named] : [];
};
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
  /** A restriction, never a default: the watch covers every supported chain the address was seen on. */
  readonly networks?: readonly OnchainNetwork[];
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
  coverage: readonly WalletMonitorCoverage[]
): WatchlistItem => {
  const [first] = coverage;
  if (first === undefined) {
    throw new Error("A watch needs at least one chain.");
  }
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
      startBlock: first.startBlock,
      telegram: options.telegram,
      swaps: rules.some((rule) => rule.condition._tag === "swap"),
      transfers: rules.some((rule) => rule.condition._tag === "transfer"),
      rules,
      networks: coverage,
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
  for (const network of coveredNetworks(item)) {
    const sameNetwork = active.filter((row) => watchCovers(row.item, network));
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
            rule.source && rule.source.network === network
              ? [rule.source.key]
              : []
          ) ?? []
      )
    );
    if (addresses.size > WALLET_MONITOR_ADDRESS_LIMIT || sources.size > 20) {
      throw new Error(
        `Onchain monitoring on ${monitorNetworkName(network)} is at capacity. Try again after a watch expires.`
      );
    }
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
/** Which chains the watch covers: the caller's restriction, else every supported chain the address was seen on. */
const coverageFor = async (
  initial: WalletMonitorDeps,
  owner: UserId,
  input: WatchlistInput,
  options: MonitorOptions
): Promise<readonly OnchainNetwork[]> => {
  if (options.networks !== undefined && options.networks.length > 0) {
    return [...new Set(options.networks)];
  }
  if (input.source._tag !== "wallet" && input.source._tag !== "token") {
    return [];
  }
  const existing = await initial.store.watchlist.transact(owner, (book) =>
    [...book.values()].find(
      (item) =>
        watchlistSourceKey(item.source) === watchlistSourceKey(input.source)
    )
  );
  const data = existing
    ? await initial.store.watchlistData.transact(owner, (book) =>
        book.get(existing.id)
      )
    : undefined;
  const presence = data?.presence ?? [];
  const supported = supportedPresence(presence);
  if (supported.length > 0) {
    return supported;
  }
  const seen = visiblePresence(presence).filter(
    (row) => row.status === "observed"
  );
  if (seen.length > 0) {
    throw new Error(
      `Froggy has not seen this address on Base or Robinhood, the chains alerts can watch. It was found on ${listChainNames(seen.map((row) => row.network))} only.`
    );
  }
  const pending = data?.discovery ?? null;
  if (pending !== null && ["queued", "running"].includes(pending.status)) {
    throw new Error(
      "Still checking which chains this address is on. Try again in a moment."
    );
  }
  // Nothing known yet: the one chain the source names, until the identity commit of 0037.
  return Schema.is(OnchainNetwork)(input.source.network)
    ? [input.source.network]
    : [];
};
interface ChainHead {
  readonly deps: WalletMonitorDeps;
  readonly block: PriceBlock | null;
  readonly head: number;
  readonly checkpoint: number;
}
/** The stream head on every covered chain; a chain whose head cannot be read is left out, and said so. */
const chainHeads = async (
  perNetwork: readonly WalletMonitorDeps[],
  needsPrice: boolean
): Promise<readonly ChainHead[]> => {
  const heads: ChainHead[] = [];
  let failure: Error | null = null;
  for (const deps of perNetwork) {
    try {
      const block = needsPrice ? ((await deps.headBlock?.()) ?? null) : null;
      const head = block?.number ?? (await deps.head());
      const checkpoint = await deps.store.walletActivity.transact(
        async (tx) => await Promise.resolve(tx.checkpoint.block),
        deps.network
      );
      heads.push({ deps, block, head, checkpoint });
    } catch (error) {
      failure =
        error instanceof Error
          ? error
          : new Error(
              "The stream has not reached the current head. Try again shortly."
            );
    }
  }
  if (heads.length === 0) {
    throw (
      failure ??
      new Error(
        "The stream has not reached the current head. Try again shortly."
      )
    );
  }
  return heads;
};
/** Price rules resolve on the first covered chain that has a source; the rule records which. */
const resolveRulesOn = async (
  heads: readonly ChainHead[],
  input: WatchlistInput,
  options: MonitorOptions
): Promise<OnchainAlertRule[]> => {
  let failure: Error | null = null;
  for (const { deps, block } of heads) {
    try {
      return await resolveRules(deps, input, options, block ?? undefined);
    } catch (error) {
      failure =
        error instanceof Error
          ? error
          : new Error(
              "A positive threshold and live price source are required."
            );
    }
  }
  throw (
    failure ??
    new Error("A positive threshold and live price source are required.")
  );
};
const sameCoverage = (
  item: WatchlistItem,
  networks: readonly OnchainNetwork[]
): boolean => {
  const covered = coveredNetworks(item);
  return (
    covered.length === networks.length &&
    networks.every((network) => covered.includes(network))
  );
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
  const networks = await coverageFor(initial, owner, input, options);
  const perNetwork = networks.flatMap((network) => {
    try {
      const selected = selectMonitorNetwork(initial, network);
      return selected.source.available ? [selected] : [];
    } catch {
      return [];
    }
  });
  const [deps] = perNetwork;
  if (deps === undefined) {
    throw new Error("Onchain streaming is unavailable on this deployment.");
  }
  const existing = await deps.store.walletActivity.transact(async (tx) => {
    const items = await tx.items(owner);
    return items.find(
      (item) =>
        watchlistSourceKey(item.source) === watchlistSourceKey(input.source)
    );
  }, deps.network);
  const covered = perNetwork.map((selected) => selected.network);
  if (
    existing &&
    sameConditions(existing, options, deps.now()) &&
    sameCoverage(existing, covered)
  ) {
    return existing;
  }
  const heads = await chainHeads(
    perNetwork,
    options.conditions.some((condition) => condition._tag === "price")
  );
  const rules = await resolveRulesOn(heads, input, options);
  return await deps.store.walletActivity.transact(async (tx) => {
    const now = deps.now();
    const items = await tx.items(owner);
    const current = items.find(
      (item) =>
        watchlistSourceKey(item.source) === watchlistSourceKey(input.source)
    );
    if (
      current &&
      sameConditions(current, options, now) &&
      sameCoverage(current, covered)
    ) {
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
    const coverage = heads.map(({ deps: chain, head, checkpoint }) => ({
      network: chain.network,
      startBlock:
        Math.max(
          head,
          chain.network === tx.network ? tx.checkpoint.block : checkpoint
        ) + 1,
    }));
    const item = configuredItem(input, current, options, rules, now, coverage);
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
    readonly networks?: readonly OnchainNetwork[];
  }
): Promise<WatchlistItem> => {
  const conditions: OnchainAlertCondition[] = [];
  if (options.transfers) {
    conditions.push({ _tag: "transfer", direction: "both", token: null });
  }
  if (options.swaps) {
    conditions.push({ _tag: "swap", side: "both", token: null });
  }
  const configured: MonitorOptions = {
    telegram: options.telegram,
    conditions,
    connectionId: options.connectionId ?? null,
  };
  return await configureOnchainMonitor(
    deps,
    owner,
    input,
    options.networks === undefined
      ? configured
      : { ...configured, networks: options.networks }
  );
};
const changedMonitor = (
  item: WatchlistItem,
  monitor: WalletMonitor,
  action: "pause" | "resume" | "extend" | "rearm",
  now: number,
  heads: ReadonlyMap<OnchainNetwork, number>,
  main: OnchainNetwork
): WalletMonitor => {
  const continuous = action === "extend" && monitorIsActive(item, now);
  const reset = action === "rearm" || (action === "extend" && !continuous);
  const keep = continuous || action === "pause";
  const coverage = monitorCoverage(monitor);
  const restarted = coverage.map((entry) => {
    const head = heads.get(entry.network);
    return keep || head === undefined
      ? entry
      : { ...entry, startBlock: head + 1 };
  });
  const mainStart = (heads.get(main) ?? monitor.startBlock - 1) + 1;
  const base = {
    ...monitor,
    enabled: action !== "pause",
    revision: continuous ? monitor.revision : monitor.revision + 1,
    startedAt: keep ? monitor.startedAt : now,
    startBlock: keep
      ? monitor.startBlock
      : (restarted[0]?.startBlock ?? mainStart),
    expiresAt:
      action === "extend"
        ? now + WALLET_MONITOR_DURATION_MS
        : monitor.expiresAt,
  };
  const next: WalletMonitor =
    coverage.length > 0 ? { ...base, networks: restarted } : base;
  if (!monitor.rules) {
    return next;
  }
  return {
    ...next,
    rules: monitor.rules.map((rule) => ({
      ...rule,
      latest: action === "pause" || continuous ? rule.latest : null,
      triggeredBlock: reset ? null : rule.triggeredBlock,
    })),
  };
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
  const perNetwork = coveredNetworks(found).flatMap((network) => {
    try {
      const selected = selectMonitorNetwork(initial, network);
      return action === "pause" || selected.source.available ? [selected] : [];
    } catch {
      return [];
    }
  });
  const [deps] = perNetwork;
  if (deps === undefined) {
    throw new Error("Onchain streaming is unavailable on this deployment.");
  }
  const heads = new Map<OnchainNetwork, number>();
  if (action !== "pause") {
    for (const { deps: chain, head, checkpoint } of await chainHeads(
      perNetwork,
      false
    )) {
      heads.set(chain.network, Math.max(head, checkpoint));
    }
  }
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
    const mainHead = heads.get(deps.network);
    if (mainHead !== undefined) {
      heads.set(deps.network, Math.max(mainHead, tx.checkpoint.block));
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
        heads,
        deps.network
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
export type WalletStreamHealth =
  | "stub"
  | "unavailable"
  | "idle"
  | "connecting"
  | "live"
  | "delayed";

/** Configuration permits a connection; only fresh stream progress proves it live. */
export const walletStreamHealth = async (
  deps: WalletMonitorDeps
): Promise<WalletStreamHealth> => {
  if (!deps.source.available) {
    return "unavailable";
  }
  if (deps.source.stubbed) {
    return "stub";
  }
  const checkpoint = await deps.store.walletActivity.transact(
    async (tx) => await Promise.resolve(tx.checkpoint),
    deps.network
  );
  if (checkpoint.error !== null) {
    return "unavailable";
  }
  if (checkpoint.leaseUntil <= deps.now()) {
    return "idle";
  }
  if (checkpoint.blockAt === 0) {
    return "connecting";
  }
  return deps.now() - checkpoint.blockAt > 15_000 ? "delayed" : "live";
};

type MonitorState = WalletMonitorStatus["state"];
const SEVERITY: readonly MonitorState[] = [
  "saved",
  "triggered",
  "watching",
  "waiting_price",
  "starting",
  "delayed",
  "paused",
  "expired",
  "unavailable",
];
const worstState = (states: readonly MonitorState[]): MonitorState => {
  let worst: MonitorState = "saved";
  for (const state of states) {
    if (SEVERITY.indexOf(state) > SEVERITY.indexOf(worst)) {
      worst = state;
    }
  }
  return worst;
};
const stateFor = (
  item: WatchlistItem,
  deps: WalletMonitorDeps,
  tx: WalletActivityTransaction,
  now: number
): MonitorState => {
  const monitor = item.walletMonitor;
  if (!monitor) {
    return "saved";
  }
  const prices =
    monitor.rules?.filter((rule) => rule.condition._tag === "price") ?? [];
  const startBlock = watchStartBlock(item, deps.network) ?? monitor.startBlock;
  if (monitor.expiresAt <= now) {
    return "expired";
  }
  if (item.archived || !monitor.enabled) {
    return "paused";
  }
  if (!deps.source.available || tx.checkpoint.error !== null) {
    return "unavailable";
  }
  if (
    prices.length > 0 &&
    prices.every((rule) => rule.triggeredBlock !== null)
  ) {
    return "triggered";
  }
  if (tx.checkpoint.block < startBlock) {
    return "starting";
  }
  if (now - tx.checkpoint.blockAt > 15_000) {
    return "delayed";
  }
  if (
    prices.some(
      (rule) =>
        rule.source?.network === deps.network &&
        rule.latest?.status !== "available"
    )
  ) {
    return "waiting_price";
  }
  return "watching";
};
type ChainStatus = NonNullable<WalletMonitorStatus["networks"]>[number] & {
  readonly gapSince: number | null;
};
const chainStatus = async (
  initial: WalletMonitorDeps,
  owner: UserId,
  itemId: WatchlistItemId,
  network: OnchainNetwork
): Promise<ChainStatus> => {
  let deps: WalletMonitorDeps;
  try {
    deps = selectMonitorNetwork(initial, network);
  } catch {
    return {
      network,
      state: "unavailable",
      latestBlock: null,
      latestBlockAt: null,
      stubbed: false,
      gapSince: null,
    };
  }
  return await deps.store.walletActivity.transact(async (tx) => {
    const item = await ownedMonitorItem(tx, owner, itemId);
    if (!item) {
      throw new Error("Saved onchain item not found.");
    }
    return {
      network,
      state: stateFor(item, deps, tx, deps.now()),
      latestBlock: tx.checkpoint.block || null,
      latestBlockAt: tx.checkpoint.blockAt || null,
      stubbed: deps.source.stubbed,
      gapSince: tx.checkpoint.gapSince,
    };
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
  const covered = coveredNetworks(found);
  const networks: readonly OnchainNetwork[] =
    covered.length > 0
      ? covered
      : [
          Schema.is(OnchainNetwork)(found.source.network)
            ? found.source.network
            : initial.network,
        ];
  const paired = await initial.store.telegram.forUser(owner);
  const entries: ChainStatus[] = [];
  for (const network of networks) {
    entries.push(await chainStatus(initial, owner, itemId, network));
  }
  const [first] = entries;
  const monitor = found.walletMonitor ?? null;
  return {
    v: 1,
    itemId,
    monitor,
    state: monitor ? worstState(entries.map((entry) => entry.state)) : "saved",
    latestBlock: first?.latestBlock ?? null,
    latestBlockAt: first?.latestBlockAt ?? null,
    telegramPaired: paired !== null,
    gapSince: first?.gapSince ?? null,
    coverage: `${listChainNames(networks)}: ETH and ERC20 transfers; verified Uniswap v2/v3/v4 swaps, Aerodrome classic on Base and registered Pons on Robinhood. Price source and units are shown per rule. Alerts are provisional until finalized.`,
    stubbed: entries.some((entry) => entry.stubbed),
    networks: entries.map(({ gapSince: _gap, ...entry }) => entry),
  };
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
