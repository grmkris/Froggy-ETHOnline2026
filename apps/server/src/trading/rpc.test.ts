import { describe, expect, it } from "bun:test";

import { RpcReadInput, RpcReadResult } from "@froggy/protocol";
import { Redacted, Schema } from "effect";

import { std } from "../std";
import { liveTradingRpc, preflightRpcRead, stubTradingRpc } from "./rpc";

const EVM = "eip155:8453";
const SOLANA = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
// Synthetic fixtures, never deployment identities or configured live endpoints.
const ADDRESS = "0x1111111111111111111111111111111111111111";
const HASH = `0x${"ab".repeat(32)}`;
const PUBLIC_KEY = "1".repeat(32);
const SIGNATURE = "1".repeat(64);
const GENESIS = `${SOLANA.slice(7)}${"1".repeat(11)}`;
const ENDPOINT = "https://rpc.example.test/credential-in-path";
const Call = Schema.Struct({
  id: Schema.Int,
  method: Schema.String,
  params: Schema.Array(Schema.Json),
});
const fixture = (
  respond: (
    call: typeof Call.Type
  ) => Schema.Json | Response | Promise<Schema.Json | Response>,
  network = EVM
) => {
  const calls: (typeof Call.Type)[] = [];
  const fetchImpl: typeof fetch = Object.assign(
    async (
      _input: URL | RequestInfo,
      init?: RequestInit
    ): Promise<Response> => {
      const call = Schema.decodeUnknownSync(Call)(
        JSON.parse(Schema.decodeUnknownSync(Schema.String)(init?.body))
      );
      calls.push(call);
      const response = await respond(call);
      return response instanceof Response
        ? response
        : Response.json({ jsonrpc: "2.0", id: call.id, result: response });
    },
    { preconnect: (): void => undefined }
  );
  return {
    calls,
    rpc: liveTradingRpc({
      endpoints: { [network]: Redacted.make(ENDPOINT) },
      now: () => 1234,
      outbound: {
        fetch: fetchImpl,
        lookup: async () => await Promise.resolve(["93.184.216.34"]),
      },
    }),
  };
};
const balance = (block = "latest") =>
  preflightRpcRead({
    network: EVM,
    call: { method: "eth_getBalance", params: [ADDRESS, block] },
  });
const account = (length = 16) =>
  preflightRpcRead({
    network: SOLANA,
    call: {
      method: "getAccountInfo",
      params: [
        PUBLIC_KEY,
        {
          commitment: "finalized",
          encoding: "base64",
          dataSlice: { offset: 0, length },
        },
      ],
    },
  });
const tokenAccounts = () =>
  preflightRpcRead({
    network: SOLANA,
    call: {
      method: "getTokenAccountsByOwner",
      params: [
        PUBLIC_KEY,
        { mint: PUBLIC_KEY },
        {
          commitment: "confirmed",
          encoding: "base64",
          dataSlice: { offset: 0, length: 165 },
        },
      ],
    },
  });
const signatureStatuses = () =>
  preflightRpcRead({
    network: SOLANA,
    call: {
      method: "getSignatureStatuses",
      params: [[SIGNATURE], { searchTransactionHistory: false }],
    },
  });
const receipt = () => ({
  blockHash: HASH,
  blockNumber: "0x2a",
  contractAddress: null,
  cumulativeGasUsed: "0x5208",
  from: ADDRESS,
  gasUsed: "0x5208",
  logs: [],
  status: "0x1",
  to: ADDRESS,
  transactionHash: HASH,
  transactionIndex: "0x0",
});

const rejectsWith = async (
  promise: Promise<RpcReadResult>,
  message: string
): Promise<void> => {
  try {
    await promise;
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain(
      message
    );
    return;
  }
  throw new Error(`Expected rejection containing ${message}`);
};

