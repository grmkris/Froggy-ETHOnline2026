import { matchesPriceThreshold, WalletActivityId } from "@froggy/domain";
import type {
  OnchainAlertRule,
  PriceObservation,
  UserId,
  WalletActivity,
  WatchlistItem,
} from "@froggy/domain";
import type { WalletStreamBlock } from "@froggy/graph";
import type { WalletActivityTransaction } from "@froggy/wallet";

import { monitorIsActive } from "./wallet-monitor";
import type { WalletMonitorDeps } from "./wallet-monitor";

export const readBlockPrices = async (
  deps: WalletMonitorDeps,
  block: WalletStreamBlock
): Promise<ReadonlyMap<string, PriceObservation>> => {
  const observations = new Map<string, PriceObservation>();
  if (!deps.prices || !block.extended || block.truncated) {
    return observations;
  }
  const watches = await deps.store.walletActivity.transact(
    async (tx) => await tx.watches(),
    deps.network
  );
  const changed = new Set(block.changedSources);
  for (const { item } of watches) {
    if (
      !monitorIsActive(item, deps.now()) ||
      item.source._tag !== "token" ||
      item.source.network !== deps.network ||
      block.number < (item.walletMonitor?.startBlock ?? 0)
    ) {
      continue;
    }
    for (const rule of item.walletMonitor?.rules ?? []) {
      if (!rule.source || rule.triggeredBlock !== null) {
        continue;
      }
      if (observations.has(rule.source.key)) {
        continue;
      }
      if (
        !rule.latest ||
        changed.has(rule.source.key) ||
        block.timestamp - rule.latest.blockTime >= 30_000
      ) {
        observations.set(
          rule.source.key,
          await deps.prices.read(rule.source, {
            number: block.number,
            hash: block.hash,
            timestamp: block.timestamp,
          })
        );
      }
    }
  }
  return observations;
};
const assertPriceEvidence = (
  observation: PriceObservation,
  sourceKey: string | undefined,
  network: string,
  block: WalletStreamBlock
): void => {
  if (
    observation.sourceKey !== sourceKey ||
    observation.network !== network ||
    observation.blockNumber !== block.number ||
    observation.blockTime !== block.timestamp ||
    observation.blockHash.toLowerCase() !== block.hash.toLowerCase() ||
    observation.stubbed !== block.stubbed
  ) {
    throw new Error("Price evidence does not match the stream block and mode.");
  }
};
export const commitPriceRules = async (
  tx: WalletActivityTransaction,
  owner: UserId,
  item: WatchlistItem,
  block: WalletStreamBlock,
  observations: ReadonlyMap<string, PriceObservation>,
  now: number
): Promise<void> => {
  const monitor = item.walletMonitor;
  if (!monitor?.rules || item.source._tag !== "token") {
    return;
  }
  const rules: OnchainAlertRule[] = [];
  let changed = false;
  for (const rule of monitor.rules) {
    const observation = rule.source
      ? observations.get(rule.source.key)
      : undefined;
    if (
      !observation ||
      rule.condition._tag !== "price" ||
      rule.triggeredBlock !== null
    ) {
      rules.push(rule);
      continue;
    }
    assertPriceEvidence(
      observation,
      rule.source?.key,
      item.source.network,
      block
    );
    const matched = matchesPriceThreshold(
      observation,
      rule.condition.comparison,
      rule.condition.threshold
    );
    const next = {
      ...rule,
      latest: observation,
      triggeredBlock: matched ? block.number : null,
    };
    rules.push(next);
    changed = true;
    if (matched) {
      const activity: WalletActivity = {
        v: 1,
        id: WalletActivityId.generate(),
        itemId: item.id,
        monitorId: monitor.id,
        monitorRevision: monitor.revision,
        network: observation.network,
        wallet: item.source.address,
        transactionHash: null,
        blockHash: block.hash,
        blockNumber: block.number,
        blockTime: block.timestamp,
        observedAt: now,
        kind: "price",
        flows: [],
        venues: [],
        finality: "provisional",
        delivery: "waiting",
        telegramMessageId: null,
        complete: true,
        stubbed: block.stubbed,
        price: {
          ruleId: rule.id,
          observation,
          comparison: rule.condition.comparison,
          threshold: rule.condition.threshold,
          initiallyMatched: rule.latest?.status !== "available",
          quoteCurrency: rule.condition.quoteCurrency,
          sourceLabel: rule.source?.label ?? "Onchain price",
        },
      };
      await tx.saveActivity(owner, activity);
    }
  }
  if (!changed) {
    return;
  }
  const after = { ...monitor, rules };
  await tx.savePriceEvaluation({
    v: 1,
    id: WalletActivityId.generate(),
    owner,
    itemId: item.id,
    monitorId: monitor.id,
    revision: monitor.revision,
    network: tx.network,
    blockNumber: block.number,
    blockHash: block.hash,
    before: monitor,
    after,
  });
  await tx.saveItem(owner, { ...item, walletMonitor: after });
};
