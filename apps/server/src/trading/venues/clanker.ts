/**
 * Clanker v4 launch venue adapter for Base research.
 * Pins factory / FeeLocker / LpLocker from the v4-contracts README; never builds
 * calldata. Registration uses tokenDeploymentInfo; launch uses TokenCreated.
 */

import type { TradingAddress } from "@froggy/domain";
import { getAddress, parseAbi, parseAbiItem } from "viem";
import type { Address } from "viem";

import type { TradeEvmClient } from "../evm-chain";
import {
  BASE_NETWORK,
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

// Primary: https://github.com/clanker-devco/v4-contracts README (Base mainnet v4.0).
// Runtime hashes observed via public Base RPC; see docs/evidence/CLANKER_DEPLOYMENTS.md.
export const CLANKER_DEPLOYMENTS = {
  factory: {
    address: getAddress("0xE85A59c628F7d27878ACeB4bf3b35733630083a9"),
    hash: "0x43acb1f309cc223c71169825b9ab9c0f703669c25156e2999102dcfbb1826bee",
  },
  feeLocker: {
    address: getAddress("0xF3622742b1E446D92e45E22923Ef11C2fcD55D68"),
    hash: "0x771f566794aa68f1e5498fdb5cb59e2bb7c3e8daeed340f2bb45f8856d4187c7",
  },
  lpLocker: {
    address: getAddress("0x29d17C1A8D851d7d4cA97FAe97AcAdb398D9cCE0"),
    hash: "0x216d1e06b97f936ddace1453431fec8b8d2d75dfc1ca013b4ea7ed594a734939",
  },
} as const;

/** Vault from the same README — exclusion only, not hash-pinned in verifyDeployments. */
export const CLANKER_VAULT = getAddress(
  "0x8E845EAd15737bF71904A30BdDD3aEE76d6ADF6C"
);

const CLANKER_ABI = parseAbi([
  "function tokenDeploymentInfo(address token) view returns ((address token, address hook, address locker, address[] extensions))",
]);

const TOKEN_CREATED = parseAbiItem(
  "event TokenCreated(address msgSender, address indexed tokenAddress, address indexed tokenAdmin, string tokenImage, string tokenName, string tokenSymbol, string tokenMetadata, string tokenContext, int24 startingTick, address poolHook, bytes32 poolId, address pairedToken, address locker, address mevModule, uint256 extensionsSupply, address[] extensions)"
);

const findTokenCreated = async (
  client: TradeEvmClient,
  token: Address,
  headBlock: bigint
) => {
  let to = headBlock;
  for (let page = 0; page < LOG_MAX_PAGES; page += 1) {
    const from = to > LOG_PAGE ? to - LOG_PAGE + 1n : 0n;
    const logs = await client.getLogs({
      address: CLANKER_DEPLOYMENTS.factory.address,
      event: TOKEN_CREATED,
      args: { tokenAddress: token },
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

export const clankerLaunchVenue = (
  client: TradeEvmClient,
  options?: { readonly stubbed?: boolean }
): LaunchVenue => {
  const stubbed = options?.stubbed === true;
  return {
    id: "clanker",
    network: BASE_NETWORK,
    capabilities: {
      template: false,
      insiders: false,
      concentration: true,
    },
    stubbed,
    verifyDeployments: (blockNumber) =>
      verifyPinnedDeployments(
        client,
        CLANKER_DEPLOYMENTS,
        blockNumber,
        stubbed
      ),
    registration: async (token, blockNumber) => {
      if (stubbed) {
        return emptyRegistration("Stub Clanker venue: no registration read.");
      }
      // SAFETY: getAddress returns a checksummed 20-byte address for a TradingAddress.
      const address = getAddress(token) as Address;
      let info: {
        token: Address;
        hook: Address;
        locker: Address;
        extensions: readonly Address[];
      };
      try {
        info = await client.readContract({
          address: CLANKER_DEPLOYMENTS.factory.address,
          abi: CLANKER_ABI,
          functionName: "tokenDeploymentInfo",
          args: [address],
          blockNumber,
        });
      } catch {
        return emptyRegistration(
          "Clanker tokenDeploymentInfo reverted for this token."
        );
      }
      if (
        info.token === ZERO ||
        info.token.toLowerCase() !== address.toLowerCase()
      ) {
        return emptyRegistration("Not registered with the Clanker v4 factory.");
      }
      const created = await findTokenCreated(client, address, blockNumber);
      const registration: LaunchVenueRegistration = {
        registered: true,
        // SAFETY: CLANKER_DEPLOYMENTS factory address is a pinned TradingAddress.
        factory: CLANKER_DEPLOYMENTS.factory.address as TradingAddress,
        // SAFETY: tokenAdmin from TokenCreated is a checksummed 20-byte address when present.
        deployer:
          created?.args.tokenAdmin === undefined
            ? null
            : (getAddress(created.args.tokenAdmin) as TradingAddress),
        feeRecipient: null,
        // SAFETY: getAddress returns a checksummed 20-byte address from factory record.
        curveOrPool: getAddress(info.hook) as TradingAddress,
        phase: "standard",
        registrationBlock:
          created === null ? null : created.blockNumber.toString(),
        note:
          created === null
            ? "Registered via tokenDeploymentInfo; TokenCreated log not found within the search budget."
            : null,
      };
      return registration;
    },
    template: () =>
      notApplicableTemplate(
        "clanker",
        "Clanker token template fingerprint is not yet recorded across 2+ tokens."
      ),
    launchBlock: async (token, headBlock) => {
      if (stubbed) {
        return {
          block: null,
          transactionId: null,
          note: "Stub Clanker venue: no launch log.",
        };
      }
      // SAFETY: getAddress returns a checksummed 20-byte address for a TradingAddress.
      const hit = await findTokenCreated(
        client,
        getAddress(token) as Address,
        headBlock
      );
      if (hit === null) {
        return {
          block: null,
          transactionId: null,
          note: "TokenCreated log not found within the search budget.",
        };
      }
      return {
        block: hit.blockNumber.toString(),
        transactionId: hit.transactionHash,
        note: null,
      };
    },
    tradeEvents: () => Promise.resolve([]),
    exclusions: (registration) =>
      uniqueAddresses([
        ZERO,
        // SAFETY: pinned Clanker factory address is a TradingAddress.
        CLANKER_DEPLOYMENTS.factory.address as TradingAddress,
        // SAFETY: pinned Clanker FeeLocker address is a TradingAddress.
        CLANKER_DEPLOYMENTS.feeLocker.address as TradingAddress,
        // SAFETY: pinned Clanker LpLocker address is a TradingAddress.
        CLANKER_DEPLOYMENTS.lpLocker.address as TradingAddress,
        // SAFETY: Clanker Vault from the same README is a TradingAddress.
        CLANKER_VAULT as TradingAddress,
        ...(registration.curveOrPool === null
          ? []
          : [registration.curveOrPool]),
        ...(registration.feeRecipient === null
          ? []
          : [registration.feeRecipient]),
        ...(registration.deployer === null ? [] : [registration.deployer]),
      ]),
    launcherFact: (registration, deploymentsChanged) =>
      launcherFactFor(
        "clanker",
        // SAFETY: pinned factory address is a TradingAddress.
        CLANKER_DEPLOYMENTS.factory.address as TradingAddress,
        registration,
        deploymentsChanged,
        "Clanker"
      ),
    cohortFact: cohortFactFor,
  };
};

export const stubClankerLaunchVenue = (): LaunchVenue =>
  clankerLaunchVenue(stubVenueClient(), { stubbed: true });