describe("RPC preflight", () => {
  it("keeps the MCP input schema an object", () => {
    const schema = std(RpcReadInput)["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });
    expect(schema["type"]).toBe("object");
  });

  it("refuses writes, scans, pending state, overrides, and network-method mismatches", () => {
    const invalid: unknown[] = [
      {
        network: EVM,
        call: { method: "eth_sendRawTransaction", params: ["0x00"] },
      },
      { network: EVM, call: { method: "eth_getLogs", params: [{}] } },
      {
        network: EVM,
        call: { method: "eth_getBalance", params: [ADDRESS, "pending"] },
      },
      {
        network: EVM,
        call: {
          method: "eth_call",
          params: [{ to: ADDRESS, data: "0x", value: "0x1" }, "latest"],
        },
      },
      {
        network: EVM,
        call: {
          method: "eth_call",
          params: [{ to: ADDRESS, data: "0x" }, "latest", {}],
        },
      },
      {
        network: EVM,
        call: {
          method: "eth_call",
          params: [{ to: ADDRESS, data: `0x${"00".repeat(4097)}` }, "latest"],
        },
      },
      {
        network: EVM,
        call: { method: "eth_blockNumber", params: [] },
        url: ENDPOINT,
      },
      {
        network: EVM,
        call: { method: "eth_blockNumber", params: [], surprise: true },
      },
      {
        network: EVM,
        call: { method: "getSlot", params: [{ commitment: "finalized" }] },
      },
      {
        network: SOLANA,
        call: { method: "getProgramAccounts", params: [PUBLIC_KEY] },
      },
      {
        network: SOLANA,
        call: { method: "simulateTransaction", params: ["AA=="] },
      },
      {
        network: SOLANA,
        call: {
          method: "getBalance",
          params: [PUBLIC_KEY, { commitment: "processed" }],
        },
      },
      {
        network: SOLANA,
        call: {
          method: "getAccountInfo",
          params: [PUBLIC_KEY, { commitment: "finalized", encoding: "base64" }],
        },
      },
      {
        network: SOLANA,
        call: {
          method: "getTokenAccountsByOwner",
          params: [
            PUBLIC_KEY,
            { programId: PUBLIC_KEY },
            {
              commitment: "finalized",
              encoding: "base64",
              dataSlice: { offset: 0, length: 10 },
            },
          ],
        },
      },
      {
        network: SOLANA,
        call: {
          method: "getSignatureStatuses",
          params: [[SIGNATURE], { searchTransactionHistory: true }],
        },
      },
      {
        network: SOLANA,
        call: {
          method: "getSignatureStatuses",
          params: [
            Array.from({ length: 21 }, () => SIGNATURE),
            { searchTransactionHistory: false },
          ],
        },
      },
    ];
    for (const input of invalid) {
      expect(() => preflightRpcRead(input)).toThrow();
      expect(() => Schema.decodeUnknownSync(RpcReadInput)(input)).toThrow();
    }
  });

  it("validates decoded base58 byte lengths and slice bounds", () => {
    expect(() =>
      preflightRpcRead({
        network: SOLANA,
        call: {
          method: "getBalance",
          params: ["1".repeat(33), { commitment: "confirmed" }],
        },
      })
    ).toThrow("32 bytes");
    expect(() =>
      preflightRpcRead({
        network: SOLANA,
        call: {
          method: "getSignatureStatuses",
          params: [["1".repeat(65)], { searchTransactionHistory: false }],
        },
      })
    ).toThrow("64 bytes");
    expect(() => account(1025)).toThrow();
    expect(() => account(-1)).toThrow();
  });
});

describe("Quicknode RPC reads", () => {
  it("confirms EVM chain identity once across concurrent reads and preserves an explicit block", async () => {
    const setup = fixture((call) =>
      call.method === "eth_chainId" ? "0x2105" : "0x123"
    );
    const results = await Promise.all([
      setup.rpc.read(balance("0x2a")),
      setup.rpc.read(balance("0x2a")),
    ]);
    expect(setup.calls.map((call) => call.method)).toEqual([
      "eth_chainId",
      "eth_getBalance",
      "eth_getBalance",
    ]);
    expect(results[0]).toMatchObject({
      v: 1,
      operation: "rpc_read",
      provider: "quicknode",
      result: "0x123",
      observedAt: 1234,
      stubbed: false,
      context: { blockNumber: "0x2a", blockHash: null },
    });
  });

  it("refuses a wrong EVM chain before the requested read", async () => {
    const setup = fixture(() => "0x1");
    await rejectsWith(setup.rpc.read(balance()), "does not match");
    expect(setup.calls.map((call) => call.method)).toEqual(["eth_chainId"]);
  });

  it("refuses missing endpoints without making a request", async () => {
    const setup = fixture(() => "0x2105");
    await rejectsWith(
      setup.rpc.read({ ...balance(), network: "eip155:1" }),
      "not configured"
    );
    expect(setup.calls).toHaveLength(0);
  });

  it("pins the call gas budget and does not claim a block hash from latest", async () => {
    const setup = fixture((call) =>
      call.method === "eth_chainId" ? "0x2105" : "0x0001"
    );
    const result = await setup.rpc.read(
      preflightRpcRead({
        network: EVM,
        call: {
          method: "eth_call",
          params: [{ to: ADDRESS, data: "0x1234" }, "latest"],
        },
      })
    );
    expect(setup.calls[1]?.params).toEqual([
      { to: ADDRESS, data: "0x1234", gas: "0x7a120" },
      "latest",
    ]);
    expect(result.context.blockNumber).toBeNull();
    expect(result.context.blockHash).toBeNull();
    expect(result.limitations.join(" ")).toContain("500,000 gas");
  });

  it("matches receipt identity and retains receipt block context", async () => {
    const input = preflightRpcRead({
      network: EVM,
      call: { method: "eth_getTransactionReceipt", params: [HASH] },
    });
    const good = fixture((call) =>
      call.method === "eth_chainId" ? "0x2105" : receipt()
    );
    const result = await good.rpc.read(input);
    expect(result.context).toMatchObject({
      blockNumber: "0x2a",
      blockHash: HASH,
    });
    const bad = fixture((call) =>
      call.method === "eth_chainId"
        ? "0x2105"
        : { ...receipt(), transactionHash: `0x${"cd".repeat(32)}` }
    );
    await rejectsWith(bad.rpc.read(input), "does not match");
  });

  it("requires the matching Solana genesis and preserves commitment and slot", async () => {
    const setup = fixture(
      (call) =>
        call.method === "getGenesisHash"
          ? GENESIS
          : { context: { slot: 456 }, value: 42 },
      SOLANA
    );
    const result = await setup.rpc.read(
      preflightRpcRead({
        network: SOLANA,
        call: {
          method: "getBalance",
          params: [PUBLIC_KEY, { commitment: "finalized" }],
        },
      })
    );
    expect(setup.calls.map((call) => call.method)).toEqual([
      "getGenesisHash",
      "getBalance",
    ]);
    expect(result.context).toMatchObject({
      slot: 456,
      commitment: "finalized",
    });
    const wrong = fixture(() => PUBLIC_KEY, SOLANA);
    await rejectsWith(wrong.rpc.read(account()), "does not match");
    expect(wrong.calls).toHaveLength(1);
  });

  it("limits account bytes and discards unsafe unused rent metadata", async () => {
    const resultValue = {
      context: { slot: 123 },
      value: {
        data: ["YWI=", "base64"],
        lamports: 1234,
        owner: PUBLIC_KEY,
        executable: false,
        rentEpoch: Number("18446744073709551615"),
      },
    };
    const setup = fixture(
      (call) => (call.method === "getGenesisHash" ? GENESIS : resultValue),
      SOLANA
    );
    const result = await setup.rpc.read(account(2));
    expect(result.result).toEqual({
      context: { slot: 123 },
      value: {
        data: ["YWI=", "base64"],
        lamports: 1234,
        owner: PUBLIC_KEY,
        executable: false,
      },
    });
    await rejectsWith(setup.rpc.read(account(1)), "bounded request");
    const unsafe = fixture(
      (call) =>
        call.method === "getGenesisHash"
          ? GENESIS
          : {
              ...resultValue,
              value: { ...resultValue.value, lamports: 9_007_199_254_740_992 },
            },
      SOLANA
    );
    await rejectsWith(unsafe.rpc.read(account(2)), "malformed");
  });

  it("bounds token account lists and signature status cardinality", async () => {
    const row = {
      pubkey: PUBLIC_KEY,
      account: {
        data: ["", "base64"],
        lamports: 1,
        owner: PUBLIC_KEY,
        executable: false,
      },
    };
    const large = fixture(
      (call) =>
        call.method === "getGenesisHash"
          ? GENESIS
          : {
              context: { slot: 123 },
              value: Array.from({ length: 21 }, () => row),
            },
      SOLANA
    );
    await rejectsWith(large.rpc.read(tokenAccounts()), "malformed");
    const short = fixture(
      (call) =>
        call.method === "getGenesisHash"
          ? GENESIS
          : { context: { slot: 123 }, value: [] },
      SOLANA
    );
    await rejectsWith(short.rpc.read(signatureStatuses()), "count");
    const cache = fixture(
      (call) =>
        call.method === "getGenesisHash"
          ? GENESIS
          : { context: { slot: 123 }, value: [null] },
      SOLANA
    );
    const result = await cache.rpc.read(signatureStatuses());
    expect(result.context.commitment).toBeNull();
    expect(result.limitations.join(" ")).toContain("Null is unknown");
  });

  it("rejects a mismatched envelope and oversized output without retrying", async () => {
    const wrongId = fixture((call) =>
      Response.json({ jsonrpc: "2.0", id: call.id + 1, result: "0x2105" })
    );
    await rejectsWith(wrongId.rpc.read(balance()), "envelope");
    expect(wrongId.calls).toHaveLength(1);
    const large = fixture((call) =>
      call.method === "eth_chainId" ? "0x2105" : `0x${"00".repeat(40_000)}`
    );
    await rejectsWith(large.rpc.read(balance()), "oversized");
    expect(large.calls).toHaveLength(2);
  });

  it("redacts provider errors, invalid payloads, transport errors, and redirect URLs", async () => {
    const providers = [
      fixture((call) =>
        Response.json({
          jsonrpc: "2.0",
          id: call.id,
          error: { code: -32_000, message: ENDPOINT, data: ENDPOINT },
        })
      ),
      fixture(() => new Response(ENDPOINT, { status: 502 })),
      fixture(() => new Response(ENDPOINT)),
      fixture(() => {
        throw new Error(ENDPOINT);
      }),
      fixture(() => Response.redirect(`${ENDPOINT}/redirect`, 302)),
    ];
    await Promise.all(
      providers.map(async (setup) => {
        let message = "";
        try {
          await setup.rpc.read(balance());
        } catch (error) {
          message = error instanceof Error ? error.message : String(error);
        }
        expect(message).not.toBe("");
        expect(message).not.toContain("credential-in-path");
        expect(message).not.toContain("rpc.example.test");
        expect(setup.calls).toHaveLength(1);
      })
    );
  });

  it("provides loud decoded fixtures for every allowed read", async () => {
    const calls: unknown[] = [
      balance(),
      account(),
      tokenAccounts(),
      signatureStatuses(),
      { network: EVM, call: { method: "eth_blockNumber", params: [] } },
      {
        network: EVM,
        call: { method: "eth_getCode", params: [ADDRESS, "finalized"] },
      },
      {
        network: EVM,
        call: {
          method: "eth_call",
          params: [{ to: ADDRESS, data: "0x" }, "latest"],
        },
      },
      {
        network: EVM,
        call: { method: "eth_getTransactionReceipt", params: [HASH] },
      },
      {
        network: SOLANA,
        call: { method: "getSlot", params: [{ commitment: "confirmed" }] },
      },
      {
        network: SOLANA,
        call: {
          method: "getBalance",
          params: [PUBLIC_KEY, { commitment: "confirmed" }],
        },
      },
    ];
    await Promise.all(
      calls.map(async (input) => {
        const result = Schema.decodeUnknownSync(RpcReadResult)(
          await stubTradingRpc().read(preflightRpcRead(input))
        );
        expect(result.stubbed).toBe(true);
        expect(result.limitations.join(" ")).toContain("DEMO fixture");
      })
    );
  });
});
