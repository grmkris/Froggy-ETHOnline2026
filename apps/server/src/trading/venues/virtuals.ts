/**
 * Virtuals Protocol bonding-curve launch venue adapter for Base research.
 * Pins the bonding curve from the Virtuals whitepaper contract table; never
 * builds calldata. Registration uses tokenInfo; launch uses Launched.
 * Bonding has no clear buy/sell events, so tradeEvents stays empty.
 */

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

// Primary: https://whitepaper.virtuals.io/info-hub/important-links-and-resources/virtuals-protocol-contract-addresses
// Runtime hash observed via public Base RPC; see docs/evidence/VIRTUALS_DEPLOYMENTS.md.
// Address is a proxy; the pin is the proxy runtime at the observed block.
const VIRTUALS_DEPLOYMENTS = {
  bondingCurve: {
    address: getAddress("0x1A540088125d00dD3990f9dA45CA0859af4d3B01"),
    hash: "0xcb419134161f24654d0518e596f790269a2d4e010e8340765793c44dbc738d47",
  },
} as const;

const VIRTUALS_ABI = parseAbi([
  "function tokenInfo(address) view returns (address creator, address token, address pair, address agentToken, (address token, string name, string _name, string ticker, uint256 supply, uint256 price, uint256 marketCap, uint256 liquidity, uint256 volume, uint256 volume24H, uint256 prevPrice, uint256 lastUpdated) data, string description, uint8[] cores, string image, string twitter, string telegram, string youtube, string website, bool trading, bool tradingOnUniswap)",
]);

const LAUNCHED = parseAbiItem(
  "event Launched(address indexed token, address indexed pair, uint256 index)"
);

const findLaunched = async (
  client: TradeEvmClient,
  token: Address,
  headBlock: bigint
) => {
  let to = headBlock;
  for (let page = 0; page < LOG_MAX_PAGES; page += 1) {
    const from = to > LOG_PAGE ? to - LOG_PAGE + 1n : 0n;
    const logs = await client.getLogs({
      address: VIRTUALS_DEPLOYMENTS.bondingCurve.address,
      event: LAUNCHED,
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

export const virtualsLaunchVenue = (
  client: TradeEvmClient,
  options?: { readonly stubbed?: boolean }
): LaunchVenue => {
  const stubbed = options?.stubbed === true;
  return {
    id: "virtuals",
    network: BASE_NETWORK,
    capabilities: {
      template: false,
      insiders: false,
      concentration: true,
    },
    stubbed,
    verifyDeployments: async (blockNumber) =>
      await verifyPinnedDeployments(
        client,
        VIRTUALS_DEPLOYMENTS,
        blockNumber,
        stubbed
      ),
    registration: async (token, blockNumber) => {
      if (stubbed) {
        return emptyRegistration("Stub Virtuals venue: no registration read.");
      }
      const address = getAddress(token);
      let creator: Address;
      let registeredTokenAddress: Address;
      let pair: Address;
      let trading: boolean;
      let tradingOnUniswap: boolean;
      try {
        const info = await client.readContract({
          address: VIRTUALS_DEPLOYMENTS.bondingCurve.address,
          abi: VIRTUALS_ABI,
          functionName: "tokenInfo",
          args: [address],
          blockNumber,
        });
        // Indices follow VIRTUALS_ABI tokenInfo returns; prefer-destructuring
        // fights unicorn/no-unreadable-array-destructuring on the sparse tuple.
        // oxlint-disable-next-line eslint/prefer-destructuring -- sparse ABI tuple.
        creator = info[0];
        // oxlint-disable-next-line eslint/prefer-destructuring -- sparse ABI tuple.
        registeredTokenAddress = info[1];
        // oxlint-disable-next-line eslint/prefer-destructuring -- sparse ABI tuple.
        pair = info[2];
        // oxlint-disable-next-line eslint/prefer-destructuring -- sparse ABI tuple.
        trading = info[12];
        // oxlint-disable-next-line eslint/prefer-destructuring -- sparse ABI tuple.
        tradingOnUniswap = info[13];
      } catch {
        return emptyRegistration("Virtuals tokenInfo reverted for this token.");
      }
      if (
        registeredTokenAddress === ZERO ||
        registeredTokenAddress.toLowerCase() !== address.toLowerCase()
      ) {
        return emptyRegistration(
          "Not registered with the Virtuals bonding curve."
        );
      }
      const launched = await findLaunched(client, address, blockNumber);
      const registration: LaunchVenueRegistration = {
        registered: true,
        factory: VIRTUALS_DEPLOYMENTS.bondingCurve.address,
        deployer: getAddress(creator),
        feeRecipient: null,
        curveOrPool: getAddress(pair),
        poolId: null,
        phase: (() => {
          if (tradingOnUniswap) {
            return "graduated";
          }
          if (trading) {
            return "curve";
          }
          return "standard";
        })(),
        registrationBlock:
          launched === null ? null : launched.blockNumber.toString(),
        note:
          launched === null
            ? "Registered via tokenInfo; Launched log not found within the search budget."
            : null,
      };
      return registration;
    },
    template: () =>
      notApplicableTemplate(
        "virtuals",
        "Virtuals token template fingerprint is not yet recorded across 2+ tokens."
      ),
    launchBlock: async (token, headBlock) => {
      if (stubbed) {
        return {
          block: null,
          transactionId: null,
          note: "Stub Virtuals venue: no launch log.",
        };
      }
      const hit = await findLaunched(client, getAddress(token), headBlock);
      if (hit === null) {
        return {
          block: null,
          transactionId: null,
          note: "Launched log not found within the search budget.",
        };
      }
      return {
        block: hit.blockNumber.toString(),
        transactionId: hit.transactionHash,
        note: null,
      };
    },
    tradeEvents: async () => await Promise.resolve([]),
    exclusions: (registration) =>
      uniqueAddresses([
        ZERO,
        VIRTUALS_DEPLOYMENTS.bondingCurve.address,
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
        "virtuals",
        VIRTUALS_DEPLOYMENTS.bondingCurve.address,
        registration,
        deploymentsChanged,
        "Virtuals"
      ),
    cohortFact: cohortFactFor,
  };
};

export const stubVirtualsLaunchVenue = (): LaunchVenue =>
  virtualsLaunchVenue(stubVenueClient(), { stubbed: true });
