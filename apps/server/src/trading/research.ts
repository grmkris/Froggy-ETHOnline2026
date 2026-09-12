/**
 * Composite token research: one pinned block, launcher detection, venue and
 * chain-generic sources assembled into TokenResearchFacts. Tolerant by design —
 * every source reports its own status. Rule gates consume the same facts with
 * opposite (fail-closed) defaults.
 */

import { emptyTokenResearchFacts, TokenResearchFacts } from "@froggy/domain";
import type { TradingAddress, TradingNetwork } from "@froggy/domain";
import { Schema } from "effect";
import { getAddress } from "viem";

import { assertTradeNetwork } from "./evm-chain";
import type { TradeEvmClient } from "./evm-chain";
import type { GoPlusScreen } from "./goplus";
import { firstMintCohort, reconstructHolders } from "./holders";
import { PONS_ABI } from "./pons";
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
  readonly research: (input: TokenResearchInput) => Promise<TokenResearchFacts>;
}

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
  const { cohort, launchBlock } = await firstMintCohort({
    client,
    token: address,
    headBlock,
    windowBlocks: cohortWindowBlocks,
    pageBudget: Math.min(holderPageBudget, 10),
  });
  return { launcher, template, cohort, launchBlock };
};

export const liveTokenResearch = (options: {
  readonly clientFor: (network: TradingNetwork) => TradeEvmClient;
  readonly venuesFor: (network: TradingNetwork) => readonly LaunchVenue[];
  readonly goplus: GoPlusScreen;
  readonly now: () => number;
}): TokenResearch => ({
  stubbed: false,
  research: async (input) => {
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
    const venue = await detectLauncher(
      venues,
      input.network,
      address,
      block.number
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

    if (venue === null) {
      const unknown = await researchUnknownPath({
        client,
        address,
        headBlock: block.number,
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

    const fromBlock = launchBlock ?? 0n;
    const holders = await reconstructHolders({
      client,
      token: address,
      fromBlock,
      toBlock: block.number,
      pageBudget: input.holderPageBudget,
      topHolderCount: input.topHolderCount ?? 10,
      exclusions,
      sellableUnits: sellable,
    });

    const screen = await options.goplus.screen(input.network, address);

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
