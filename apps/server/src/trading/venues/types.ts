/**
 * Launcher-specific research adapters. Each venue pins reviewed deployments by
 * address and runtime hash, reports registration and cohort facts at one block,
 * and never builds calldata. Chain-generic sources (holders, GoPlus) live
 * outside this interface.
 */

import type {
  LauncherId,
  LaunchCohortFact,
  LauncherFact,
  TokenTemplateFact,
  TradingAddress,
  TradingNetwork,
} from "@froggy/domain";

export interface LaunchVenueCapabilities {
  readonly template: boolean;
  readonly insiders: boolean;
  readonly concentration: boolean;
}

export interface LaunchVenueRegistration {
  readonly registered: boolean;
  readonly factory: TradingAddress | null;
  readonly deployer: TradingAddress | null;
  readonly feeRecipient: TradingAddress | null;
  readonly curveOrPool: TradingAddress | null;
  readonly phase: "curve" | "graduated" | "standard" | null;
  readonly registrationBlock: string | null;
  readonly note: string | null;
}

export interface LaunchVenueTrade {
  readonly buyerOrSeller: TradingAddress;
  readonly recipient: TradingAddress;
  readonly block: string;
  readonly transactionId: string;
  readonly side: "buy" | "sell";
}

export interface LaunchVenue {
  readonly id: LauncherId;
  readonly network: TradingNetwork;
  readonly capabilities: LaunchVenueCapabilities;
  readonly stubbed: boolean;
  /** Verify every pinned deployment's runtime hash at the given block. */
  readonly verifyDeployments: (
    blockNumber: bigint
  ) => Promise<readonly string[]>;
  readonly registration: (
    token: TradingAddress,
    blockNumber: bigint
  ) => Promise<LaunchVenueRegistration>;
  readonly template: (code?: `0x${string}`) => TokenTemplateFact;
  readonly launchBlock: (
    token: TradingAddress,
    headBlock: bigint
  ) => Promise<{
    readonly block: string | null;
    readonly transactionId: string | null;
    readonly note: string | null;
  }>;
  readonly tradeEvents: (
    token: TradingAddress,
    curveOrPool: TradingAddress,
    fromBlock: bigint,
    toBlock: bigint
  ) => Promise<readonly LaunchVenueTrade[]>;
  readonly exclusions: (
    registration: LaunchVenueRegistration
  ) => readonly TradingAddress[];
  readonly launcherFact: (
    registration: LaunchVenueRegistration,
    deploymentsChanged: readonly string[]
  ) => LauncherFact;
  readonly cohortFact: (input: {
    readonly registration: LaunchVenueRegistration;
    readonly launchBlock: string | null;
    readonly launchTransaction: string | null;
    readonly windowBlocks: number;
    readonly trades: readonly LaunchVenueTrade[];
    readonly note: string | null;
  }) => LaunchCohortFact;
}

export const detectLauncher = async (
  venues: readonly LaunchVenue[],
  network: TradingNetwork,
  token: TradingAddress,
  blockNumber: bigint
): Promise<LaunchVenue | null> => {
  for (const venue of venues) {
    if (venue.network !== network) {
      continue;
    }
    const changed = await venue.verifyDeployments(blockNumber);
    if (changed.length > 0) {
      continue;
    }
    const registration = await venue.registration(token, blockNumber);
    if (registration.registered) {
      return venue;
    }
  }
  return null;
};
