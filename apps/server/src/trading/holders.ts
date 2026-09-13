/**
 * Chain-generic holder reconstruction and first-mint cohort from Transfer logs.
 * Page walks are sequential on purpose: each range depends on the previous
 * cursor, and the model never drives this loop.
 */

import type {
  HolderConcentrationFact,
  LaunchCohortFact,
  TradingAddress,
} from "@froggy/domain";
import {
  decodeAbiParameters,
  getAddress,
  parseAbiItem,
  parseAbiParameters,
} from "viem";
import type { Address, Hex, Log } from "viem";

import type { TradeEvmClient } from "./evm-chain";

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from,address indexed to,uint256 value)"
);
const TOTAL_SUPPLY = parseAbiItem(
  "function totalSupply() view returns (uint256)"
);
const ZERO = "0x0000000000000000000000000000000000000000";
const PAGE_BLOCKS = 10_000n;
const LOGS_PER_PAGE = 1000;

const topicAddress = (topic: Hex | undefined): string | null => {
  if (topic === undefined || topic.length !== 66) {
    return null;
  }
  return getAddress(`0x${topic.slice(26)}`);
};

const transferValue = (data: Hex): bigint => {
  try {
    const [value] = decodeAbiParameters(parseAbiParameters("uint256"), data);
    return value;
  } catch {
    return 0n;
  }
};

const applyTransfer = (
  balances: Map<string, bigint>,
  from: string | null,
  to: string | null,
  value: bigint
): void => {
  if (from !== null && from !== ZERO) {
    const key = from.toLowerCase();
    balances.set(key, (balances.get(key) ?? 0n) - value);
  }
  if (to !== null && to !== ZERO) {
    const key = to.toLowerCase();
    balances.set(key, (balances.get(key) ?? 0n) + value);
  }
};

const positiveSum = (balances: Map<string, bigint>): bigint => {
  let total = 0n;
  for (const balance of balances.values()) {
    if (balance > 0n) {
      total += balance;
    }
  }
  return total;
};

const rankedHolders = (
  balances: Map<string, bigint>,
  excluded: Set<string>
): readonly (readonly [string, bigint])[] =>
  [...balances.entries()]
    .filter(
      ([address, balance]) =>
        balance > 0n && !excluded.has(address.toLowerCase())
    )
    .toSorted((left, right) => {
      if (right[1] > left[1]) {
        return 1;
      }
      if (right[1] < left[1]) {
        return -1;
      }
      return 0;
    });

const shareBps = (topSum: bigint, denominator: bigint): number | null => {
  if (denominator <= 0n) {
    return null;
  }
  const raw = Number((topSum * 10_000n) / denominator);
  return Math.min(10_000, Math.max(0, raw));
};

const denominatorChoice = (
  sellableUnits: bigint | null,
  totalSupply: bigint | null
) => {
  if (sellableUnits !== null) {
    return { kind: "sellable" as const, units: sellableUnits };
  }
  if (totalSupply !== null) {
    return { kind: "total" as const, units: totalSupply };
  }
  return { kind: "none" as const, units: null };
};

const coverageNote = (input: {
  readonly truncated: boolean;
  readonly transfersRead: number;
  readonly toBlock: bigint;
  readonly supplyReconciled: boolean;
  readonly totalSupply: bigint | null;
  readonly reconstructed: bigint;
}): string | null => {
  if (input.truncated) {
    return `Counted from ${input.transfersRead} transfers up to block ${input.toBlock}; more history unread within the page budget.`;
  }
  if (input.supplyReconciled) {
    return null;
  }
  if (input.totalSupply === null) {
    return "totalSupply() was unavailable; reconstruction cannot be reconciled.";
  }
  return `Reconstructed supply ${input.reconstructed} does not match totalSupply ${input.totalSupply}.`;
};

export interface HolderReconstructionInput {
  readonly client: TradeEvmClient;
  readonly token: TradingAddress;
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly pageBudget: number;
  readonly topHolderCount: number;
  readonly exclusions: readonly TradingAddress[];
  readonly sellableUnits: bigint | null;
}

