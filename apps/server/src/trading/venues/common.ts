/**
 * Shared helpers for LaunchVenue adapters. Keeps pinned-deployment checks and
 * fact assembly consistent without inventing a second interface.
 */

import type {
  LaunchCohortFact,
  LauncherFact,
  LauncherId,
  TokenTemplateFact,
  TradingAddress,
} from "@froggy/domain";
import { getAddress, keccak256 } from "viem";
import type { Address, Hex } from "viem";

import type { TradeEvmClient } from "../evm-chain";
import type { LaunchVenueRegistration, LaunchVenueTrade } from "./types";

// SAFETY: the zero address is a valid 20-byte TradingAddress literal.
export const ZERO =
  "0x0000000000000000000000000000000000000000" as TradingAddress;

export const BASE_NETWORK = "eip155:8453" as const;

export const emptyRegistration = (
  note: string | null
): LaunchVenueRegistration => ({
  registered: false,
  factory: null,
  deployer: null,
  feeRecipient: null,
  curveOrPool: null,
  phase: null,
  registrationBlock: null,
  note,
});

export interface PinnedDeployment {
  readonly address: Address;
  readonly hash: `0x${string}`;
}

export const verifyPinnedDeployments = async (
  client: TradeEvmClient,
  deployments: Readonly<Record<string, PinnedDeployment>>,
  blockNumber: bigint,
  stubbed: boolean
): Promise<readonly string[]> => {
  if (stubbed) {
    return [];
  }
  const checks = await Promise.all(
    Object.entries(deployments).map(async ([name, deployment]) => {
      const code = await client.getCode({
        address: deployment.address,
        blockNumber,
      });
      return code === undefined || keccak256(code) !== deployment.hash
        ? name
        : null;
    })
  );
  return checks.filter((name): name is string => name !== null);
};

export const uniqueAddresses = (
  entries: readonly TradingAddress[]
): readonly TradingAddress[] =>
  [...new Set(entries.map((entry) => entry.toLowerCase()))].map(
    // SAFETY: entries are lowercased TradingAddress strings from the exclusion list.
    (entry) => getAddress(entry) as TradingAddress
  );

export const launcherFactFor = (
  id: LauncherId,
  factory: TradingAddress,
  registration: LaunchVenueRegistration,
  deploymentsChanged: readonly string[],
  label: string
): LauncherFact => {
  if (deploymentsChanged.length > 0) {
    return {
      status: "unavailable",
      launcher: id,
      factory,
      deployer: null,
      feeRecipient: null,
      curveOrPool: null,
      phase: null,
      registrationBlock: null,
      note: `Changed ${label} dependencies: ${deploymentsChanged.join(", ")}.`,
    };
  }
  if (!registration.registered) {
    return {
      status: "not_indexed",
      launcher: "unknown",
      factory: null,
      deployer: null,
      feeRecipient: null,
      curveOrPool: null,
      phase: null,
      registrationBlock: null,
      note: registration.note,
    };
  }
  return {
    status: "observed",
    launcher: id,
    factory: registration.factory,
    deployer: registration.deployer,
    feeRecipient: registration.feeRecipient,
    curveOrPool: registration.curveOrPool,
    phase: registration.phase,
    registrationBlock: registration.registrationBlock,
    note: null,
  };
};

