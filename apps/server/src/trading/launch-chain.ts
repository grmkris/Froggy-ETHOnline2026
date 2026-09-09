import { LaunchEventId, sameTradingAddress } from "@froggy/domain";
import type { LaunchObservation, LaunchWatch } from "@froggy/domain";
import { getAddress, keccak256, parseAbiItem } from "viem";

import { assertTradeNetwork } from "./evm-chain";
import type { TradeEvmClient } from "./evm-chain";
import { PONS_DEPLOYMENTS, PONS_NETWORK } from "./pons";

const LAUNCH = parseAbiItem(
  "event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)"
);
const MAX_BLOCKS = 500n;

export interface ChainLaunchSample {
  readonly events: readonly LaunchObservation[];
  readonly cursor: NonNullable<LaunchWatch["chainCursor"]>;
  readonly orphanedEvents: readonly LaunchEventId[];
  readonly gap: string | null;
}
export interface ChainLaunchReader {
  readonly network: string;
  readonly stubbed: boolean;
  readonly poll: (watch: LaunchWatch) => Promise<ChainLaunchSample>;
}

const launchRange = async (
  client: TradeEvmClient,
  watch: LaunchWatch,
  headNumber: bigint
) => {
  let from = headNumber > 100n ? headNumber - 100n : 0n;
  let gap: string | null =
    watch.chainCursor === undefined
      ? "Observation starts with a bounded 100-block backfill; earlier launches are outside this watch."
      : null;
  let orphanedEvents = [...(watch.orphanedEvents ?? [])];
  if (watch.chainCursor !== undefined) {
    const previous = await client.getBlock({
      blockNumber: BigInt(watch.chainCursor.block),
    });
    if (previous.hash === watch.chainCursor.blockHash) {
      from = BigInt(watch.chainCursor.block) + 1n;
    } else {
      orphanedEvents = [
        ...new Set([
          ...orphanedEvents,
          ...watch.events.map((event) => event.id),
        ]),
      ];
      gap =
        "The saved canonical block changed. Prior observations are marked uncertain and a bounded backfill replaces the cursor.";
    }
  }
  if (headNumber - from >= MAX_BLOCKS) {
    from = headNumber - MAX_BLOCKS + 1n;
    gap =
      "The disconnected interval exceeded 500 blocks. Older omitted blocks cannot be recovered within this poll's capacity.";
  }
  return { from, gap, orphanedEvents };
};

/** Included, confirmed logs only. The factory code and canonical block anchors are checked independently. */
export const ponsLaunchReader = (
  client: TradeEvmClient,
  now: () => number
): ChainLaunchReader => ({
  network: PONS_NETWORK,
  stubbed: false,
  poll: async (watch) => {
    await assertTradeNetwork(client, PONS_NETWORK);
    const latest = await client.getBlock({ blockTag: "latest" });
    if (
      latest.number < 2n ||
      now() - Number(latest.timestamp) * 1000 > 30_000 ||
      Number(latest.timestamp) * 1000 > now()
    ) {
      throw new Error("watch.snapshot: chain head is unavailable or stale.");
    }
    const head = await client.getBlock({ blockNumber: latest.number - 2n });
    if (head.hash === null) {
      throw new Error("watch.snapshot: canonical block hash is unavailable.");
    }
    const code = await client.getCode({
      address: PONS_DEPLOYMENTS.factory.address,
      blockNumber: head.number,
    });
    if (
      code === undefined ||
      keccak256(code) !== PONS_DEPLOYMENTS.factory.hash
    ) {
      throw new Error(
        "watch.factory: the reviewed Pons factory changed or is unavailable."
      );
    }
    const range = await launchRange(client, watch, head.number);
    const { from, orphanedEvents } = range;
    let { gap } = range;
    const logs =
      from > head.number
        ? []
        : await client.getLogs({
            address: PONS_DEPLOYMENTS.factory.address,
            event: LAUNCH,
            fromBlock: from,
            toBlock: head.number,
            strict: true,
          });
    const selected = logs.slice(0, 20);
    if (logs.length > 20) {
      gap =
        "More than 20 launch logs arrived in this block range. This bounded sample omits additional launches.";
    }
    const blocks = await Promise.all(
      [...new Set(selected.map((log) => log.blockNumber))].map(
        async (number) => await client.getBlock({ blockNumber: number })
      )
    );
    const events: LaunchObservation[] = [];
    for (const log of selected) {
      const block = blocks.find((entry) => entry.number === log.blockNumber);
      if (log.removed || block?.hash !== log.blockHash || block === undefined) {
        throw new Error("watch.reorganization: a launch log is not canonical.");
      }
      if (
        watch.seen.some((address) =>
          sameTradingAddress(PONS_NETWORK, address, log.args.token)
        ) ||
        log.args.pairToken.toLowerCase() !==
          PONS_DEPLOYMENTS.quote.address.toLowerCase() ||
        (watch.input.source !== null &&
          watch.input.source.toLowerCase() !== "pons") ||
        watch.input.minimumLiquidityUsd !== null
      ) {
        continue;
      }
      events.push({
        v: 1,
        id: LaunchEventId.generate(),
        address: getAddress(log.args.token),
        name: null,
        symbol: null,
        source: "pons",
        listedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
        sourceAt: Number(block.timestamp) * 1000,
        observedAt: now(),
        liquidityUsd: null,
        membership: "factory_log",
        block: log.blockNumber.toString(),
        blockHash: log.blockHash,
        transactionId: log.transactionHash,
        stubbed: watch.stubbed,
      });
    }
    const canonical = await client.getBlock({ blockNumber: head.number });
    if (canonical.hash !== head.hash) {
      throw new Error(
        "watch.reorganization: the sampled block range changed before commit."
      );
    }
    return {
      events,
      cursor: { block: head.number.toString(), blockHash: head.hash },
      orphanedEvents,
      gap,
    };
  },
});

export const stubPonsLaunchReader = (now: () => number): ChainLaunchReader => ({
  network: PONS_NETWORK,
  stubbed: true,
  poll: async (watch) => {
    await Promise.resolve();
    const at = now();
    const address = `0x${(1000 + watch.pollsUsed).toString(16).padStart(40, "0")}`;
    const events: LaunchObservation[] =
      watch.input.minimumLiquidityUsd !== null ||
      (watch.input.source !== null &&
        watch.input.source.toLowerCase() !== "pons")
        ? []
        : [
            {
              v: 1,
              id: LaunchEventId.generate(),
              address,
              name: "DEMO Pons launch",
              symbol: "DEMO",
              source: "pons",
              listedAt: new Date(at).toISOString(),
              sourceAt: at,
              observedAt: at,
              liquidityUsd: null,
              membership: "unverified",
              stubbed: true,
            },
          ];
    return {
      events,
      cursor: {
        block: String(watch.pollsUsed),
        blockHash: `0x${watch.pollsUsed.toString(16).padStart(64, "0")}`,
      },
      orphanedEvents: [],
      gap: "Synthetic Pons listings for demo testing; no chain was queried.",
    };
  },
});
