import { expect, test } from "bun:test";

import { minimumTradeOutput, Trade, TradeInput } from "@froggy/domain";
import { Schema } from "effect";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  isHex,
  parseAbi,
  parseAbiParameters,
} from "viem";
import type { Address, TransactionReceipt } from "viem";

import { PONS_NETWORK } from "./networks";
import { PONS_ABI, PONS_DEPLOYMENTS, ponsCurveQuote, ponsToken } from "./pons";
import type { PonsSnapshot } from "./pons";
import { ponsSettlementValues } from "./pons-receipt";
import { buildPonsTransactions, validatePonsStep } from "./pons-transactions";
import { stubTradeBackend } from "./stub-execution";

const TOKEN = "0x2222222222222222222222222222222222222222";
const CURVE = "0x3333333333333333333333333333333333333333";
const OWNER = "0x1111111111111111111111111111111111111111";
const input = Schema.decodeUnknownSync(TradeInput)({
  network: PONS_NETWORK,
  venue: "pons",
  action: "swap",
  wallet: OWNER,
  tokenIn: PONS_DEPLOYMENTS.quote.address,
  tokenOut: TOKEN,
  amount: "1000",
  position: null,
  slippageBps: 100,
  maxNativeFee: "20000000",
});
const state: PonsSnapshot = {
  block: 100n,
  quoteLiquidity: 10_000n,
  token: TOKEN,
  curve: CURVE,
  buy: true,
  phase: "curve",
  pool: {
    currency0: TOKEN,
    currency1: PONS_DEPLOYMENTS.quote.address,
    fee: 0,
    tickSpacing: 60,
    hooks: PONS_DEPLOYMENTS.hook.address,
  },
  quoteReserve: 10_000n,
  tokenReserve: 100_000n,
  realQuoteReserve: 10_000n,
  sellableTokens: 90_000n,
  feeBps: 100n,
  creatorTaxBps: 200n,
};
const context = {
  nonce: 7,
  tokenAllowance: 0n,
  maxFeePerGas: 2n,
  maxPriorityFeePerGas: 1n,
  expectedOutput: 2000n,
  now: 1000,
};
const fixture = async () => {
  const built = buildPonsTransactions(input, state, context);
  const proposal = await stubTradeBackend(() => context.now).prepare(input);
  const [template] = proposal.steps;
  if (template === undefined) {
    throw new Error("Missing fixture step");
  }
  const trade = Schema.decodeUnknownSync(Trade)({
    v: 1,
    events: [],
    id: "trd_01j00000000000000000000000",
    idempotencyKey: "pons-test",
    connectionId: null,
    createdAt: 1000,
    updatedAt: 1000,
    revision: 0,
    input,
    inputFingerprint: "a".repeat(64),
    status: "awaiting_approval",
    expectedOutput: built.expectedOutput,
    minimumOutput: built.minimumOutput,
    actualOutput: null,
    phase: built.phase,
    steps: built.transactions.map((tx) => ({
      ...template,
      ...tx,
      expiresAt: built.expiresAt,
    })),
    reservations: [],
    reservationState: "none",
    receiptId: "rct_01j00000000000000000000000",
    error: null,
    limitations: [],
    stubbed: true,
  });
  const step = trade.steps.at(-1);
  if (step === undefined) {
    throw new Error("Missing fixture swap");
  }
  return { trade, step };
};

test("Pons quotes charge curve fees once and reject unsupported pairs and exhausted exits", () => {
  expect(ponsCurveQuote(state, 1000n)).toBe(8842n);
  expect(ponsCurveQuote({ ...state, buy: false }, 1000n)).toBe(98n);
  expect(() => ponsCurveQuote({ ...state, sellableTokens: 1n }, 1000n)).toThrow(
    "partial_quote"
  );
  expect(() =>
    ponsCurveQuote({ ...state, buy: false, realQuoteReserve: 1n }, 1000n)
  ).toThrow("liquidity");
  expect(() => ponsToken({ ...input, tokenIn: OWNER })).toThrow("pons_route");
  expect(() => ponsToken({ ...input, network: "eip155:1" })).toThrow(
    "pons_route"
  );
});

test("Pons allowances reset nonzero approval and bound every nonce and native fee", () => {
  const built = buildPonsTransactions(input, state, {
    ...context,
    tokenAllowance: 1n,
  });
  expect(built.transactions.map((tx) => tx.payload.nonce)).toEqual([7, 8, 9]);
  const amounts = built.transactions.slice(0, 2).map((tx) => {
    if (!isHex(tx.payload.data)) {
      throw new Error("Invalid fixture");
    }
    const decoded = decodeFunctionData({
      abi: parseAbi([
        "function approve(address spender,uint256 amount) returns(bool)",
      ]),
      data: tx.payload.data,
    });
    expect(decoded.args[0]).toBe(CURVE);
    return decoded.args[1];
  });
  expect(amounts).toEqual([0n, 1000n]);
  expect(() =>
    buildPonsTransactions({ ...input, maxNativeFee: "1" }, state, context)
  ).toThrow("trade.gas");
});