export const cohortFactFor = (input: {
  readonly registration: LaunchVenueRegistration;
  readonly launchBlock: string | null;
  readonly launchTransaction: string | null;
  readonly windowBlocks: number;
  readonly trades: readonly LaunchVenueTrade[];
  readonly note: string | null;
}): LaunchCohortFact => {
  const {
    registration,
    launchBlock,
    launchTransaction,
    windowBlocks,
    trades,
    note,
  } = input;
  if (launchBlock === null) {
    return {
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
      note: note ?? "Launch block unknown.",
    };
  }
  const insiders = new Set(
    [registration.deployer, registration.feeRecipient]
      .filter((value): value is TradingAddress => value !== null)
      .map((value) => value.toLowerCase())
  );
  const sameBlock = new Set<string>();
  const insiderBuyers = new Set<string>();
  const earlySellers = new Set<string>();
  let buyerCount = 0;
  let sellerCount = 0;
  for (const trade of trades) {
    if (trade.side === "buy") {
      buyerCount += 1;
      if (trade.block === launchBlock) {
        sameBlock.add(trade.buyerOrSeller.toLowerCase());
      }
      if (
        insiders.has(trade.buyerOrSeller.toLowerCase()) ||
        insiders.has(trade.recipient.toLowerCase())
      ) {
        insiderBuyers.add(trade.buyerOrSeller.toLowerCase());
      }
    } else {
      sellerCount += 1;
      earlySellers.add(trade.buyerOrSeller.toLowerCase());
    }
  }
  return {
    status: "observed",
    basis: "venue_events",
    launchBlock,
    launchTransaction,
    windowBlocks,
    sameBlockBuyers: [...sameBlock].map(
      // SAFETY: sameBlock entries were produced by getAddress-normalized trades.
      (entry) => getAddress(entry) as TradingAddress
    ),
    insiderBuyers: [...insiderBuyers].map(
      // SAFETY: insiderBuyers entries were produced by getAddress-normalized trades.
      (entry) => getAddress(entry) as TradingAddress
    ),
    earlySellers: [...earlySellers].map(
      // SAFETY: earlySellers entries were produced by getAddress-normalized trades.
      (entry) => getAddress(entry) as TradingAddress
    ),
    buyerCount,
    sellerCount,
    note,
  };
};

/** Bound the search: 10 pages of 10_000 blocks ≈ 100_000 blocks. */
export const LOG_PAGE = 10_000n;
export const LOG_MAX_PAGES = 10;

export const stubVenueClient = (): TradeEvmClient => {
  const client = {
    getCode: (): Promise<Hex | undefined> =>
      // SAFETY: an empty resolve is the stub's "no code at address" response.
      Promise.resolve() as Promise<Hex | undefined>,
    getLogs: (): Promise<never[]> => Promise.resolve([]),
    readContract: (): Promise<never> => Promise.reject(new Error("stub")),
  };
  // SAFETY: venue adapters only call getCode/getLogs/readContract on this stub.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- PublicClient is too wide to stub without unknown.
  return client as unknown as TradeEvmClient;
};

export const notApplicableTemplate = (venue: LauncherId, note: string) => ({
  status: "not_applicable" as const,
  matches: null,
  hash: null,
  venue,
  note,
});

/**
 * A reviewed token runtime with its per-deployment immutables masked. Regions
 * are zeroed before hashing so every token the factory deploys hashes alike
 * while a modified runtime, or a token from elsewhere, does not.
 */
export interface MaskedTemplate {
  readonly length: number;
  readonly regions: readonly {
    readonly offset: number;
    readonly length: number;
  }[];
  readonly hash: Hex;
}

export const maskedTemplateMatches = (
  code: Hex | undefined,
  template: MaskedTemplate
): boolean => {
  if (code === undefined || code === "0x") {
    return false;
  }
  const bytes = Buffer.from(code.slice(2), "hex");
  if (bytes.length !== template.length) {
    return false;
  }
  for (const region of template.regions) {
    bytes.fill(0, region.offset, region.offset + region.length);
  }
  return keccak256(`0x${bytes.toString("hex")}`) === template.hash;
};

/** Template fact for a venue whose token runtime is pinned as a masked template. */
export const maskedTemplateFact = (input: {
  readonly venue: LauncherId;
  readonly template: MaskedTemplate;
  readonly code: Hex | undefined;
  readonly stubbed: boolean;
  readonly mismatchNote: string;
}): TokenTemplateFact => {
  if (input.stubbed) {
    return {
      status: "unavailable",
      matches: null,
      hash: null,
      venue: input.venue,
      note: `Stub ${input.venue} venue: no template read.`,
    };
  }
  if (input.code === undefined || input.code === "0x") {
    return {
      status: "not_indexed",
      matches: null,
      hash: null,
      venue: input.venue,
      note: "No runtime code at this address.",
    };
  }
  const matches = maskedTemplateMatches(input.code, input.template);
  return {
    status: "observed",
    matches,
    hash: input.template.hash,
    venue: input.venue,
    note: matches ? null : input.mismatchNote,
  };
};
