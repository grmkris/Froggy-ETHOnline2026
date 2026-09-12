/**
 * Zora Coins launch venue adapter for Base research.
 * Pins the factory from docs.zora.co; never builds calldata. Registration
 * probes coin views (currency / payoutRecipient / hooks) then confirms via
 * factory creation logs when the coin address is not an indexed topic.
 */

import type { TradingAddress } from "@froggy/domain";
import { getAddress, keccak256, parseAbi, parseAbiItem } from "viem";
import type { Address } from "viem";

import type { TradeEvmClient } from "../evm-chain";
import {
  BASE_NETWORK,
  cohortFactFor,
  emptyRegistration,
  launcherFactFor,
  LOG_MAX_PAGES,
  LOG_PAGE,
  stubVenueClient,
  uniqueAddresses,
  verifyPinnedDeployments,
  ZERO,
} from "./common";
import type {
  LaunchVenue,
  LaunchVenueRegistration,
  LaunchVenueTrade,
} from "./types";

// Primary: https://docs.zora.co/coins/contracts/creating-a-coin
// Runtime hash observed via public Base RPC; see docs/evidence/ZORA_DEPLOYMENTS.md.
// Factory is an EIP-1167 proxy (130 bytes); the pin is the proxy runtime.
export const ZORA_DEPLOYMENTS = {
  factory: {
    address: getAddress("0x777777751622c0d3258f214F9DF38E35BF45baF3"),
    hash: "0xd5e3301e737ae8f1471ced5089ae8e950baa3844e353ce76bdad2edb6b44da2e",
  },
  // Coin implementation behind every CoinCreatedV4 proxy observed at block 51209251.
  coinImplementation: {
    address: getAddress("0x5dbd43785954d43c1643a0caf2ecef9e0056ff13"),
    hash: "0xfc1474fb66df4d6af5cee402ff1d99b3958ad7f4f15c591244cdaac0c72bbb1e",
  },
} as const;

/**
 * Every Zora content coin is the same 45-byte EIP-1167 proxy to the pinned
 * implementation, so its runtime hash is a whole-code pin rather than a masked
 * template. Eight CoinCreatedV4 coins at block 51209251 hashed alike.
 */
export const ZORA_COIN_PROXY_HASH =
  "0xe4c5ad7d4a813d9a2f632ccb653b95c93b40680043250b3d84d4fdb1448e0bf8";

const COIN_ABI = parseAbi([
  "function currency() view returns (address)",
  "function payoutRecipient() view returns (address)",
  "function hooks() view returns (address)",
  "function platformReferrer() view returns (address)",
]);

const POOL_KEY =
  "(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";

const COIN_CREATED_V4 = parseAbiItem(
  `event CoinCreatedV4(address indexed caller, address indexed payoutRecipient, address indexed platformReferrer, address currency, string uri, string name, string symbol, address coin, ${POOL_KEY} poolKey, bytes32 poolKeyHash, string version)`
);
const CREATOR_COIN_CREATED = parseAbiItem(
  `event CreatorCoinCreated(address indexed caller, address indexed payoutRecipient, address indexed platformReferrer, address currency, string uri, string name, string symbol, address coin, ${POOL_KEY} poolKey, bytes32 poolKeyHash, string version)`
);
const TREND_COIN_CREATED = parseAbiItem(
  `event TrendCoinCreated(address indexed caller, string symbol, address coin, ${POOL_KEY} poolKey, bytes32 poolKeyHash, bytes poolConfig, string version)`
);
const COIN_CREATED = parseAbiItem(
  "event CoinCreated(address indexed caller, address indexed payoutRecipient, address indexed platformReferrer, address currency, string uri, string name, string symbol, address coin, address pool, string version)"
);

const COIN_BUY = parseAbiItem(
  "event CoinBuy(address indexed buyer, address indexed recipient, address indexed tradeReferrer, uint256 coinsPurchased, address currency, uint256 amountFee, uint256 amountSold)"
);
const COIN_SELL = parseAbiItem(
  "event CoinSell(address indexed seller, address indexed recipient, address indexed tradeReferrer, uint256 coinsSold, address currency, uint256 amountFee, uint256 amountPurchased)"
);

