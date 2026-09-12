import { expect, test } from "bun:test";

import { Trade } from "@froggy/domain";
import { Redacted, Schema } from "effect";

import {
  assertTradeNetwork,
  confirmedTradeReceipt,
  tradeEvmClient,
} from "./evm-chain";
import { PONS_NETWORK } from "./networks";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222";
const HASH = `0x${"ab".repeat(32)}`;
const BLOCK = `0x${"cd".repeat(32)}`;
const Call = Schema.Struct({ id: Schema.Int, method: Schema.String });
const fixture = (respond: (method: string) => Schema.Json) => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = Object.assign(
    async (_input: URL | RequestInfo, init?: RequestInit) => {
      const call = Schema.decodeUnknownSync(Call)(
        JSON.parse(Schema.decodeUnknownSync(Schema.String)(init?.body))
      );
      calls.push(call.method);
      return await Promise.resolve(
        Response.json({
          jsonrpc: "2.0",
          id: call.id,
          result: respond(call.method),
        })
      );
    },
    { preconnect: (): void => undefined }
  );
  return {
    calls,
    client: tradeEvmClient({
      endpoint: Redacted.make("https://rpc.example.test/secret"),
      outbound: {
        fetch: fetchImpl,
        lookup: async () => await Promise.resolve(["93.184.216.34"]),
      },
    }),
  };
};
const trade = Schema.decodeUnknownSync(Trade)({
  v: 1,
  events: [],
  id: "trd_01j00000000000000000000000",
  idempotencyKey: "receipt",
  connectionId: null,
  createdAt: 1,
  updatedAt: 1,
  revision: 1,
  input: {
    network: "eip155:8453",
    venue: "uniswap",
    action: "swap",
    wallet: ADDRESS,
    tokenIn: TARGET,
    tokenOut: ADDRESS,
    amount: "100",
    position: null,
    slippageBps: 100,
    maxNativeFee: "10000000",
  },
  inputFingerprint: "a".repeat(64),
  status: "executing",
  expectedOutput: "20",
  minimumOutput: "19",
  actualOutput: null,
  phase: "standard",
  reservations: [],
  reservationState: "held",
  receiptId: "rct_01j00000000000000000000000",
  error: null,
  limitations: [],
  stubbed: false,
  steps: [
    {
      id: "tst_01j00000000000000000000000",
      kind: "swap",
      description: "Test",
      payload: {
        kind: "evm",
        to: TARGET,
        data: "0x",
        value: "0",
        gasLimit: "50000",
        maxFeePerGas: "20",
        maxPriorityFeePerGas: "1",
        nonce: 7,
      },
      fingerprint: "b".repeat(64),
      expiresAt: 100,
      simulation: {
        status: "passed",
        provider: "tenderly",
        observedAt: 1,
        block: "10",
        gasUnits: "1",
        assetChanges: [],
        error: null,
        stubbed: false,
      },
      status: "submitted",
      approvalId: "apr_01j00000000000000000000000",
      authorizedAt: 1,
      ruleId: null,
      transactionId: HASH,
      signedPayload: "0x1234",
      submittedAt: 1,
      confirmedAt: null,
      actualNativeFee: null,
      error: null,
    },
  ],
});
const [step] = trade.steps;
if (step === undefined) {
  throw new Error("Missing fixture step");
}
const receipt = () => ({
  transactionHash: HASH,
  from: ADDRESS,
  to: TARGET,
  blockHash: BLOCK,
  blockNumber: "0xa",
  cumulativeGasUsed: "0x5208",
  gasUsed: "0x5208",
  effectiveGasPrice: "0x2",
  logs: [],
  status: "0x1",
  transactionIndex: "0x0",
  type: "0x2",
  contractAddress: null,
  l1Fee: "0x64",
});
const responder =
  (overrides: Partial<ReturnType<typeof receipt>> = {}, blockHash = BLOCK) =>
  (method: string): Schema.Json => {
    switch (method) {
      case "eth_chainId": {
        return "0x2105";
      }
      case "eth_getTransactionReceipt": {
        return { ...receipt(), ...overrides };
      }
      case "eth_getBlockByNumber": {
        return { hash: blockHash, number: "0xa", transactions: [] };
      }
      case "eth_blockNumber": {
        return "0xb";
      }
      default: {
        throw new Error("Unexpected RPC");
      }
    }
  };

