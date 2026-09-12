/**
 * Flaunch launch venue adapter for Base research.
 * Pins Flaunch + PositionManager from flaunchgg-contracts releases; never builds
 * calldata. Registration uses Flaunch.tokenId; launch uses PoolCreated logs.
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

// Primary: https://github.com/flayerlabs/flaunchgg-contracts (v1.1.5-base release table).
// Runtime hashes observed via public Base RPC; see docs/evidence/FLAUNCH_DEPLOYMENTS.md.
export const FLAUNCH_DEPLOYMENTS = {
  flaunch: {
    address: getAddress("0x516af52d0c629b5e378da4dc64ecb0744ce10109"),
    hash: "0x8be29288e3373d71c49957887e6a27029fb2cb1021a03dc4f8d2eba81fc333fe",
  },
  positionManager: {
    address: getAddress("0x23321f11a6d44fd1ab790044fdfde5758c902fdc"),
    hash: "0x5eca45e09bd789d828359554b41353c7f4d2468e71766fe3a79b7853aa1adf8a",
  },
} as const;

const FLAUNCH_ABI = parseAbi([
  "function tokenId(address _memecoin) view returns (uint256)",
  "function memecoin(uint256 _tokenId) view returns (address)",
  "function memecoinTreasury(uint256 _tokenId) view returns (address)",
]);

const POSITION_ABI = parseAbi([
  "function poolKey(address _token) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))",
]);

const FLAUNCH_PARAMS =
  "(string name, string symbol, string tokenUri, uint256 premineAmount, address creator, uint24 creatorFeeAllocation, uint256 flaunchAt, bytes initialPriceParams, bytes feeCalculatorParams)";

const POOL_CREATED = parseAbiItem(
  `event PoolCreated(bytes32 indexed _poolId, address _memecoin, address _memecoinTreasury, uint256 _tokenId, bool _currencyFlipped, uint256 _flaunchFee, ${FLAUNCH_PARAMS} _params)`
);

const findPoolCreated = async (
  client: TradeEvmClient,
  token: Address,
  headBlock: bigint
) => {
  let to = headBlock;
  for (let page = 0; page < LOG_MAX_PAGES; page += 1) {
    const from = to > LOG_PAGE ? to - LOG_PAGE + 1n : 0n;
    const logs = await client.getLogs({
      address: FLAUNCH_DEPLOYMENTS.positionManager.address,
      event: POOL_CREATED,
      fromBlock: from,
      toBlock: to,
      strict: true,
    });
    const hit = logs.find(
      (log) =>
        !log.removed &&
        log.args._memecoin !== undefined &&
        getAddress(log.args._memecoin).toLowerCase() === token.toLowerCase()
    );
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

export const flaunchLaunchVenue = (
  client: TradeEvmClient,
  options?: { readonly stubbed?: boolean }
): LaunchVenue => {
  const stubbed = options?.stubbed === true;
  return {
    id: "flaunch",
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
        FLAUNCH_DEPLOYMENTS,
        blockNumber,
        stubbed
      ),
    registration: async (token, blockNumber) => {
      if (stubbed) {
        return emptyRegistration("Stub Flaunch venue: no registration read.");
      }
      // SAFETY: getAddress returns a checksummed 20-byte address for a TradingAddress.
      const address = getAddress(token) as Address;
      let tokenId: bigint;
      try {
        tokenId = await client.readContract({
          address: FLAUNCH_DEPLOYMENTS.flaunch.address,
          abi: FLAUNCH_ABI,
          functionName: "tokenId",
          args: [address],
          blockNumber,
        });
      } catch {
        return emptyRegistration("Flaunch tokenId reverted for this token.");
      }
      if (tokenId === 0n) {
        return emptyRegistration("Not registered with Flaunch (tokenId is 0).");
      }
      let memecoin: Address;
      let treasury: Address;
      try {
        [memecoin, treasury] = await Promise.all([
          client.readContract({
            address: FLAUNCH_DEPLOYMENTS.flaunch.address,
            abi: FLAUNCH_ABI,
            functionName: "memecoin",
            args: [tokenId],
            blockNumber,
          }),
          client.readContract({
            address: FLAUNCH_DEPLOYMENTS.flaunch.address,
            abi: FLAUNCH_ABI,
            functionName: "memecoinTreasury",
            args: [tokenId],
            blockNumber,
          }),
        ]);
      } catch {
        return emptyRegistration(
          "Flaunch memecoin/treasury views reverted for this tokenId."
        );
      }
      if (memecoin.toLowerCase() !== address.toLowerCase()) {
        return emptyRegistration(
          "Flaunch tokenId did not round-trip to this memecoin."
        );
      }
      let hooks: Address | null = null;
      try {
        const { hooks: poolHooks } = await client.readContract({
          address: FLAUNCH_DEPLOYMENTS.positionManager.address,
          abi: POSITION_ABI,
          functionName: "poolKey",
          args: [address],
          blockNumber,
        });
        hooks = poolHooks;
      } catch {
        hooks = null;
      }
      const created = await findPoolCreated(client, address, blockNumber);
      const creator = created?.args._params?.creator;
      const registration: LaunchVenueRegistration = {
        registered: true,
        // SAFETY: FLAUNCH_DEPLOYMENTS flaunch address is a pinned TradingAddress.
        factory: FLAUNCH_DEPLOYMENTS.flaunch.address as TradingAddress,
        // SAFETY: creator from PoolCreated params is a checksummed address when present.
        deployer:
          creator === undefined
            ? null
            : (getAddress(creator) as TradingAddress),
        // SAFETY: treasury from Flaunch view is a checksummed 20-byte address.
        feeRecipient: getAddress(treasury) as TradingAddress,
        // SAFETY: hooks from poolKey (or position manager) is a checksummed address when present.
        curveOrPool:
          hooks === null
            ? (FLAUNCH_DEPLOYMENTS.positionManager.address as TradingAddress)
            : (getAddress(hooks) as TradingAddress),
        poolId: created?.args._poolId ?? null,
        phase: "standard",
        registrationBlock:
          created === null ? null : created.blockNumber.toString(),
        note:
          created === null
            ? "Registered via tokenId; PoolCreated log not found within the search budget."
            : null,
      };
      return registration;
    },
    template: () =>
      notApplicableTemplate(
        "flaunch",
        "Flaunch token template fingerprint is not yet recorded across 2+ tokens."
      ),
    launchBlock: async (token, headBlock) => {
      if (stubbed) {
        return {
          block: null,
          transactionId: null,
          note: "Stub Flaunch venue: no launch log.",
        };
      }
      // SAFETY: getAddress returns a checksummed 20-byte address for a TradingAddress.
      const hit = await findPoolCreated(
        client,
        getAddress(token) as Address,
        headBlock
      );
      if (hit === null) {
        return {
          block: null,
          transactionId: null,
          note: "PoolCreated log not found within the search budget.",
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
        // SAFETY: pinned Flaunch address is a TradingAddress.
        FLAUNCH_DEPLOYMENTS.flaunch.address as TradingAddress,
        // SAFETY: pinned PositionManager address is a TradingAddress.
        FLAUNCH_DEPLOYMENTS.positionManager.address as TradingAddress,
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
        "flaunch",
        // SAFETY: pinned flaunch address is a TradingAddress.
        FLAUNCH_DEPLOYMENTS.flaunch.address as TradingAddress,
        registration,
        deploymentsChanged,
        "Flaunch"
      ),
    cohortFact: cohortFactFor,
  };
};

export const stubFlaunchLaunchVenue = (): LaunchVenue =>
  flaunchLaunchVenue(stubVenueClient(), { stubbed: true });
