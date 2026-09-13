import { Redacted, Result, Schema } from "effect";

import { boundedBytes, safeFetch } from "../outbound";
import type { OutboundOptions } from "../outbound";

const Envelope = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Int,
  result: Schema.optionalKey(Schema.Json),
  error: Schema.optionalKey(Schema.Struct({ code: Schema.Int })),
});
const LogRange = Schema.Struct({
  fromBlock: Schema.String.check(Schema.isPattern(/^0x[0-9a-f]+$/iu)),
  toBlock: Schema.String.check(Schema.isPattern(/^0x[0-9a-f]+$/iu)),
});

export class ResearchRpcError extends Error {
  readonly category: string;
  readonly method: string;
  readonly requestId: number;
  readonly code: number | null;
  constructor(
    category: string,
    method: string,
    requestId: number,
    code: number | null = null
  ) {
    super(
      `trade.rpc: ${method} ${category}${code === null ? "" : ` (${code})`}; request ${requestId}.`
    );
    this.name = "ResearchRpcError";
    this.category = category;
    this.method = method;
    this.requestId = requestId;
    this.code = code;
  }
}

const decodeRpcResponse = async (
  response: Response,
  method: string,
  id: number
): Promise<Schema.Json> => {
  if (!response.ok) {
    await response.body?.cancel();
    throw new ResearchRpcError("http", method, id, response.status);
  }
  let bytes: Uint8Array;
  try {
    bytes = await boundedBytes(response, 256_000);
  } catch (error) {
    throw new ResearchRpcError(
      error instanceof Error &&
        error.message === "Provider response exceeded the size limit."
        ? "response_limit"
        : "response_stream",
      method,
      id
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ResearchRpcError("invalid_json", method, id);
  }
  const decoded = Schema.decodeUnknownResult(Envelope)(raw);
  if (Result.isFailure(decoded) || decoded.success.id !== id) {
    throw new ResearchRpcError("invalid_envelope", method, id);
  }
  const envelope = decoded.success;
  if (envelope.error !== undefined) {
    throw new ResearchRpcError("provider", method, id, envelope.error.code);
  }
  if (envelope.result === undefined) {
    throw new ResearchRpcError("missing_result", method, id);
  }
  return envelope.result;
};

const RETRYABLE_READS = new Set([
  "eth_chainId",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getCode",
  "eth_getLogs",
  "eth_call",
  "eth_estimateGas",
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_feeHistory",
  "eth_maxPriorityFeePerGas",
  "eth_gasPrice",
]);

const retryable = (
  error: ResearchRpcError,
  method: string,
  retries: number
): boolean =>
  error.category === "http" &&
  (error.code === 429 || error.code === 503) &&
  RETRYABLE_READS.has(method) &&
  retries < 2;

/** Split large log ranges without increasing the per-response memory bound. */
export const boundedRpc = (options: {
  readonly endpoint: Redacted.Redacted;
  readonly outbound?: OutboundOptions;
}) => {
  let sequence = 0;
  return async (
    method: string,
    params: readonly Schema.Json[]
  ): Promise<Schema.Json> => {
    const deadline = AbortSignal.timeout(30_000);
    let requests = 0;
    const request = async (
      args: readonly Schema.Json[],
      retries = 0
    ): Promise<Schema.Json> => {
      sequence += 1;
      const id = sequence;
      requests += 1;
      if (requests > 32 || deadline.aborted) {
        throw new ResearchRpcError("request_budget", method, id);
      }
      try {
        let response: Response;
        try {
          response = await safeFetch(
            Redacted.value(options.endpoint),
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id,
                method,
                params: args,
              }),
              signal: deadline,
            },
            { ...options.outbound, maxRedirects: 0, timeoutMs: 15_000 }
          );
        } catch {
          throw new ResearchRpcError(
            deadline.aborted ? "timeout" : "transport",
            method,
            id
          );
        }
        return await decodeRpcResponse(response, method, id);
      } catch (error) {
        if (
          error instanceof ResearchRpcError &&
          retryable(error, method, retries)
        ) {
          await Bun.sleep(500 * (retries + 1));
          return await request(args, retries + 1);
        }

        if (
          !(error instanceof ResearchRpcError) ||
          method !== "eth_getLogs" ||
          !(
            error.category === "response_limit" ||
            (error.category === "provider" && error.code === -32_005)
          )
        ) {
          throw error;
        }
        const range = Schema.decodeUnknownResult(LogRange)(args[0]);
        const filter = Schema.decodeUnknownResult(
          Schema.Record(Schema.String, Schema.Json)
        )(args[0]);
        if (Result.isFailure(range) || Result.isFailure(filter)) {
          throw error;
        }
        const from = BigInt(range.success.fromBlock);
        const to = BigInt(range.success.toBlock);
        if (from >= to) {
          throw error;
        }
        const middle = (from + to) / 2n;
        const left = await request([
          { ...filter.success, toBlock: `0x${middle.toString(16)}` },
        ]);
        const right = await request([
          { ...filter.success, fromBlock: `0x${(middle + 1n).toString(16)}` },
        ]);
        const leftLogs = Schema.decodeUnknownSync(Schema.Array(Schema.Json))(
          left
        );
        const rightLogs = Schema.decodeUnknownSync(Schema.Array(Schema.Json))(
          right
        );
        const logs = [...leftLogs, ...rightLogs];
        if (logs.length > 8192) {
          throw new ResearchRpcError("log_budget", method, id);
        }
        return logs;
      }
    };
    return await request(params);
  };
};
