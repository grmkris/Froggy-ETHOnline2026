import { expect, test } from "bun:test";

import type { TradePayload } from "@froggy/domain";
import { Redacted, Schema } from "effect";
import { encodeFunctionData, parseAbi } from "viem";

import { tradeEvmClient } from "./evm-chain";
import {
  assertNativeFeeBudget,
  DATA_FEE_MARGIN,
  estimateDataFee,
  executionFeeCap,
  GAS_PRICE_ORACLE,
  isRollupNetwork,
} from "./rollup-fees";

type EvmPayload = Extract<TradePayload, { kind: "evm" }>;

const ADDRESS = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222";
const Call = Schema.Struct({
  id: Schema.Int,
  method: Schema.String,
  params: Schema.optionalKey(Schema.Array(Schema.Unknown)),
});

const payload = (overrides: Partial<EvmPayload> = {}): EvmPayload => ({
  kind: "evm",
  to: TARGET,
  data: "0xdeadbeef",
  value: "0",
  gasLimit: "100000",
  maxFeePerGas: "10",
  maxPriorityFeePerGas: "1",
  nonce: 1,
  ...overrides,
});

const fixture = (respond: (call: typeof Call.Type) => Schema.Json) => {
  const calls: (typeof Call.Type)[] = [];
  const fetchImpl: typeof fetch = Object.assign(
    async (_input: URL | RequestInfo, init?: RequestInit) => {
      const call = Schema.decodeUnknownSync(Call)(
        JSON.parse(Schema.decodeUnknownSync(Schema.String)(init?.body))
      );
      calls.push(call);
      return await Promise.resolve(
        Response.json({
          jsonrpc: "2.0",
          id: call.id,
          result: respond(call),
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

const getL1FeeSelector = encodeFunctionData({
  abi: parseAbi(["function getL1Fee(bytes _data) view returns (uint256)"]),
  functionName: "getL1Fee",
  args: ["0x"],
}).slice(0, 10);
const getOperatorFeeSelector = encodeFunctionData({
  abi: parseAbi([
    "function getOperatorFee(uint256 _gasUsed) view returns (uint256)",
  ]),
  functionName: "getOperatorFee",
  args: [0n],
}).slice(0, 10);

const oracleRespond =
  (l1Fee: bigint, operatorFee: bigint | null) =>
  (call: typeof Call.Type): Schema.Json => {
    if (call.method === "eth_chainId") {
      return "0x2105";
    }
    if (call.method !== "eth_call") {
      throw new Error(`Unexpected RPC ${call.method}`);
    }
    const [tx] = call.params ?? [];
    const request = Schema.decodeUnknownSync(
      Schema.Struct({ to: Schema.String, data: Schema.String })
    )(tx);
    expect(request.to.toLowerCase()).toBe(GAS_PRICE_ORACLE.toLowerCase());
    if (request.data.startsWith(getL1FeeSelector)) {
      return `0x${l1Fee.toString(16).padStart(64, "0")}`;
    }
    if (request.data.startsWith(getOperatorFeeSelector)) {
      if (operatorFee === null) {
        throw new Error("operator fee unavailable");
      }
      return `0x${operatorFee.toString(16).padStart(64, "0")}`;
    }
    throw new Error(`Unexpected calldata ${request.data.slice(0, 10)}`);
  };

test("only Base and Base Sepolia are rollup networks", () => {
  expect(isRollupNetwork("eip155:8453")).toBe(true);
  expect(isRollupNetwork("eip155:84532")).toBe(true);
  expect(isRollupNetwork("eip155:1")).toBe(false);
  expect(isRollupNetwork("eip155:4663")).toBe(false);
});

test("execution fee cap is the sum of gasLimit × maxFeePerGas", () => {
  expect(
    executionFeeCap([payload(), payload({ gasLimit: "50", maxFeePerGas: "3" })])
  ).toBe(1_000_000n + 150n);
});

test("non-rollup networks report a zero data fee without calling the oracle", async () => {
  const setup = fixture(() => {
    throw new Error("Unexpected RPC");
  });
  expect(
    await estimateDataFee(setup.client, "eip155:1", ADDRESS, payload())
  ).toBe(0n);
  expect(setup.calls).toEqual([]);
});

test("rollup data fee is L1 fee plus operator fee from the pinned oracle", async () => {
  const setup = fixture(oracleRespond(100n, 7n));
  expect(
    await estimateDataFee(setup.client, "eip155:8453", ADDRESS, payload())
  ).toBe(107n);
  expect(setup.calls.some((call) => call.method === "eth_call")).toBe(true);
});

test("a missing operator fee method is treated as zero, not a hard failure", async () => {
  const selective = fixture((call) => {
    if (call.method === "eth_chainId") {
      return "0x2105";
    }
    if (call.method !== "eth_call") {
      throw new Error(`Unexpected RPC ${call.method}`);
    }
    const [tx] = call.params ?? [];
    const request = Schema.decodeUnknownSync(
      Schema.Struct({ to: Schema.String, data: Schema.String })
    )(tx);
    if (request.data.startsWith(getL1FeeSelector)) {
      return `0x${50n.toString(16).padStart(64, "0")}`;
    }
    // Invalid result: operatorFeeFor must catch and treat as zero.
    return null;
  });
  expect(
    await estimateDataFee(selective.client, "eip155:8453", ADDRESS, payload())
  ).toBe(50n);
});

test("oracle failure on a rollup fails closed", async () => {
  const setup = fixture(() => {
    throw new Error("oracle down");
  });
  expect(
    await estimateDataFee(setup.client, "eip155:8453", ADDRESS, payload()).then(
      () => null,
      String
    )
  ).toContain("trade.fee_bound");
});

test("assertNativeFeeBudget refuses when margined data fees exceed the allowance", async () => {
  const setup = fixture(oracleRespond(100n, 0n));
  const entry = payload({ gasLimit: "10", maxFeePerGas: "1" });
  // execution = 10, data = 100, margin×data = 200 → total 210 > 100
  expect(
    await assertNativeFeeBudget({
      client: setup.client,
      network: "eip155:8453",
      wallet: ADDRESS,
      payloads: [entry],
      maxNativeFee: "100",
    }).then(() => null, String)
  ).toContain("trade.fee_bound");
  expect(DATA_FEE_MARGIN).toBe(2n);
});

test("assertNativeFeeBudget passes when the budget covers execution and margined data fees", async () => {
  const setup = fixture(oracleRespond(10n, 5n));
  const entry = payload({ gasLimit: "100", maxFeePerGas: "2" });
  // execution = 200, data = 15, margin×data = 30 → total 230
  await assertNativeFeeBudget({
    client: setup.client,
    network: "eip155:8453",
    wallet: ADDRESS,
    payloads: [entry],
    maxNativeFee: "230",
  });
});

test("spent fees reduce the remaining budget before the estimate", async () => {
  const setup = fixture(oracleRespond(0n, 0n));
  const entry = payload({ gasLimit: "100", maxFeePerGas: "1" });
  expect(
    await assertNativeFeeBudget({
      client: setup.client,
      network: "eip155:1",
      wallet: ADDRESS,
      payloads: [entry],
      maxNativeFee: "150",
      spent: 60n,
    }).then(() => null, String)
  ).toContain("trade.fee_bound");
});
