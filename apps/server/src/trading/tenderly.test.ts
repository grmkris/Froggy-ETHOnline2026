import { expect, test } from "bun:test";

import { Redacted } from "effect";

import { tenderlySimulation } from "./tenderly";
import type { EvmSimulationRequest, TenderlyOptions } from "./tenderly";

const wallet = `0x${"1".repeat(40)}`;
const token = `0x${"2".repeat(40)}`;
const request: EvmSimulationRequest = {
  network: "eip155:8453",
  wallet,
  blockNumber: 123,
  transactions: [
    {
      kind: "evm",
      to: `0x${"3".repeat(40)}`,
      data: "0x12345678",
      value: "0",
      gasLimit: "100000",
      maxFeePerGas: "2",
      maxPriorityFeePerGas: "1",
      nonce: 1,
    },
  ],
  assets: [{ address: token, balance: "1000" }],
};
const response = {
  simulations: [
    {
      status: true,
      gas_used: 40_000,
      block_number: 123,
      trace: [
        {
          from: wallet,
          to: `0x${"3".repeat(40)}`,
          input: "0x12345678",
          output: "0x",
          trace_address: [],
        },
      ],
    },
    {
      status: true,
      gas_used: 20_000,
      block_number: 123,
      trace: [
        {
          from: wallet,
          to: token,
          input: `0x70a08231${wallet.slice(2).padStart(64, "0")}`,
          output: `0x${500n.toString(16).padStart(64, "0")}`,
          trace_address: [],
        },
      ],
    },
  ],
};
const options = (fixture: typeof response): TenderlyOptions => ({
  accessKey: Redacted.make("test-secret"),
  account: "test-account",
  project: "test-project",
  now: () => 100,
  outbound: {
    lookup: async () => await Promise.resolve(["93.184.216.34"]),
    fetch: Object.assign(
      async (_url: URL | Request | string, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("X-Access-Key")).toBe(
          "test-secret"
        );
        expect(init?.body).toContain('"overrides":null');
        return await Promise.resolve(Response.json(fixture));
      },
      { preconnect: fetch.preconnect }
    ),
  },
});

test("retains exact post-state token balances, pinned block and independent simulation marker", async () => {
  const results = await tenderlySimulation(options(response), request);
  expect(results).toHaveLength(1);
  expect(results[0]?.assetChanges).toEqual([
    { asset: token, before: "1000", after: "500" },
  ]);
  expect(results[0]?.provider).toBe("tenderly");
  expect(results[0]?.block).toBe("123");
  expect(results[0]?.stubbed).toBe(false);
});

test("a revert is a delivered failed simulation rather than success", async () => {
  const fixture = structuredClone(response);
  const [first] = fixture.simulations;
  if (first === undefined) {
    throw new Error("Missing fixture");
  }
  first.status = false;
  const results = await tenderlySimulation(options(fixture), request);
  expect(results[0]?.status).toBe("failed");
});

test("rejects mismatched blocks, call targets and incomplete state probes", async () => {
  const fixture = structuredClone(response);
  const [first] = fixture.simulations;
  if (first === undefined) {
    throw new Error("Missing fixture");
  }
  first.block_number = 124;
  expect(
    await tenderlySimulation(options(fixture), request).then(() => null, String)
  ).toContain("trade.simulation_mismatch");
  const truncated = { simulations: response.simulations.slice(0, 1) };
  expect(
    await tenderlySimulation(options(truncated), request).then(
      () => null,
      String
    )
  ).toContain("incomplete bundle");
});