test("Pons validates immutable recipients, phase and allowance before signing", async () => {
  const { trade, step } = await fixture();
  expect(() => {
    validatePonsStep(trade, step, state);
  }).not.toThrow();
  expect(() => {
    validatePonsStep(trade, step, { ...state, phase: "graduated" });
  }).toThrow("trade.phase");
  const { payload } = step;
  if (payload.kind !== "evm") {
    throw new Error("Invalid fixture");
  }
  expect(() => {
    validatePonsStep(
      trade,
      { ...step, payload: { ...payload, to: OWNER } },
      state
    );
  }).toThrow("trade.payload");
  expect(() => {
    validatePonsStep({ ...trade, minimumOutput: "1" }, step, state);
  }).toThrow("trade.payload");
  expect(() => {
    validatePonsStep(
      trade,
      { ...step, payload: { ...payload, value: "1" } },
      state
    );
  }).toThrow("trade.phase");
});

const TRANSFER = parseAbi([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
const log = (
  address: Address,
  topics: ReturnType<typeof encodeEventTopics>,
  data: `0x${string}`
): TransactionReceipt["logs"][number] => {
  const [signature, ...indexed] = topics;
  return {
    address,
    topics: [signature, ...indexed.filter((topic) => isHex(topic))],
    data,
    blockHash: `0x${"ab".repeat(32)}`,
    blockNumber: 100n,
    transactionHash: `0x${"cd".repeat(32)}`,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
  };
};
const transfer = (token: Address, from: Address, to: Address, amount: bigint) =>
  log(
    token,
    encodeEventTopics({
      abi: TRANSFER,
      eventName: "Transfer",
      args: { from, to },
    }),
    encodeAbiParameters(parseAbiParameters("uint256"), [amount])
  );
const receipt = (logs: TransactionReceipt["logs"]): TransactionReceipt => ({
  blockHash: `0x${"ab".repeat(32)}`,
  blockNumber: 100n,
  transactionHash: `0x${"cd".repeat(32)}`,
  transactionIndex: 0,
  from: OWNER,
  to: CURVE,
  contractAddress: null,
  cumulativeGasUsed: 100n,
  gasUsed: 100n,
  effectiveGasPrice: 1n,
  logs,
  logsBloom: "0x",
  status: "success",
  type: "eip1559",
});
const fill = (buyer: Address = OWNER) =>
  log(
    CURVE,
    encodeEventTopics({
      abi: PONS_ABI,
      eventName: "CurveBuy",
      args: { buyer, recipient: OWNER },
    }),
    encodeAbiParameters(parseAbiParameters("uint256,uint256,uint256,uint256"), [
      500n,
      1000n,
      0n,
      0n,
    ])
  );

test("Pons receipt nets a partial-fill refund and preserves the proportional output bound", async () => {
  const { trade, step } = await fixture();
  const logs = [
    transfer(getAddress(input.tokenIn), OWNER, CURVE, 1000n),
    transfer(getAddress(input.tokenIn), CURVE, OWNER, 500n),
    transfer(TOKEN, CURVE, OWNER, 1000n),
    fill(),
  ];
  const settled = ponsSettlementValues(trade, step, receipt(logs));
  expect(settled).toEqual({ output: "1000", actualInput: "500" });
  expect(minimumTradeOutput(trade, "500")).toBe(990n);
  expect(minimumTradeOutput({ ...trade, minimumOutput: "1999" }, "1")).toBe(2n);
  expect(minimumTradeOutput({ ...trade, phase: "graduated" }, "500")).toBe(
    1980n
  );
  expect(() =>
    ponsSettlementValues(trade, step, receipt(logs.slice(0, 3)))
  ).toThrow("trade.receipt");
  expect(() =>
    ponsSettlementValues(trade, step, receipt([...logs, fill()]))
  ).toThrow("trade.receipt");
  expect(() =>
    ponsSettlementValues(
      trade,
      step,
      receipt([...logs.slice(0, 3), fill(TOKEN)])
    )
  ).toThrow("trade.receipt");
  expect(() =>
    ponsSettlementValues({ ...trade, phase: "graduated" }, step, receipt(logs))
  ).toThrow("trade.receipt");
});
