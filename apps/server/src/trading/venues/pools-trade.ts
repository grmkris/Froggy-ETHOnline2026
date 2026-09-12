/**
 * Pools.trade (Uniswap LiquidityLauncher / InstantLaunchStrategy) venue for
 * Robinhood Chain research. Registration is TokenLaunched across the four
 * InstantLaunchStrategy addresses. Never builds calldata. Template matching is
 * not_applicable until a stable clone fingerprint is recorded.
 */

import type { TradingAddress } from "@froggy/domain";
import { getAddress, parseAbiItem } from "viem";
import type { Address, Log } from "viem";

import type { TradeEvmClient } from "../evm-chain";
import { PONS_NETWORK } from "../networks";
import {
  cohortFactFor,
  emptyRegistration,
  launcherFactFor,
  LOG_MAX_PAGES,
  LOG_PAGE,
  notApplicableTemplate,
  stubVenueClient,
  uniqueAddresses,
  verifyPinnedDeployments,
  ZERO,
} from "./common";
import type { LaunchVenue, LaunchVenueRegistration } from "./types";

/**
 * Pinned pools.trade / Uniswap liquidity-launchpad deployments on Robinhood.
 * Runtime hashes observed at block 60979304; see
 * docs/evidence/POOLS_TRADE_DEPLOYMENTS.md for primary vs secondary sources.
 */
export const POOLS_TRADE_DEPLOYMENTS = {
  launchEntryCurrent: {
    address: getAddress("0x0000ffffbe8efe702c8703ae3477ff5de3d319c0"),
    hash: "0x4a586d925c9d59ece13ce2239ebd7dea9ee725f9d33c6667e0fd16ae8d977d80",
  },
  launchEntryOriginal: {
    address: getAddress("0x00004c4ccc709ef590f7c81102c0689f0263d4e9"),
    hash: "0x672007315147b9202d825c5a4f5fed556179de55a89d8052f64d1c49ef366ed6",
  },
  tokenFactory: {
    address: getAddress("0x000000e200088d55c39a11f609e5f667729ad49b"),
    hash: "0x9f042af1533641f048ced56b55898d9e87b2ccb0ec6854292e2cd8ea733e6aeb",
  },
  launchpadCurrentCreatorFees: {
    address: getAddress("0x23f8209572b4a1c2ad88a42749e830791fb027f1"),
    hash: "0x29df27cf43533e9b3708dcd2a2c0fd17a1a8796407e7d39375f47e5c809cffca",
  },
  launchpadCurrentNoCreatorFees: {
    address: getAddress("0xad44d55e7f8337c3ce113fbb591486e85be104b2"),
    hash: "0x6944058fa8339bcf018c4a2ddc043d378b47516f8756db34202bdc6cf93a9a8e",
  },
  launchpadOriginalA: {
    address: getAddress("0xce57498d3474dcc244dfb6710ffbe6d4441cd2b2"),
    hash: "0x50c9d66d818a575b0c8ac7af64fd0beeb92aeed26db5a71c6901cdbd135539ba",
  },
  launchpadOriginalB: {
    address: getAddress("0x60d73b21cdf2ea846ab3d58699bbbb8f29d72491"),
    hash: "0x2562884d759c0753bffcd3e7fb60891bb1df15be441e6fe399e45fb5f3c87c4e",
  },
  poolManager: {
    address: getAddress("0x8366a39cc670b4001a1121b8f6a443a643e40951"),
    hash: "0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626",
  },
} as const;

/** InstantLaunchStrategy addresses that emit TokenLaunched. */
export const POOLS_TRADE_LAUNCHPADS = [
  POOLS_TRADE_DEPLOYMENTS.launchpadCurrentCreatorFees.address,
  POOLS_TRADE_DEPLOYMENTS.launchpadCurrentNoCreatorFees.address,
  POOLS_TRADE_DEPLOYMENTS.launchpadOriginalA.address,
  POOLS_TRADE_DEPLOYMENTS.launchpadOriginalB.address,
] as const;

/**
 * From Uniswap InstantLaunchStrategy.sol (liquidity-launcher v3.2.0).
 * topic0 matches Bitquery's reported SignatureHash.
 */
const TOKEN_LAUNCHED = parseAbiItem(
  "event TokenLaunched(bytes32 indexed poolId, address indexed token, address indexed finalPositionRecipient, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key)"
);

type TokenLaunchedLog = Log<bigint, number, false, typeof TOKEN_LAUNCHED, true>;

