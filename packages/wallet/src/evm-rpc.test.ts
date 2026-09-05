import { describe, expect, test } from "bun:test";

import { Schema } from "effect";

import { evmRpc, EvmRpcError } from "./evm-rpc";
import type { RpcTransport } from "./evm-rpc";

const HASH = `0x${"ab".repeat(32)}`;

const RpcRequest = Schema.Struct({
  id: Schema.Finite,
  method: Schema.String,
  params: Schema.Array(Schema.String),
});
const readRequest = Schema.decodeUnknownSync(RpcRequest);

/** What a fake node may answer with: a quantity, a receipt, nothing, or an error. */
type Answer =
  | Error
  | number
  | string
  | null
  | {
      readonly blockNumber: string;
      readonly status: string;
      readonly transactionHash: string;
    };

/** A node that answers each method from a table, and records what it was asked. */
const node = (answers: Record<string, Answer>) => {
  const asked: { method: string; params: readonly string[] }[] = [];
  const transport: RpcTransport = async (_url, init) => {
    await Promise.resolve();
    const request = readRequest(JSON.parse(init.body));
    asked.push({ method: request.method, params: request.params });
    const answer = answers[request.method];
    if (answer instanceof Error) {
      return Response.json({
        error: { code: -32_000, message: answer.message },
        id: request.id,
        jsonrpc: "2.0",
      });
    }
    return Response.json({ id: request.id, jsonrpc: "2.0", result: answer });
  };
  return { asked, transport };
};

/** The message a promise rejected with, or null when it resolved. */
const failure = async <T>(work: Promise<T>): Promise<string | null> => {
  try {
    await work;
    return null;
  } catch (error) {
    return error instanceof Error ? `${error.name}: ${error.message}` : "?";
  }
};

describe("evmRpc", () => {
  test("decodes quantities and asks for the pending nonce", async () => {
    const { asked, transport } = node({
      eth_chainId: "0x14a34",
      eth_gasPrice: "0x5b8d80",
      eth_getTransactionCount: "0x7",
    });
    const rpc = evmRpc({ transport, url: "https://rpc.test" });

    expect(await rpc.chainId()).toBe(84_532);
    expect(await rpc.gasPrice()).toBe(6_000_000n);
    expect(await rpc.transactionCount("0xabc")).toBe(7);
    expect(asked.at(-1)?.params).toEqual(["0xabc", "pending"]);
  });

  test("reads a receipt, and a missing one as null", async () => {
    const { transport } = node({
      eth_getTransactionReceipt: {
        blockNumber: "0x10",
        status: "0x1",
        transactionHash: HASH,
      },
    });
    const rpc = evmRpc({ transport, url: "https://rpc.test" });

    expect(await rpc.transactionReceipt(HASH)).toEqual({
      blockNumber: 16,
      status: "success",
      transactionHash: HASH,
    });

    const empty = node({ eth_getTransactionReceipt: null });
    expect(
      await evmRpc({
        transport: empty.transport,
        url: "https://rpc.test",
      }).transactionReceipt(HASH)
    ).toBeNull();
  });

  test("a reverted status is not a success", async () => {
    const { transport } = node({
      eth_getTransactionReceipt: {
        blockNumber: "0x10",
        status: "0x0",
        transactionHash: HASH,
      },
    });
    const receipt = await evmRpc({
      transport,
      url: "https://rpc.test",
    }).transactionReceipt(HASH);

    expect(receipt?.status).toBe("reverted");
  });

  test("surfaces the node's error text under the method name", async () => {
    const { transport } = node({
      eth_sendRawTransaction: new Error("insufficient funds for gas"),
    });
    const rpc = evmRpc({ transport, url: "https://rpc.test" });

    expect(await failure(rpc.sendRawTransaction("0x02"))).toBe(
      "EvmRpcError: eth_sendRawTransaction: insufficient funds for gas"
    );
  });

  test("refuses a reply that is not a hex quantity", async () => {
    const { transport } = node({ eth_gasPrice: 42 });
    const rpc = evmRpc({ transport, url: "https://rpc.test" });

    expect(await failure(rpc.gasPrice())).toContain(EvmRpcError.name);
  });

  test("gives up waiting for a receipt at the deadline", async () => {
    const { transport } = node({ eth_getTransactionReceipt: null });
    const rpc = evmRpc({ transport, url: "https://rpc.test" });

    expect(
      await failure(rpc.waitForReceipt(HASH, { intervalMs: 1, timeoutMs: 5 }))
    ).toContain("no receipt before the deadline");
  });
});
