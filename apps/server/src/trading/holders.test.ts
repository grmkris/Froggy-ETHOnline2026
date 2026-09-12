import { describe, expect, it } from "bun:test";

import type { TradingAddress } from "@froggy/domain";
import { encodeAbiParameters, parseAbiParameters, toHex } from "viem";

import type { TradeEvmClient } from "./evm-chain";
import { reconstructHolders } from "./holders";

// SAFETY: fixed 20-byte hex literals used as TradingAddress test fixtures.
const token = `0x${"11".repeat(20)}` as TradingAddress;
const alice = `0x${"22".repeat(20)}`;
const bob = `0x${"33".repeat(20)}`;
// SAFETY: fixed 20-byte hex literal used as TradingAddress test fixture.
const curve = `0x${"44".repeat(20)}` as TradingAddress;
const zero = "0x0000000000000000000000000000000000000000";

const topic = (address: string) =>
  // SAFETY: padded address topic is a valid 32-byte log topic hex string.
  `0x${address.slice(2).toLowerCase().padStart(64, "0")}` as `0x${string}`;

const transferLog = (
  from: string,
  to: string,
  value: bigint,
  block: bigint
) => ({
  address: token,
  blockHash: `0x${"ab".repeat(32)}`,
  blockNumber: block,
  data: encodeAbiParameters(parseAbiParameters("uint256"), [value]),
  logIndex: 0,
  removed: false,
  // SAFETY: Transfer log topics are a signature hash plus two indexed address topics.
  topics: [
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    topic(from),
    topic(to),
  ] as [`0x${string}`, ...`0x${string}`[]],
  transactionHash: `0x${"cd".repeat(32)}`,
  transactionIndex: 0,
});

const stubEvmClient = (partial: {
  readonly getLogs: TradeEvmClient["getLogs"];
  readonly readContract: TradeEvmClient["readContract"];
}): TradeEvmClient =>
  // SAFETY: reconstructHolders only calls getLogs and readContract on this stub.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- PublicClient is too wide to stub without unknown.
  partial as unknown as TradeEvmClient;

describe("reconstructHolders", () => {
  it("sums Transfer deltas, excludes custody, and reconciles totalSupply", async () => {
    const logs = [
      transferLog(zero, alice, 1000n, 1n),
      transferLog(zero, bob, 500n, 1n),
      transferLog(zero, curve, 200n, 1n),
      transferLog(alice, bob, 100n, 2n),
    ];
    const client = stubEvmClient({
      // SAFETY: synthetic Transfer fixtures match the getLogs surface reconstructHolders reads.
      getLogs: (() => Promise.resolve(logs)) as TradeEvmClient["getLogs"],
      // SAFETY: totalSupply fixture is a bigint matching the ERC-20 view return.
      readContract: (() =>
        Promise.resolve(1700n)) as TradeEvmClient["readContract"],
    });
    const fact = await reconstructHolders({
      client,
      token,
      fromBlock: 1n,
      toBlock: 2n,
      pageBudget: 5,
      topHolderCount: 10,
      exclusions: [curve],
      sellableUnits: 1500n,
    });
    expect(fact.status).toBe("observed");
    expect(fact.basis).toBe("reconstructed");
    expect(fact.coverage).toBe("complete");
    expect(fact.supplyReconciled).toBe(true);
    expect(fact.holdersCounted).toBe(2);
    expect(fact.topShareBps).toBe(10_000);
    expect(fact.denominator).toBe("sellable");
    expect(fact.note).toBeNull();
  });

  it("marks partial coverage when the page budget stops the scan", async () => {
    const client = stubEvmClient({
      // SAFETY: synthetic Transfer fixtures match the getLogs surface reconstructHolders reads.
      getLogs: (() =>
        Promise.resolve(
          Array.from({ length: 1001 }, (_, index) =>
            transferLog(zero, alice, 1n, BigInt(index + 1))
          )
        )) as TradeEvmClient["getLogs"],
      // SAFETY: totalSupply fixture is a bigint matching the ERC-20 view return.
      readContract: (() =>
        Promise.resolve(1001n)) as TradeEvmClient["readContract"],
    });
    const fact = await reconstructHolders({
      client,
      token,
      fromBlock: 1n,
      toBlock: 20_000n,
      pageBudget: 1,
      topHolderCount: 5,
      exclusions: [],
      sellableUnits: null,
    });
    expect(fact.coverage).toBe("partial");
    expect(fact.supplyReconciled).toBe(false);
    expect(fact.note).toContain("more history unread");
  });

  it("reports an unreconciled supply mismatch without inventing a number", async () => {
    const client = stubEvmClient({
      // SAFETY: synthetic Transfer fixtures match the getLogs surface reconstructHolders reads.
      getLogs: (() =>
        Promise.resolve([
          transferLog(zero, alice, 100n, 1n),
        ])) as TradeEvmClient["getLogs"],
      // SAFETY: totalSupply fixture is a bigint matching the ERC-20 view return.
      readContract: (() =>
        Promise.resolve(999n)) as TradeEvmClient["readContract"],
    });
    const fact = await reconstructHolders({
      client,
      token,
      fromBlock: 1n,
      toBlock: 1n,
      pageBudget: 5,
      topHolderCount: 5,
      exclusions: [],
      sellableUnits: null,
    });
    expect(fact.supplyReconciled).toBe(false);
    expect(fact.note).toContain("does not match totalSupply");
    expect(toHex(100n)).toBeTypeOf("string");
  });
});