interface CreationHit {
  readonly blockNumber: bigint;
  readonly transactionHash: `0x${string}`;
  readonly caller: Address | null;
  readonly payoutRecipient: Address | null;
  readonly hooksOrPool: Address | null;
  readonly poolId: `0x${string}` | null;
}

const hooksOrPoolFromArgs = (args: {
  readonly pool?: Address;
  readonly poolKey?: { readonly hooks?: Address };
}): Address | null => {
  if (args.poolKey?.hooks !== undefined) {
    return getAddress(args.poolKey.hooks);
  }
  if (args.pool !== undefined) {
    return getAddress(args.pool);
  }
  return null;
};

const findCreation = async (
  client: TradeEvmClient,
  token: Address,
  headBlock: bigint
): Promise<CreationHit | null> => {
  const events = [
    COIN_CREATED_V4,
    CREATOR_COIN_CREATED,
    TREND_COIN_CREATED,
    COIN_CREATED,
  ] as const;
  let to = headBlock;
  for (let page = 0; page < LOG_MAX_PAGES; page += 1) {
    const from = to > LOG_PAGE ? to - LOG_PAGE + 1n : 0n;
    for (const event of events) {
      const logs = await client.getLogs({
        address: ZORA_DEPLOYMENTS.factory.address,
        event,
        fromBlock: from,
        toBlock: to,
        strict: true,
      });
      for (const log of logs) {
        if (log.removed || log.args.coin === undefined) {
          continue;
        }
        const coin = getAddress(log.args.coin);
        if (coin.toLowerCase() !== token.toLowerCase()) {
          continue;
        }
        return {
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          caller:
            "caller" in log.args && log.args.caller !== undefined
              ? getAddress(log.args.caller)
              : null,
          payoutRecipient:
            "payoutRecipient" in log.args &&
            log.args.payoutRecipient !== undefined
              ? getAddress(log.args.payoutRecipient)
              : null,
          hooksOrPool: hooksOrPoolFromArgs(log.args),
          poolId:
            "poolKeyHash" in log.args && log.args.poolKeyHash !== undefined
              ? log.args.poolKeyHash
              : null,
        };
      }
    }
    if (from === 0n) {
      break;
    }
    to = from - 1n;
  }
  return null;
};

