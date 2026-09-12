import { describe, expect, it } from "bun:test";

import type { TradingAddress } from "@froggy/domain";
import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseAbiParameters,
  toHex,
} from "viem";
import type { Address, Hex } from "viem";

import type { TradeEvmClient } from "../evm-chain";
import {
  POOLS_TRADE_DEPLOYMENTS,
  POOLS_TRADE_LAUNCHPADS,
  poolsTradeLaunchVenue,
  stubPoolsTradeLaunchVenue,
} from "./pools-trade";
import { detectLauncher } from "./types";

// SAFETY: fixed 20-byte hex literal used as an Address fixture.
const token = getAddress(`0x${"11".repeat(20)}`);
// SAFETY: checksummed fixture address used as TradingAddress in venue calls.
const tokenAddress = token as TradingAddress;
const feeSplitter = getAddress(`0x${"22".repeat(20)}`);
const poolId: Hex = `0x${"ab".repeat(32)}`;

const TOKEN_LAUNCHED_TOPIC =
  "0x3b3d2bafdcae274a232217e1f80ee4305d3af6aa25c8b14b1681bd68d18042a4";

const topicAddress = (address: string): Hex =>
  `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;

const ZERO_ADDRESS =
  // SAFETY: zero address is a valid Address literal for PoolKey fixtures.
  "0x0000000000000000000000000000000000000000" as Address;

const tokenLaunchedLog = (block: bigint) => ({
  address: POOLS_TRADE_LAUNCHPADS[0],
  args: {
    poolId,
    token,
    finalPositionRecipient: feeSplitter,
    key: {
      currency0: ZERO_ADDRESS,
      currency1: token,
      fee: 2500,
      tickSpacing: 25,
      hooks: ZERO_ADDRESS,
    },
  },
  blockHash: `0x${"cd".repeat(32)}`,
  blockNumber: block,
  data: encodeAbiParameters(
    parseAbiParameters(
      "(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)"
    ),
    [
      {
        currency0: ZERO_ADDRESS,
        currency1: token,
        fee: 2500,
        tickSpacing: 25,
        hooks: ZERO_ADDRESS,
      },
    ]
  ),
  eventName: "TokenLaunched" as const,
  logIndex: 0,
  removed: false,
  // SAFETY: topic tuple matches TokenLaunched's three indexed fields plus topic0.
  topics: [
    TOKEN_LAUNCHED_TOPIC,
    poolId,
    topicAddress(token),
    topicAddress(feeSplitter),
  ] as [Hex, ...Hex[]],
  transactionHash: `0x${"ef".repeat(32)}`,
  transactionIndex: 0,
});

const stubClient = (partial: {
  readonly getCode?: TradeEvmClient["getCode"];
  readonly getLogs?: TradeEvmClient["getLogs"];
}): TradeEvmClient => {
  const client = {
    getCode:
      partial.getCode ??
      (async () => await Promise.resolve(toHex(new Uint8Array([1, 2, 3])))),
    getLogs: partial.getLogs ?? (async () => await Promise.resolve([])),
    readContract: async () => await Promise.reject(new Error("unused")),
  };
  // SAFETY: venue adapters only call getCode/getLogs/readContract on this stub.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- PublicClient is too wide to stub without unknown.
  return client as unknown as TradeEvmClient;
};

describe("poolsTradeLaunchVenue", () => {
  it("stub venue never claims registration and disables insider trades", async () => {
    const venue = stubPoolsTradeLaunchVenue();
    expect(venue.id).toBe("pools_trade");
    expect(venue.stubbed).toBe(true);
    expect(venue.capabilities.insiders).toBe(false);
    expect(venue.capabilities.template).toBe(false);
    expect(await venue.verifyDeployments(1n)).toEqual([]);
    const registration = await venue.registration(tokenAddress, 1n);
    expect(registration.registered).toBe(false);
    expect(venue.template("0x").status).toBe("not_applicable");
    expect(await venue.tradeEvents(tokenAddress, tokenAddress, 1n, 2n)).toEqual(
      []
    );
  });

  it("verifyDeployments reports changed runtime hashes", async () => {
    const code = toHex(new Uint8Array([9, 9, 9]));
    expect(keccak256(code)).not.toBe(POOLS_TRADE_DEPLOYMENTS.poolManager.hash);
    const venue = poolsTradeLaunchVenue(
      stubClient({
        getCode: async () => await Promise.resolve(code),
      })
    );
    const changed = await venue.verifyDeployments(1n);
    expect(changed.length).toBe(Object.keys(POOLS_TRADE_DEPLOYMENTS).length);
  });

  it("registration and launchBlock decode TokenLaunched across launchpads", async () => {
    const log = tokenLaunchedLog(42n);
    const venue = poolsTradeLaunchVenue(
      stubClient({
        // SAFETY: decoded TokenLaunched fixture matches the venue's getLogs surface.
        getLogs: (async () =>
          await Promise.resolve([log])) as TradeEvmClient["getLogs"],
      })
    );
    const registration = await venue.registration(tokenAddress, 100n);
    expect(registration.registered).toBe(true);
    expect(registration.factory).toBe(POOLS_TRADE_LAUNCHPADS[0]);
    expect(registration.feeRecipient).toBe(feeSplitter);
    expect(registration.curveOrPool).toBe(
      POOLS_TRADE_DEPLOYMENTS.poolManager.address
    );
    expect(registration.poolId).toBe(poolId);
    expect(registration.phase).toBe("standard");
    expect(registration.registrationBlock).toBe("42");
    expect(registration.deployer).toBeNull();

    const launch = await venue.launchBlock(tokenAddress, 100n);
    expect(launch.block).toBe("42");
    expect(launch.transactionId).toBe(log.transactionHash);

    const fact = venue.launcherFact(registration, []);
    expect(fact.status).toBe("observed");
    expect(fact.launcher).toBe("pools_trade");
    expect(fact.poolId).toBe(poolId);

    const cohort = venue.cohortFact({
      registration,
      launchBlock: launch.block,
      launchTransaction: launch.transactionId,
      windowBlocks: 10,
      trades: [],
      note: null,
    });
    expect(cohort.status).toBe("observed");
    expect(cohort.basis).toBe("venue_events");
    expect(cohort.buyerCount).toBe(0);

    const exclusions = venue.exclusions(registration);
    expect(exclusions).toContain(POOLS_TRADE_DEPLOYMENTS.poolManager.address);
    expect(exclusions).toContain(feeSplitter);
  });

  it("detectLauncher selects pools_trade when verify passes and TokenLaunched hits", async () => {
    const base = poolsTradeLaunchVenue(
      stubClient({
        // SAFETY: decoded TokenLaunched fixture matches the venue's getLogs surface.
        getLogs: (async () =>
          await Promise.resolve([
            tokenLaunchedLog(5n),
          ])) as TradeEvmClient["getLogs"],
      })
    );
    const venue = {
      ...base,
      verifyDeployments: async () => {
        await Promise.resolve();
        return [];
      },
    };
    const found = await detectLauncher(
      [venue],
      "eip155:4663",
      tokenAddress,
      10n
    );
    expect(found?.id).toBe("pools_trade");
  });

  it("detectLauncher skips when deployments changed or stub never registers", async () => {
    const broken = poolsTradeLaunchVenue(
      stubClient({
        getCode: async () => await Promise.resolve(toHex(new Uint8Array([1]))),
        // SAFETY: decoded TokenLaunched fixture matches the venue's getLogs surface.
        getLogs: (async () =>
          await Promise.resolve([
            tokenLaunchedLog(5n),
          ])) as TradeEvmClient["getLogs"],
      })
    );
    expect(
      await detectLauncher([broken], "eip155:4663", tokenAddress, 10n)
    ).toBeNull();
    expect(
      await detectLauncher(
        [stubPoolsTradeLaunchVenue()],
        "eip155:4663",
        tokenAddress,
        10n
      )
    ).toBeNull();
  });
});
