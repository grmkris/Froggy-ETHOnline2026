/**
 * Composite token research: one pinned block, launcher detection, venue and
 * chain-generic sources assembled into TokenResearchFacts. Tolerant by design —
 * every source reports its own status. Rule gates consume the same facts with
 * opposite (fail-closed) defaults.
 */

import { emptyTokenResearchFacts, TokenResearchFacts } from "@froggy/domain";
import type {
  HolderConcentrationFact,
  UserId,
  TradingAddress,
  TradingNetwork,
} from "@froggy/domain";
import { Schema } from "effect";
import { getAddress } from "viem";

import { assertTradeNetwork } from "./evm-chain";
import type { TradeEvmClient } from "./evm-chain";
import type { GoPlusScreen } from "./goplus";
import { firstMintCohort, reconstructHolders } from "./holders";
import { PONS_ABI } from "./pons";
import { ResearchRpcError } from "./rpc-transport";
import { detectLauncher } from "./venues";
import type { LaunchVenue } from "./venues";

interface TokenResearchInput {
  readonly network: TradingNetwork;
  readonly address: string;
  readonly cohortWindowBlocks: number;
  readonly holderPageBudget: number;
  readonly topHolderCount?: number;
}

export interface TokenResearch {
  readonly stubbed: boolean;
  readonly research: (
    input: TokenResearchInput,
    owner?: UserId
  ) => Promise<TokenResearchFacts>;
}

const researchFailure = (error: Error | null): string => {
  let current: unknown = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (current instanceof ResearchRpcError) {
      return current.message;
    }
    if (!(current instanceof Error)) {
      break;
    }
    current = current.cause;
  }
  return "Research source unavailable; no observation was inferred.";
};

const tolerate = async <T>(
  read: () => Promise<T>,
  fallback: (note: string) => T
): Promise<T> => {
  try {
    return await read();
  } catch (error) {
    return fallback(researchFailure(error instanceof Error ? error : null));
  }
};

const decodeFacts = Schema.decodeUnknownSync(TokenResearchFacts);

const researchVenuePath = async (input: {
  readonly client: TradeEvmClient;
  readonly venue: LaunchVenue;
  readonly address: TradingAddress;
  readonly blockNumber: bigint;
  readonly cohortWindowBlocks: number;
}): Promise<{
  readonly launcher: TokenResearchFacts["launcher"];
  readonly template: TokenResearchFacts["template"] | null;
  readonly cohort: TokenResearchFacts["cohort"] | null;
  readonly exclusions: readonly TradingAddress[];
  readonly sellable: bigint | null;
  readonly launchBlock: bigint | null;
}> => {
  const { client, venue, address, blockNumber, cohortWindowBlocks } = input;
  const changed = await venue.verifyDeployments(blockNumber);
  const registration = await venue.registration(address, blockNumber);
  const launcher = venue.launcherFact(registration, changed);
  if (changed.length > 0) {
    const template = {
      status: "unavailable" as const,
      matches: null,
      hash: null,
      venue: venue.id,
      note: `Changed dependencies: ${changed.join(", ")}.`,
    };
    return {
      launcher,
      template,
      cohort: {
        status: "unavailable",
        basis: "none",
        launchBlock: null,
        launchTransaction: null,
        windowBlocks: cohortWindowBlocks,
        sameBlockBuyers: [],
        insiderBuyers: [],
        earlySellers: [],
        buyerCount: 0,
        sellerCount: 0,
        note: template.note,
      },
      exclusions: [],
      sellable: null,
      launchBlock: null,
    };
  }
  if (!registration.registered) {
    return {
      launcher,
      template: null,
      cohort: null,
      exclusions: [],
      sellable: null,
      launchBlock: null,
    };
  }

  const code = await client.getCode({
    address: getAddress(address),
    blockNumber,
  });
  const template = venue.template(code);
  const exclusions = venue.exclusions(registration);
  const launch = await venue.launchBlock(address, blockNumber);
  const launchBlock = launch.block === null ? null : BigInt(launch.block);
  let cohort: TokenResearchFacts["cohort"];
  if (
    launchBlock !== null &&
    registration.curveOrPool !== null &&
    venue.capabilities.insiders
  ) {
    const to =
      launchBlock + BigInt(cohortWindowBlocks) > blockNumber
        ? blockNumber
        : launchBlock + BigInt(cohortWindowBlocks);
    const trades = await venue.tradeEvents(
      address,
      registration.curveOrPool,
      launchBlock,
      to
    );
    cohort = venue.cohortFact({
      registration,
      launchBlock: launch.block,
      launchTransaction: launch.transactionId,
      windowBlocks: cohortWindowBlocks,
      trades,
      note: launch.note,
    });
  } else {
    cohort = venue.cohortFact({
      registration,
      launchBlock: launch.block,
      launchTransaction: launch.transactionId,
      windowBlocks: cohortWindowBlocks,
      trades: [],
      note: launch.note,
    });
  }

  let sellable: bigint | null = null;
  if (registration.phase === "curve" && registration.curveOrPool !== null) {
    try {
      sellable = await client.readContract({
        address: getAddress(registration.curveOrPool),
        abi: PONS_ABI,
        functionName: "sellableTokens",
        blockNumber,
      });
    } catch {
      sellable = null;
    }
  }

  return {
    launcher,
    template,
    cohort,
    exclusions,
    sellable,
    launchBlock,
  };
};

