import { describe, expect, it } from "bun:test";

import { tradeResearchRefusal } from "@froggy/domain";
import type { TradeInput, TradeResearchPolicy } from "@froggy/domain";
import { Redacted } from "effect";
import { encodeAbiParameters, parseAbiParameters } from "viem";

import type { TradeEvmClient } from "./evm-chain";
import { stubUniswap } from "./uniswap";
import { uniswapExecution } from "./uniswap-execution";

const token = `0x${"11".repeat(20)}`;
const alice = `0x${"22".repeat(20)}`;
const bob = `0x${"33".repeat(20)}`;
const zero = "0x0000000000000000000000000000000000000000";
const now = 5_000_000;

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

const logs = [
  transferLog(zero, alice, 1000n, 2n),
  transferLog(zero, bob, 500n, 2n),
];

const stubClient = (headBlock = 10n): TradeEvmClient => {
  const partial = {
    getChainId: () => Promise.resolve(1),
    getBlock: () =>
      Promise.resolve({ number: headBlock, hash: `0x${"ef".repeat(32)}` }),
    getLogs: (filter: {
      readonly fromBlock: bigint;
      readonly toBlock: bigint;
      readonly args?: { readonly from?: string };
    }) =>
      Promise.resolve(
        logs.filter(
          (log) =>
            log.blockNumber >= filter.fromBlock &&
            log.blockNumber <= filter.toBlock &&
            (filter.args?.from === undefined || log.topics[1] === topic(zero))
        )
      ),
    readContract: () => Promise.resolve(1500n),
  };
  // SAFETY: the research path only reads chain id, head block, Transfer logs and totalSupply.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- PublicClient is too wide to stub without unknown.
  return partial as unknown as TradeEvmClient;
};

const backendFor = (client: TradeEvmClient) =>
  uniswapExecution({
    client,
    quotes: stubUniswap(),
    tenderly: {
      accessKey: Redacted.make("fixture"),
      account: "fixture",
      project: "fixture",
    },
    confirmations: 1,
    now: () => now,
  });
const backend = backendFor(stubClient());

const input: TradeInput = {
  network: "eip155:1",
  venue: "uniswap",
  action: "swap",
  wallet: `0x${"44".repeat(20)}`,
  tokenIn: `0x${"55".repeat(20)}`,
  tokenOut: token,
  amount: "100",
  position: null,
  slippageBps: 100,
  maxNativeFee: "10",
};

const policy = (maxTopHoldersBps: number): TradeResearchPolicy => ({
  requireTemplateMatch: false,
  forbidLaunchInsiders: false,
  insiderWindowBlocks: 600,
  maxTopHoldersBps,
  topHolderCount: 2,
});

describe("uniswapExecution research", () => {
  it("reconstructs the acquired token's holders from the route RPC and gates on the cap", async () => {
    const facts = await backend.research(input);
    expect(facts.stubbed).toBe(false);
    expect(facts.observedAt).toBe(now);
    expect(facts.address.toLowerCase()).toBe(token);
    expect(facts.launcher.launcher).toBe("unknown");
    expect(facts.template.status).toBe("not_applicable");
    expect(facts.holders.basis).toBe("reconstructed");
    expect(facts.holders.coverage).toBe("complete");
    expect(facts.holders.supplyReconciled).toBe(true);
    expect(facts.holders.topShareBps).toBe(10_000);
    expect(facts.screen.status).toBe("unavailable");
    expect(
      tradeResearchRefusal({ policy: policy(10_000), facts, now })
    ).toBeNull();
    expect(
      tradeResearchRefusal({ policy: policy(6000), facts, now })
    ).toContain("research_concentration");
  });

  it("reports partial coverage for a token older than the page budget, which fails the gate", async () => {
    const facts = await backendFor(stubClient(10_000_000n)).research(input);
    expect(facts.cohort.status).toBe("not_indexed");
    expect(facts.holders.coverage).toBe("partial");
    expect(
      tradeResearchRefusal({ policy: policy(10_000), facts, now })
    ).toStartWith("trade.research_");
  });

  it("refuses to research a native output", async () => {
    expect(
      await backend
        .research({ ...input, tokenOut: "native" })
        .then(() => null, String)
    ).toContain("trade.research_venue");
  });
});
