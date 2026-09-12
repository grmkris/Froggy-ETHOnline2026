import { expect, test } from "bun:test";

import { Redacted, Schema } from "effect";

import { tradeEvmClient } from "./evm-chain";
import { PONS_DEPLOYMENTS } from "./pons";
import { livePonsReports, stubPonsReports } from "./pons-report";

const TOKEN = "0x2222222222222222222222222222222222222222";
const BLOCK = {
  number: "0x64",
  hash: `0x${"11".repeat(32)}`,
  parentHash: `0x${"22".repeat(32)}`,
  timestamp: "0x64",
  nonce: "0x0000000000000000",
  difficulty: "0x0",
  gasLimit: "0x1c9c380",
  gasUsed: "0x0",
  miner: "0x0000000000000000000000000000000000000000",
  extraData: "0x",
  logsBloom: `0x${"00".repeat(256)}`,
  transactionsRoot: `0x${"33".repeat(32)}`,
  stateRoot: `0x${"44".repeat(32)}`,
  receiptsRoot: `0x${"55".repeat(32)}`,
  sha3Uncles: `0x${"66".repeat(32)}`,
  size: "0x0",
  transactions: [],
  uncles: [],
};

const RpcRequest = Schema.Struct({
  id: Schema.Int,
  method: Schema.String,
});

/** A Robinhood RPC that answers the head and hands back foreign runtime code. */
const rpc: typeof fetch = Object.assign(
  async (_input: URL | RequestInfo, init?: RequestInit) => {
    const body = Schema.decodeUnknownSync(Schema.String)(init?.body);
    const request = Schema.decodeUnknownSync(RpcRequest)(JSON.parse(body));
    const answer = (result: string | typeof BLOCK) =>
      Response.json({ jsonrpc: "2.0", id: request.id, result });
    if (request.method === "eth_chainId") {
      return await Promise.resolve(answer("0x1237"));
    }
    if (request.method === "eth_getBlockByNumber") {
      return await Promise.resolve(answer(BLOCK));
    }
    if (request.method === "eth_getCode") {
      return await Promise.resolve(answer("0xdeadbeef"));
    }
    throw new Error(`unexpected ${request.method}`);
  },
  { preconnect: (): void => undefined }
);

const refuse: typeof fetch = Object.assign(
  (): never => {
    throw new Error("no request should be made");
  },
  { preconnect: (): void => undefined }
);

const reader = () =>
  livePonsReports(
    tradeEvmClient({
      endpoint: Redacted.make("https://rpc.invalid/"),
      outbound: { fetch: rpc, allowPrivate: true },
    }),
    () => 1000
  );

test("a changed Pons dependency stops the read instead of answering through it", async () => {
  const report = await reader().read(TOKEN);
  expect(report.deployments).toBe("changed");
  expect(report.launch).toBeNull();
  expect(report.curve).toBeNull();
  expect(report.pool).toBeNull();
  expect(report.template).toEqual({ matches: null, hash: null });
  // Every reviewed dependency is foreign here, so all of them are named.
  expect([...report.changedDependencies].toSorted()).toEqual(
    Object.keys(PONS_DEPLOYMENTS).toSorted()
  );
  expect(report.notes.join(" ")).toContain("runtime hash");
});

test("the changed-dependency report still pins the block it looked at", async () => {
  const report = await reader().read(TOKEN);
  expect(report.block).toEqual({
    number: "100",
    hash: BLOCK.hash,
    timestamp: 100,
  });
  expect(report.stubbed).toBe(false);
});

test("the stub reports nothing rather than an empty launch", async () => {
  const report = await stubPonsReports(() => 5).read(TOKEN);
  expect(report.stubbed).toBe(true);
  expect(report.block).toBeNull();
  expect(report.launch).toBeNull();
  expect(report.template).toEqual({ matches: null, hash: null });
  expect(report.notes.join(" ")).toContain("No Robinhood RPC endpoint");
  expect(report.observedAt).toBe(5);
});

test("a malformed token address is refused before any request", () => {
  const client = livePonsReports(
    tradeEvmClient({
      endpoint: Redacted.make("https://rpc.invalid/"),
      outbound: { fetch: refuse, allowPrivate: true },
    }),
    () => 1000
  );
  expect(client.read("not-an-address")).rejects.toThrow();
});