const researchUnknownPath = async (input: {
  readonly client: TradeEvmClient;
  readonly address: TradingAddress;
  readonly headBlock: bigint;
  readonly network: TradingNetwork;
  readonly cohortWindowBlocks: number;
  readonly holderPageBudget: number;
}): Promise<{
  readonly launcher: TokenResearchFacts["launcher"];
  readonly template: TokenResearchFacts["template"];
  readonly cohort: TokenResearchFacts["cohort"];
  readonly launchBlock: bigint | null;
}> => {
  const { client, address, headBlock, cohortWindowBlocks, holderPageBudget } =
    input;
  const launcher = {
    status: "observed" as const,
    launcher: "unknown" as const,
    factory: null,
    deployer: null,
    feeRecipient: null,
    curveOrPool: null,
    poolId: null,
    phase: null,
    registrationBlock: null,
    note: "No configured launcher claimed this token.",
  };
  const template = {
    status: "not_applicable" as const,
    matches: null,
    hash: null,
    venue: null,
    note: "No launcher template applies to an unregistered token.",
  };
  const missing = emptyTokenResearchFacts({
    network: input.network,
    address,
    observedAt: 0,
    stubbed: false,
  });
  const { cohort, launchBlock } = await tolerate(
    async () =>
      await firstMintCohort({
        client,
        token: address,
        headBlock,
        windowBlocks: cohortWindowBlocks,
        pageBudget: Math.min(holderPageBudget, 10),
      }),
    (note) => ({ cohort: { ...missing.cohort, note }, launchBlock: null })
  );
  return { launcher, template, cohort, launchBlock };
};

export const liveTokenResearch = (options: {
  readonly clientFor: (network: TradingNetwork) => TradeEvmClient;
  readonly venuesFor: (network: TradingNetwork) => readonly LaunchVenue[];
  readonly goplus: GoPlusScreen;
  readonly now: () => number;
  readonly indexedHolders?: (
    input: TokenResearchInput,
    owner: UserId,
    client: TradeEvmClient,
    block: bigint
  ) => Promise<HolderConcentrationFact>;
}): TokenResearch => ({
  stubbed: false,
  research: async (input, owner) => {
    // SAFETY: getAddress returns a checksummed 20-byte address for a TradingAddress.
    const address = getAddress(input.address) as TradingAddress;
    const client = options.clientFor(input.network);
    await assertTradeNetwork(client, input.network);
    const block = await client.getBlock();
    if (block.hash === null) {
      throw new Error("research.snapshot: the chain head has no hash.");
    }
    const observedAt = options.now();
    const venues = options.venuesFor(input.network);
    let detectionError: string | null = null;
    const venue = await tolerate(
      async () =>
        await detectLauncher(venues, input.network, address, block.number),
      (note) => {
        detectionError = note;
        return null;
      }
    );

    const empty = emptyTokenResearchFacts({
      network: input.network,
      address,
      observedAt,
      stubbed: false,
    });
    let { launcher, template, cohort } = empty;
    let exclusions: readonly TradingAddress[] = [];
    let sellable: bigint | null = null;
    let launchBlock: bigint | null = null;

    try {
      if (detectionError !== null) {
        throw new Error(detectionError);
      }
      if (venue === null) {
        const unknown = await researchUnknownPath({
          client,
          address,
          headBlock: block.number,
          network: input.network,
          cohortWindowBlocks: input.cohortWindowBlocks,
          holderPageBudget: input.holderPageBudget,
        });
        ({ launcher, template, cohort, launchBlock } = unknown);
      } else {
        const venueFacts = await researchVenuePath({
          client,
          venue,
          address,
          blockNumber: block.number,
          cohortWindowBlocks: input.cohortWindowBlocks,
        });
        const {
          launcher: venueLauncher,
          exclusions: venueExclusions,
          sellable: venueSellable,
          launchBlock: venueLaunchBlock,
          template: venueTemplate,
          cohort: venueCohort,
        } = venueFacts;
        launcher = venueLauncher;
        exclusions = venueExclusions;
        sellable = venueSellable;
        launchBlock = venueLaunchBlock;
        if (venueTemplate !== null) {
          template = venueTemplate;
        }
        if (venueCohort !== null) {
          cohort = venueCohort;
        }
      }
    } catch (error) {
      const note = researchFailure(
        Schema.is(Schema.instanceOf(Error))(error) ? error : null
      );
      launcher = { ...empty.launcher, note };
      template = { ...empty.template, note };
      cohort = { ...empty.cohort, note };
    }
    const fromBlock = launchBlock ?? 0n;
    // Only ordinary owner-bound research has this adapter. Execution readers omit it.
    const indexed =
      owner && options.indexedHolders
        ? await options
            .indexedHolders(input, owner, client, block.number)
            .catch(() => null)
        : null;
    const holders =
      indexed?.status === "observed"
        ? indexed
        : await tolerate(
            async () =>
              await reconstructHolders({
                client,
                token: address,
                fromBlock,
                toBlock: block.number,
                pageBudget: input.holderPageBudget,
                topHolderCount: input.topHolderCount ?? 10,
                exclusions,
                sellableUnits: sellable,
              }),
            (note) => ({ ...empty.holders, note })
          );

    const screen = await tolerate(
      async () => await options.goplus.screen(input.network, address),
      (note) => ({ ...empty.screen, note })
    );

    return decodeFacts({
      v: 1,
      network: input.network,
      address,
      block: block.number.toString(),
      blockHash: block.hash,
      observedAt,
      launcher,
      template,
      cohort,
      holders,
      screen,
      stubbed: false,
    });
  },
});

export const stubTokenResearch = (now: () => number): TokenResearch => ({
  stubbed: true,
  research: async (input) => {
    await Promise.resolve();
    return emptyTokenResearchFacts({
      network: input.network,
      address: getAddress(input.address),
      observedAt: now(),
      stubbed: true,
      note: "Token research is stubbed; no chain or provider was queried.",
    });
  },
});