const readTransferPage = async (
  client: TradeEvmClient,
  token: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<readonly Log[]> =>
  await client.getLogs({
    address: token,
    event: TRANSFER,
    fromBlock,
    toBlock,
    strict: true,
  });

export const reconstructHolders = async (
  input: HolderReconstructionInput
): Promise<HolderConcentrationFact> => {
  const balances = new Map<string, bigint>();
  const excluded = new Set(
    input.exclusions.map((entry) => entry.toLowerCase())
  );
  excluded.add(ZERO);
  const token = getAddress(input.token);
  let transfersRead = 0;
  let pagesUsed = 0;
  let cursor = input.fromBlock;
  let truncated = false;

  while (cursor <= input.toBlock && pagesUsed < input.pageBudget) {
    const end =
      cursor + PAGE_BLOCKS - 1n > input.toBlock
        ? input.toBlock
        : cursor + PAGE_BLOCKS - 1n;
    // Sequential: each page advances the cursor; parallel ranges would double-count.
    const logs = await readTransferPage(input.client, token, cursor, end);
    pagesUsed += 1;
    const slice =
      logs.length > LOGS_PER_PAGE ? logs.slice(0, LOGS_PER_PAGE) : logs;
    if (logs.length > LOGS_PER_PAGE) {
      truncated = true;
    }
    for (const log of slice) {
      if (log.removed) {
        continue;
      }
      applyTransfer(
        balances,
        topicAddress(log.topics[1]),
        topicAddress(log.topics[2]),
        transferValue(log.data)
      );
      transfersRead += 1;
    }
    if (end >= input.toBlock) {
      break;
    }
    cursor = end + 1n;
  }
  if (cursor <= input.toBlock && pagesUsed >= input.pageBudget) {
    truncated = true;
  }

  const holders = rankedHolders(balances, excluded);
  const reconstructed = positiveSum(balances);
  let totalSupply: bigint | null = null;
  try {
    totalSupply = await input.client.readContract({
      address: token,
      abi: [TOTAL_SUPPLY],
      functionName: "totalSupply",
      blockNumber: input.toBlock,
    });
  } catch {
    totalSupply = null;
  }

  const denominator = denominatorChoice(input.sellableUnits, totalSupply);
  const top = holders.slice(0, input.topHolderCount);
  const topSum = top.reduce((sum, [, balance]) => sum + balance, 0n);
  const supplyReconciled =
    totalSupply !== null && reconstructed === totalSupply && !truncated;

  return {
    status: "observed",
    basis: "reconstructed",
    block: input.toBlock.toString(),
    holdersCounted: holders.length,
    topHolderCount: top.length,
    topShareBps:
      denominator.units === null ? null : shareBps(topSum, denominator.units),
    denominator: denominator.kind,
    denominatorUnits:
      denominator.units === null ? null : denominator.units.toString(),
    exclusions: input.exclusions,
    supplyReconciled,
    coverage: truncated ? "partial" : "complete",
    transfersRead,
    pageBudget: input.pageBudget,
    note: coverageNote({
      truncated,
      transfersRead,
      toBlock: input.toBlock,
      supplyReconciled,
      totalSupply,
      reconstructed,
    }),
  };
};

const emptyMintCohort = (
  windowBlocks: number,
  note: string
): LaunchCohortFact => ({
  status: "not_indexed",
  basis: "none",
  launchBlock: null,
  launchTransaction: null,
  windowBlocks,
  sameBlockBuyers: [],
  insiderBuyers: [],
  earlySellers: [],
  buyerCount: 0,
  sellerCount: 0,
  note,
});

export const firstMintCohort = async (input: {
  readonly client: TradeEvmClient;
  readonly token: TradingAddress;
  readonly headBlock: bigint;
  readonly windowBlocks: number;
  readonly pageBudget: number;
}): Promise<{
  readonly cohort: LaunchCohortFact;
  readonly launchBlock: bigint | null;
}> => {
  const token = getAddress(input.token);
  let cursor =
    input.headBlock > PAGE_BLOCKS * BigInt(input.pageBudget)
      ? input.headBlock - PAGE_BLOCKS * BigInt(input.pageBudget) + 1n
      : 0n;
  let launch: Log | null = null;
  let pages = 0;
  while (cursor <= input.headBlock && pages < input.pageBudget) {
    const end =
      cursor + PAGE_BLOCKS - 1n > input.headBlock
        ? input.headBlock
        : cursor + PAGE_BLOCKS - 1n;
    const logs = await input.client.getLogs({
      address: token,
      event: TRANSFER,
      // SAFETY: the zero address is a valid Address literal for the Transfer filter.
      args: { from: ZERO as Address },
      fromBlock: cursor,
      toBlock: end,
      strict: true,
    });
    pages += 1;
    const hit = logs.find((entry) => !entry.removed);
    if (hit !== undefined) {
      launch = hit;
      break;
    }
    cursor = end + 1n;
  }
  if (launch === null || launch.blockNumber === null) {
    return {
      launchBlock: null,
      cohort: emptyMintCohort(
        input.windowBlocks,
        "No mint Transfer from the zero address within the search budget."
      ),
    };
  }
  const launchBlock = launch.blockNumber;
  const toBlock =
    launchBlock + BigInt(input.windowBlocks) > input.headBlock
      ? input.headBlock
      : launchBlock + BigInt(input.windowBlocks);
  const windowLogs = await input.client.getLogs({
    address: token,
    event: TRANSFER,
    fromBlock: launchBlock,
    toBlock,
    strict: true,
  });
  const sameBlock = new Set<string>();
  const recipients = new Set<string>();
  for (const log of windowLogs) {
    if (log.removed) {
      continue;
    }
    const to = topicAddress(log.topics[2]);
    if (to === null || to === ZERO) {
      continue;
    }
    recipients.add(to.toLowerCase());
    if (log.blockNumber === launchBlock) {
      sameBlock.add(to.toLowerCase());
    }
  }
  return {
    launchBlock,
    cohort: {
      status: "observed",
      basis: "first_mint_transfers",
      launchBlock: launchBlock.toString(),
      launchTransaction: launch.transactionHash,
      windowBlocks: input.windowBlocks,
      // SAFETY: sameBlock entries were produced by topicAddress → getAddress.
      sameBlockBuyers: [...sameBlock].map(
        (entry) => getAddress(entry) as TradingAddress
      ),
      insiderBuyers: [],
      earlySellers: [],
      buyerCount: recipients.size,
      sellerCount: 0,
      note: "Generic first-mint cohort; deployer identity was not established.",
    },
  };
};