export const zoraLaunchVenue = (
  client: TradeEvmClient,
  options?: { readonly stubbed?: boolean }
): LaunchVenue => {
  const stubbed = options?.stubbed === true;
  return {
    id: "zora",
    network: BASE_NETWORK,
    capabilities: {
      template: false,
      insiders: true,
      concentration: true,
    },
    stubbed,
    verifyDeployments: (blockNumber) =>
      verifyPinnedDeployments(client, ZORA_DEPLOYMENTS, blockNumber, stubbed),
    registration: async (token, blockNumber) => {
      if (stubbed) {
        return emptyRegistration("Stub Zora venue: no registration read.");
      }
      // SAFETY: getAddress returns a checksummed 20-byte address for a TradingAddress.
      const address = getAddress(token) as Address;
      let payoutRecipient: Address;
      let hooks: Address;
      try {
        const [currency, payout, hook] = await Promise.all([
          client.readContract({
            address,
            abi: COIN_ABI,
            functionName: "currency",
            blockNumber,
          }),
          client.readContract({
            address,
            abi: COIN_ABI,
            functionName: "payoutRecipient",
            blockNumber,
          }),
          client.readContract({
            address,
            abi: COIN_ABI,
            functionName: "hooks",
            blockNumber,
          }),
        ]);
        if (currency === undefined) {
          return emptyRegistration("Not a Zora coin (currency view failed).");
        }
        payoutRecipient = payout;
        hooks = hook;
      } catch {
        return emptyRegistration(
          "Not registered as a Zora coin (currency/payoutRecipient/hooks views failed)."
        );
      }
      const created = await findCreation(client, address, blockNumber);
      const registration: LaunchVenueRegistration = {
        registered: true,
        // SAFETY: ZORA_DEPLOYMENTS factory address is a pinned TradingAddress.
        factory: ZORA_DEPLOYMENTS.factory.address as TradingAddress,
        // SAFETY: caller from factory creation log is a checksummed address when present.
        deployer:
          created !== null && created.caller !== null
            ? (created.caller as TradingAddress)
            : null,
        // SAFETY: payoutRecipient from the coin view is a checksummed 20-byte address.
        feeRecipient: getAddress(payoutRecipient) as TradingAddress,
        // SAFETY: hooks from the coin view is a checksummed 20-byte address.
        curveOrPool: getAddress(
          created?.hooksOrPool ?? hooks
        ) as TradingAddress,
        poolId: created?.poolId ?? null,
        phase: "standard",
        registrationBlock:
          created === null ? null : created.blockNumber.toString(),
        note:
          created === null
            ? "Coin views succeeded; factory creation log not found within the search budget."
            : null,
      };
      return registration;
    },
    template: (code) => {
      if (stubbed) {
        return {
          status: "unavailable",
          matches: null,
          hash: null,
          venue: "zora",
          note: "Stub Zora venue: no template read.",
        };
      }
      if (code === undefined || code === "0x") {
        return {
          status: "not_indexed",
          matches: null,
          hash: null,
          venue: "zora",
          note: "No runtime code at this address.",
        };
      }
      const matches = keccak256(code) === ZORA_COIN_PROXY_HASH;
      return {
        status: "observed",
        matches,
        hash: ZORA_COIN_PROXY_HASH,
        venue: "zora",
        note: matches
          ? "EIP-1167 proxy to the pinned Zora coin implementation; not a per-token template."
          : "Runtime is not the reviewed EIP-1167 proxy to the pinned Zora coin implementation.",
      };
    },
    launchBlock: async (token, headBlock) => {
      if (stubbed) {
        return {
          block: null,
          transactionId: null,
          note: "Stub Zora venue: no launch log.",
        };
      }
      // SAFETY: getAddress returns a checksummed 20-byte address for a TradingAddress.
      const hit = await findCreation(
        client,
        getAddress(token) as Address,
        headBlock
      );
      if (hit === null) {
        return {
          block: null,
          transactionId: null,
          note: "Zora factory creation log not found within the search budget.",
        };
      }
      return {
        block: hit.blockNumber.toString(),
        transactionId: hit.transactionHash,
        note: null,
      };
    },
    tradeEvents: async (token, _curveOrPool, fromBlock, toBlock) => {
      if (stubbed || fromBlock > toBlock) {
        return [];
      }
      // SAFETY: getAddress returns a checksummed 20-byte address for a TradingAddress.
      const address = getAddress(token) as Address;
      const [buys, sells] = await Promise.all([
        client.getLogs({
          address,
          event: COIN_BUY,
          fromBlock,
          toBlock,
          strict: true,
        }),
        client.getLogs({
          address,
          event: COIN_SELL,
          fromBlock,
          toBlock,
          strict: true,
        }),
      ]);
      const trades: LaunchVenueTrade[] = [];
      for (const log of buys) {
        if (log.removed) {
          continue;
        }
        trades.push({
          // SAFETY: getAddress returns a checksummed 20-byte address from log args.
          buyerOrSeller: getAddress(log.args.buyer) as TradingAddress,
          // SAFETY: getAddress returns a checksummed 20-byte address from log args.
          recipient: getAddress(log.args.recipient) as TradingAddress,
          block: log.blockNumber.toString(),
          transactionId: log.transactionHash,
          side: "buy",
        });
      }
      for (const log of sells) {
        if (log.removed) {
          continue;
        }
        trades.push({
          // SAFETY: getAddress returns a checksummed 20-byte address from log args.
          buyerOrSeller: getAddress(log.args.seller) as TradingAddress,
          // SAFETY: getAddress returns a checksummed 20-byte address from log args.
          recipient: getAddress(log.args.recipient) as TradingAddress,
          block: log.blockNumber.toString(),
          transactionId: log.transactionHash,
          side: "sell",
        });
      }
      return trades;
    },
    exclusions: (registration) =>
      uniqueAddresses([
        ZERO,
        // SAFETY: pinned Zora factory address is a TradingAddress.
        ZORA_DEPLOYMENTS.factory.address as TradingAddress,
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
        "zora",
        // SAFETY: pinned factory address is a TradingAddress.
        ZORA_DEPLOYMENTS.factory.address as TradingAddress,
        registration,
        deploymentsChanged,
        "Zora"
      ),
    cohortFact: cohortFactFor,
  };
};

export const stubZoraLaunchVenue = (): LaunchVenue =>
  zoraLaunchVenue(stubVenueClient(), { stubbed: true });