test("chain mismatch prevents execution reads", async () => {
  const setup = fixture(() => "0x1");
  expect(
    await assertTradeNetwork(setup.client, "eip155:8453").then(
      () => null,
      String
    )
  ).toContain("another network");
  expect(setup.calls).toEqual(["eth_chainId"]);
});

test("canonical confirmed receipts include Base data fees", async () => {
  const setup = fixture(responder());
  expect(
    await confirmedTradeReceipt(setup.client, trade, step, 2, 123)
  ).toEqual({
    state: "confirmed",
    nativeFee: "42100",
    output: "0",
    at: 123,
  });
});

test("reorganization and insufficient confirmations retain pending state", async () => {
  const reorganized = fixture(responder({}, HASH));
  expect(
    await confirmedTradeReceipt(reorganized.client, trade, step, 2, 123)
  ).toEqual({ state: "pending" });
  const early = fixture(responder());
  expect(
    await confirmedTradeReceipt(early.client, trade, step, 3, 123)
  ).toEqual({ state: "pending" });
});

test("mismatched and malformed receipts cannot settle a reservation", async () => {
  const wrong = fixture(responder({ from: TARGET }));
  expect(
    await confirmedTradeReceipt(wrong.client, trade, step, 2, 123).then(
      () => null,
      String
    )
  ).toContain("identity");
  const malformed = fixture(responder({ status: "0x7" }));
  expect(
    await confirmedTradeReceipt(malformed.client, trade, step, 2, 123).then(
      () => null,
      String
    )
  ).not.toBeNull();
});

test("an absent receipt is pending rather than a provider failure", async () => {
  const setup = fixture((method) =>
    method === "eth_getTransactionReceipt" ? null : "0x2105"
  );
  expect(
    await confirmedTradeReceipt(setup.client, trade, step, 2, 123)
  ).toEqual({ state: "pending" });
});

test("Robinhood Nitro includes parent gas in gasUsed without double charging l1Fee", async () => {
  const pons = Schema.decodeUnknownSync(Trade)({
    ...trade,
    input: { ...trade.input, network: PONS_NETWORK, venue: "pons" },
    phase: "curve",
  });
  const base = responder();
  const setup = fixture((method) => {
    if (method === "eth_chainId") {
      return "0x1237";
    }
    if (method === "eth_getTransactionReceipt") {
      return { ...receipt(), gasUsedForL1: "0x100" };
    }
    return base(method);
  });
  expect(await confirmedTradeReceipt(setup.client, pons, step, 2, 123)).toEqual(
    { state: "confirmed", nativeFee: "42000", output: "0", at: 123 }
  );
});

test("Robinhood receipts require consistent parent gas evidence", async () => {
  const pons = Schema.decodeUnknownSync(Trade)({
    ...trade,
    input: { ...trade.input, network: PONS_NETWORK, venue: "pons" },
    phase: "curve",
  });
  await Promise.all(
    [{}, { gasUsedForL1: "0xffff" }].map(async (extra) => {
      const base = responder();
      const setup = fixture((method) => {
        if (method === "eth_chainId") {
          return "0x1237";
        }
        if (method === "eth_getTransactionReceipt") {
          return { ...receipt(), ...extra };
        }
        return base(method);
      });
      expect(
        await confirmedTradeReceipt(setup.client, pons, step, 2, 123).then(
          () => null,
          String
        )
      ).not.toBeNull();
    })
  );
});