const findTokenLaunched = async (
  client: TradeEvmClient,
  token: Address,
  headBlock: bigint
): Promise<TokenLaunchedLog | null> => {
  let to = headBlock;
  for (let page = 0; page < LOG_MAX_PAGES; page += 1) {
    const from = to > LOG_PAGE ? to - LOG_PAGE + 1n : 0n;
    const logs = await client.getLogs({
      address: [...POOLS_TRADE_LAUNCHPADS],
      event: TOKEN_LAUNCHED,
      args: { token },
      fromBlock: from,
      toBlock: to,
      strict: true,
    });
    const hit = logs.find((log) => !log.removed);
    if (hit !== undefined) {
      return hit;
    }
    if (from === 0n) {
      break;
    }
    to = from - 1n;
  }
  return null;
};

const registrationFromLog = (
  log: TokenLaunchedLog
): LaunchVenueRegistration => {
  const feeRecipient = log.args?.finalPositionRecipient;
  if (feeRecipient === undefined || log.args?.token === undefined) {
    return emptyRegistration("TokenLaunched log missing indexed fields.");
  }
  return {
    registered: true,
    factory: getAddress(log.address),
    deployer: null,
    feeRecipient: getAddress(feeRecipient),
    curveOrPool: POOLS_TRADE_DEPLOYMENTS.poolManager.address,
    poolId: log.args?.poolId ?? null,
    phase: "standard",
    registrationBlock: log.blockNumber.toString(),
    note: "Pools.trade launches into a Uniswap v4 pool (no bonding-curve contract).",
  };
};

export const poolsTradeLaunchVenue = (
  client: TradeEvmClient,
  options?: { readonly stubbed?: boolean }
): LaunchVenue => {
  const stubbed = options?.stubbed === true;
  return {
    id: "pools_trade",
    network: PONS_NETWORK,
    capabilities: {
      template: false,
      insiders: false,
      concentration: true,
    },
    stubbed,
    verifyDeployments: async (blockNumber) =>
      await verifyPinnedDeployments(
        client,
        POOLS_TRADE_DEPLOYMENTS,
        blockNumber,
        stubbed
      ),
    registration: async (token, blockNumber) => {
      if (stubbed) {
        return emptyRegistration(
          "Stub pools.trade venue: no registration read."
        );
      }
      const hit = await findTokenLaunched(
        client,
        getAddress(token),
        blockNumber
      );
      if (hit === null) {
        return emptyRegistration(
          "TokenLaunched log not found within the search budget."
        );
      }
      return registrationFromLog(hit);
    },
    template: () =>
      notApplicableTemplate(
        "pools_trade",
        "No stable pools.trade token bytecode clone has been fingerprinted yet."
      ),
    launchBlock: async (token, headBlock) => {
      if (stubbed) {
        return {
          block: null,
          transactionId: null,
          note: "Stub pools.trade venue: no launch log.",
        };
      }
      const hit = await findTokenLaunched(client, getAddress(token), headBlock);
      if (hit === null) {
        return {
          block: null,
          transactionId: null,
          note: "TokenLaunched log not found within the search budget.",
        };
      }
      return {
        block: hit.blockNumber.toString(),
        transactionId: hit.transactionHash,
        note: null,
      };
    },
    // v4 Swap filtering by poolId is not wired yet; no curve buy/sell events.
    tradeEvents: async () => await Promise.resolve([]),
    exclusions: (registration) => {
      // SAFETY: pinned deployment addresses are checksummed TradingAddress literals.
      const poolManager = POOLS_TRADE_DEPLOYMENTS.poolManager
        .address as TradingAddress;
      // SAFETY: pinned deployment addresses are checksummed TradingAddress literals.
      const tokenFactory = POOLS_TRADE_DEPLOYMENTS.tokenFactory
        .address as TradingAddress;
      // SAFETY: pinned deployment addresses are checksummed TradingAddress literals.
      const launchEntryCurrent = POOLS_TRADE_DEPLOYMENTS.launchEntryCurrent
        .address as TradingAddress;
      // SAFETY: pinned deployment addresses are checksummed TradingAddress literals.
      const launchEntryOriginal = POOLS_TRADE_DEPLOYMENTS.launchEntryOriginal
        .address as TradingAddress;
      return uniqueAddresses([
        ZERO,
        poolManager,
        tokenFactory,
        launchEntryCurrent,
        launchEntryOriginal,
        ...POOLS_TRADE_LAUNCHPADS.map(
          // SAFETY: launchpad addresses are pinned checksummed TradingAddresses.
          (address) => address as TradingAddress
        ),
        ...(registration.factory === null ? [] : [registration.factory]),
        ...(registration.feeRecipient === null
          ? []
          : [registration.feeRecipient]),
      ]);
    },
    launcherFact: (registration, deploymentsChanged) =>
      launcherFactFor(
        "pools_trade",
        POOLS_TRADE_DEPLOYMENTS.tokenFactory.address,
        registration,
        deploymentsChanged,
        "pools.trade"
      ),
    cohortFact: cohortFactFor,
  };
};

export const stubPoolsTradeLaunchVenue = (): LaunchVenue =>
  poolsTradeLaunchVenue(stubVenueClient(), { stubbed: true });
