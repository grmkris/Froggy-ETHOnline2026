/**
 * Pons V2 launch venue adapter for Robinhood Chain research.
 * Reuses the pinned deployments and ABI from the execution path; never builds
 * calldata. Template matching zeros the three immutable address slots before
 * hashing — see PONS_TOKEN_TEMPLATE.
 */

import type { TradingAddress } from "@froggy/domain";
import { getAddress, keccak256, parseAbiItem } from "viem";
import type { Address, Hex } from "viem";

import type { TradeEvmClient } from "../evm-chain";
import { PONS_NETWORK } from "../networks";
import { PONS_ABI, PONS_DEPLOYMENTS, PONS_TOKEN_TEMPLATE } from "../pons";
import { maskedTemplateFact } from "./common";
import type {
  LaunchVenue,
  LaunchVenueRegistration,
  LaunchVenueTrade,
} from "./types";

export type {
  LaunchCohortFact,
  LauncherFact,
  TokenTemplateFact,
} from "@froggy/domain";

const TOKEN_LAUNCHED = parseAbiItem(
  "event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)"
);
const CURVE_BUY = parseAbiItem(
  "event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)"
);
const CURVE_SELL = parseAbiItem(
  "event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)"
);

// SAFETY: the zero address is a valid 20-byte TradingAddress literal.
const ZERO = "0x0000000000000000000000000000000000000000" as TradingAddress;

const phaseOf = (raw: number): LaunchVenueRegistration["phase"] => {
  if (raw === 0) {
    return "curve";
  }
  return raw === 2 ? "graduated" : "standard";
};

const emptyRegistration = (note: string | null): LaunchVenueRegistration => ({
  registered: false,
  factory: null,
  deployer: null,
  feeRecipient: null,
  curveOrPool: null,
  poolId: null,
  phase: null,
  registrationBlock: null,
  note,
});

