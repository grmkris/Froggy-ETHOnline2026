/**
 * The smallest JSON-RPC client that can broadcast a signed transaction.
 *
 * Six methods, every reply decoded before use. This exists instead of a
 * library because the only thing the top-up needs from the chain is a nonce,
 * a fee, a broadcast and a receipt — and because a reply from a public RPC
 * endpoint is somebody else's bytes until a schema says otherwise.
 */

import { Schema } from "effect";

/** The endpoint refused, timed out, or answered something that was not JSON-RPC. */
export class EvmRpcError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "EvmRpcError";
  }
}

const Hex = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^0x[\da-f]*$/iu, { message: "Expected a 0x hex string" })
  )
);

const RpcResponse = Schema.Struct({
  error: Schema.optional(
    Schema.Struct({ code: Schema.Finite, message: Schema.String })
  ),
  result: Schema.optional(Schema.Unknown),
});
const decodeResponse = Schema.decodeUnknownResult(RpcResponse);

const RpcReceipt = Schema.NullOr(
  Schema.Struct({
    blockNumber: Hex,
    status: Hex,
    transactionHash: Hex,
  })
);

export interface EvmTransactionReceipt {
  readonly blockNumber: number;
  /** `success` is status `0x1`; anything else is a revert. */
  readonly status: "reverted" | "success";
  readonly transactionHash: string;
}

export interface EvmRpc {
  /** `eth_call` against `to` with `data`, at the latest block; the raw hex answer. */
  readonly call: (to: string, data: string) => Promise<string>;
  readonly chainId: () => Promise<number>;
  readonly gasPrice: () => Promise<bigint>;
  readonly maxPriorityFeePerGas: () => Promise<bigint>;
  /** Returns the transaction hash. */
  readonly sendRawTransaction: (signed: string) => Promise<string>;
  /** The pending nonce for this address. */
  readonly transactionCount: (address: string) => Promise<number>;
  readonly transactionReceipt: (
    hash: string
  ) => Promise<EvmTransactionReceipt | null>;
  /** Polls until the receipt exists or the deadline passes. */
  readonly waitForReceipt: (
    hash: string,
    options?: { readonly intervalMs?: number; readonly timeoutMs?: number }
  ) => Promise<EvmTransactionReceipt>;
}

/** The one request shape this client sends. Injected in tests. */
export type RpcTransport = (
  url: string,
  init: {
    readonly body: string;
    readonly headers: { readonly "content-type": "application/json" };
    readonly method: "POST";
    readonly signal: AbortSignal;
  }
) => Promise<Response>;

export interface EvmRpcOptions {
  readonly timeoutMs?: number;
  readonly transport?: RpcTransport;
  readonly url: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_MS = 2000;
const DEFAULT_WAIT_MS = 90_000;

const overFetch: RpcTransport = async (url, init) => await fetch(url, init);

/** `0x` alone is how some nodes spell zero. */
const toBigInt = (hex: string): bigint => BigInt(hex === "0x" ? "0x0" : hex);

export const evmRpc = (options: EvmRpcOptions): EvmRpc => {
  const transport = options.transport ?? overFetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let nextId = 0;

  /** One round trip, with the result parsed against `codec` before it leaves. */
  const call = async <T>(
    method: string,
    params: readonly (string | { readonly [key: string]: string })[],
    codec: Schema.Codec<T>
  ): Promise<T> => {
    nextId += 1;
    let response: Response;
    try {
      response = await transport(options.url, {
        body: JSON.stringify({ id: nextId, jsonrpc: "2.0", method, params }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new EvmRpcError(
        `${method}: ${error instanceof Error ? error.message : "request failed"}`
      );
    }
    if (!response.ok) {
      throw new EvmRpcError(
        `${method}: the endpoint answered ${response.status}`
      );
    }
    const envelope = decodeResponse(await response.json());
    if (envelope._tag === "Failure") {
      throw new EvmRpcError(`${method}: the reply was not JSON-RPC`);
    }
    const { error, result } = envelope.success;
    if (error !== undefined) {
      throw new EvmRpcError(`${method}: ${error.message}`);
    }
    const decoded = Schema.decodeUnknownResult(codec)(result);
    if (decoded._tag === "Failure") {
      throw new EvmRpcError(`${method}: the reply had an unexpected shape`);
    }
    return decoded.success;
  };

  const quantity = async (
    method: string,
    params: readonly string[]
  ): Promise<bigint> => toBigInt(await call(method, params, Hex));

  const transactionReceipt = async (
    hash: string
  ): Promise<EvmTransactionReceipt | null> => {
    const receipt = await call("eth_getTransactionReceipt", [hash], RpcReceipt);
    if (receipt === null) {
      return null;
    }
    return {
      blockNumber: Number(toBigInt(receipt.blockNumber)),
      status: toBigInt(receipt.status) === 1n ? "success" : "reverted",
      transactionHash: receipt.transactionHash,
    };
  };

  return {
    call: async (to, data) =>
      await call("eth_call", [{ data, to }, "latest"], Hex),
    chainId: async () => Number(await quantity("eth_chainId", [])),
    gasPrice: async () => await quantity("eth_gasPrice", []),
    maxPriorityFeePerGas: async () =>
      await quantity("eth_maxPriorityFeePerGas", []),
    sendRawTransaction: async (signed) =>
      await call("eth_sendRawTransaction", [signed], Hex),
    transactionCount: async (address) =>
      Number(await quantity("eth_getTransactionCount", [address, "pending"])),
    transactionReceipt,
    waitForReceipt: async (hash, waitOptions) => {
      const deadline = Date.now() + (waitOptions?.timeoutMs ?? DEFAULT_WAIT_MS);
      const interval = waitOptions?.intervalMs ?? DEFAULT_POLL_MS;
      const poll = async (): Promise<EvmTransactionReceipt> => {
        const receipt = await transactionReceipt(hash);
        if (receipt !== null) {
          return receipt;
        }
        if (Date.now() >= deadline) {
          throw new EvmRpcError(
            `${hash} was broadcast but had no receipt before the deadline`
          );
        }
        await Bun.sleep(interval);
        return await poll();
      };
      return await poll();
    },
  };
};