export const ponsLaunchVenue = (
  client: TradeEvmClient,
  options?: { readonly stubbed?: boolean }
): LaunchVenue => {
  const stubbed = options?.stubbed === true;
  return {
    id: "pons",
    network: PONS_NETWORK,
    capabilities: {
      template: true,
      insiders: true,
      concentration: true,
    },
    stubbed,
    verifyDeployments: async (blockNumber) => {
      if (stubbed) {
        return [];
      }
      const checks = await Promise.all(
        Object.entries(PONS_DEPLOYMENTS).map(async ([name, deployment]) => {
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
    },
    registration: async (token, blockNumber) => {
      if (stubbed) {
        return emptyRegistration("Stub Pons venue: no registration read.");
      }
      const record = await client.readContract({
        address: PONS_DEPLOYMENTS.factory.address,
        abi: PONS_ABI,
        functionName: "getLaunchedToken",
        args: [getAddress(token)],
        blockNumber,
      });
      if (!record.exists) {
        return emptyRegistration("Not registered with the Pons V2 factory.");
      }
      return {
        registered: true,
        // SAFETY: PONS_DEPLOYMENTS factory address is a pinned TradingAddress.
        factory: PONS_DEPLOYMENTS.factory.address as TradingAddress,
        // SAFETY: getAddress returns a checksummed 20-byte address from factory record.
        deployer: getAddress(record.deployer) as TradingAddress,
        // SAFETY: getAddress returns a checksummed 20-byte address from factory record.
        feeRecipient: getAddress(record.creatorFeeRecipient) as TradingAddress,
        // SAFETY: getAddress returns a checksummed 20-byte address from factory record.
        curveOrPool: getAddress(record.curve) as TradingAddress,
        poolId: null,
        phase: phaseOf(record.phase),
        registrationBlock: null,
        note: null,
      };
    },
    template: (code) =>
      maskedTemplateFact({
        venue: "pons",
        template: PONS_TOKEN_TEMPLATE,
        code,
        stubbed,
        mismatchNote:
          "Runtime bytecode does not match the reviewed Pons V2 token template.",
      }),
    launchBlock: async (token, headBlock) => {
      if (stubbed) {
        return {
          block: null,
          transactionId: null,
          note: "Stub Pons venue: no launch log.",
        };
      }
      // Bound the search: 10 pages of 10_000 blocks ≈ 100_000 blocks (~3 h).
      const PAGE = 10_000n;
      const MAX_PAGES = 10;
      let to = headBlock;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const from = to > PAGE ? to - PAGE + 1n : 0n;
        const logs = await client.getLogs({
          address: PONS_DEPLOYMENTS.factory.address,
          event: TOKEN_LAUNCHED,
          // SAFETY: getAddress returns a checksummed 20-byte address for a TradingAddress.
          args: { token: getAddress(token) as Address },
          fromBlock: from,
          toBlock: to,
          strict: true,
        });
        const hit = logs.find((log) => !log.removed);
        if (hit !== undefined) {
          return {
            block: hit.blockNumber.toString(),
            transactionId: hit.transactionHash,
            note: null,
          };
        }
        if (from === 0n) {
          break;
        }
        to = from - 1n;
      }
      return {
        block: null,
        transactionId: null,
        note: "TokenLaunched log not found within the search budget.",
      };
    },
    tradeEvents: async (_token, curveOrPool, fromBlock, toBlock) => {
      if (stubbed || fromBlock > toBlock) {
        return [];
      }
      // SAFETY: getAddress returns a checksummed 20-byte address for a TradingAddress.
      const curve = getAddress(curveOrPool) as Address;
      const [buys, sells] = await Promise.all([
        client.getLogs({
          address: curve,
          event: CURVE_BUY,
          fromBlock,
          toBlock,
          strict: true,
        }),
        client.getLogs({
          address: curve,
          event: CURVE_SELL,
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
    exclusions: (registration) => {
      const list: TradingAddress[] = [ZERO];
      if (registration.curveOrPool !== null) {
        list.push(registration.curveOrPool);
      }
      list.push(
        // SAFETY: PONS_DEPLOYMENTS hook address is a pinned TradingAddress.
        PONS_DEPLOYMENTS.hook.address as TradingAddress,
        // SAFETY: PONS_DEPLOYMENTS manager address is a pinned TradingAddress.
        PONS_DEPLOYMENTS.manager.address as TradingAddress,
        // SAFETY: PONS_DEPLOYMENTS factory address is a pinned TradingAddress.
        PONS_DEPLOYMENTS.factory.address as TradingAddress
      );
      if (registration.feeRecipient !== null) {
        list.push(registration.feeRecipient);
      }
      return [...new Set(list.map((entry) => entry.toLowerCase()))].map(
        // SAFETY: entries are lowercased TradingAddress strings from the exclusion list.
        (entry) => getAddress(entry) as TradingAddress
      );
    },
    launcherFact: (registration, deploymentsChanged) => {
      if (deploymentsChanged.length > 0) {
        return {
          status: "unavailable",
          launcher: "pons",
          // SAFETY: PONS_DEPLOYMENTS factory address is a pinned TradingAddress.
          factory: PONS_DEPLOYMENTS.factory.address as TradingAddress,
          deployer: null,
          feeRecipient: null,
          curveOrPool: null,
          poolId: null,
          phase: null,
          registrationBlock: null,
          note: `Changed Pons dependencies: ${deploymentsChanged.join(", ")}.`,
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
          poolId: null,
          phase: null,
          registrationBlock: null,
          note: registration.note,
        };
      }
      return {
        status: "observed",
        launcher: "pons",
        factory: registration.factory,
        deployer: registration.deployer,
        feeRecipient: registration.feeRecipient,
        curveOrPool: registration.curveOrPool,
        poolId: null,
        phase: registration.phase,
        registrationBlock: registration.registrationBlock,
        note: null,
      };
    },
    cohortFact: ({
      registration,
      launchBlock,
      launchTransaction,
      windowBlocks,
      trades,
      note,
    }) => {
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
    },
  };
};

const stubPonsClient = (): TradeEvmClient => {
  const client = {
    getCode: (): Promise<Hex | undefined> =>
      // SAFETY: an empty resolve is the stub's "no code at address" response.
      Promise.resolve() as Promise<Hex | undefined>,
    getLogs: (): Promise<never[]> => Promise.resolve([]),
    readContract: (): Promise<never> => Promise.reject(new Error("stub")),
  };
  // SAFETY: ponsLaunchVenue only calls getCode/getLogs/readContract on this stub.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- PublicClient is too wide to stub without unknown.
  return client as unknown as TradeEvmClient;
};

export const stubPonsLaunchVenue = (): LaunchVenue =>
  ponsLaunchVenue(stubPonsClient(), { stubbed: true });
