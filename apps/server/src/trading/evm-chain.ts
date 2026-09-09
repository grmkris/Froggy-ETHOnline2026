import type { Trade, TradeStep } from "@froggy/domain";
import { Redacted, Schema } from "effect";
import type { TransactionReceipt } from "viem";
import {
  createPublicClient,
  custom,
  decodeEventLog,
  getAddress,
  isHex,
  parseAbi,
  TransactionReceiptNotFoundError,
} from "viem";

import { boundedBytes, safeFetch } from "../outbound";
import type { OutboundOptions } from "../outbound";

const Request = Schema.Struct({
  method: Schema.String,
  params: Schema.optionalKey(Schema.Array(Schema.Json)),
});
const Envelope = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Int,
  result: Schema.optionalKey(Schema.Json),
  error: Schema.optionalKey(Schema.Struct({ code: Schema.Int })),
});
const TOKEN = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

/** Private execution transport: never exposed as a generic agent RPC tool. */
export const tradeEvmClient = (options: {
  readonly endpoint: Redacted.Redacted;
  readonly outbound?: OutboundOptions;
}) => {
  let id = 0;
  return createPublicClient({
    transport: custom(
      {
        request: async (request) => {
          const { method, params } = Schema.decodeUnknownSync(Request)(request);
          id += 1;
          const requestId = id;
          try {
            const response = await safeFetch(
              Redacted.value(options.endpoint),
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: requestId,
                  method,
                  params: params ?? [],
                }),
              },
              { ...options.outbound, maxRedirects: 0, timeoutMs: 15_000 }
            );
            if (!response.ok) {
              await response.body?.cancel();
              throw new Error("RPC unavailable");
            }
            const body: unknown = JSON.parse(
              new TextDecoder().decode(await boundedBytes(response, 256_000))
            );
            const envelope = Schema.decodeUnknownSync(Envelope)(body);
            if (
              envelope.id !== requestId ||
              envelope.error !== undefined ||
              envelope.result === undefined
            ) {
              throw new Error("Invalid RPC response");
            }
            return envelope.result;
          } catch {
            throw new Error(
              "trade.rpc: execution RPC failed or returned an invalid response."
            );
          }
        },
      },
      { retryCount: 0 }
    ),
  });
};
export type TradeEvmClient = ReturnType<typeof tradeEvmClient>;

export const assertTradeNetwork = async (
  client: TradeEvmClient,
  network: string
): Promise<void> => {
  if (
    !network.startsWith("eip155:") ||
    (await client.getChainId()) !== Number(network.slice(7))
  ) {
    throw new Error("trade.network: execution RPC belongs to another network.");
  }
};

export const tradeTokenBalance = async (
  client: TradeEvmClient,
  token: string,
  wallet: string,
  blockNumber: bigint
): Promise<bigint> =>
  await client.readContract({
    address: getAddress(token),
    abi: TOKEN,
    functionName: "balanceOf",
    args: [getAddress(wallet)],
    blockNumber,
  });

export const tradeAllowance = async (
  client: TradeEvmClient,
  token: string,
  wallet: string,
  spender: string,
  blockNumber: bigint
): Promise<bigint> =>
  await client.readContract({
    address: getAddress(token),
    abi: TOKEN,
    functionName: "allowance",
    args: [getAddress(wallet), getAddress(spender)],
    blockNumber,
  });

/** Recheck nonce and ability to execute without modifying the immutable transaction. */
export const checkTradeBeforeSigning = async (
  client: TradeEvmClient,
  trade: Trade,
  step: TradeStep
): Promise<void> => {
  await assertTradeNetwork(client, trade.input.network);
  const { payload } = step;
  if (payload.kind !== "evm" || !isHex(payload.data)) {
    throw new Error("trade.payload: expected an EVM transaction.");
  }
  const nonce = await client.getTransactionCount({
    address: getAddress(trade.input.wallet),
    blockTag: "pending",
  });
  if (nonce !== payload.nonce) {
    throw new Error(
      "trade.nonce: wallet activity changed; prepare a new transaction."
    );
  }
  await client.call({
    account: getAddress(trade.input.wallet),
    to: getAddress(payload.to),
    data: payload.data,
    value: BigInt(payload.value),
    gas: BigInt(payload.gasLimit),
    maxFeePerGas: BigInt(payload.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(payload.maxPriorityFeePerGas),
    blockTag: "pending",
  });
};

const receiptNativeFee = (
  network: string,
  receipt: TransactionReceipt
): bigint => {
  const extra = Schema.decodeUnknownSync(
    Schema.Struct({
      gasUsedForL1: Schema.optionalKey(
        Schema.String.check(Schema.isPattern(/^0x[0-9a-fA-F]+$/u))
      ),
      l1Fee: Schema.optionalKey(
        Schema.String.check(Schema.isPattern(/^0x[0-9a-fA-F]+$/u))
      ),
    })
  )(receipt);
  if (
    ["eip155:8453", "eip155:84532"].includes(network) &&
    extra.l1Fee === undefined
  ) {
    throw new Error(
      "trade.receipt: Base data fee is missing; keep the reservation until accounting is available."
    );
  }
  if (network === "eip155:4663") {
    // Nitro accounts for poster costs in gasUsed; adding a separate L1 fee would double-count it.
    if (
      extra.gasUsedForL1 === undefined ||
      BigInt(extra.gasUsedForL1) > receipt.gasUsed
    ) {
      throw new Error(
        "trade.receipt: Robinhood poster gas accounting is missing or inconsistent."
      );
    }
    return receipt.gasUsed * receipt.effectiveGasPrice;
  }
  return (
    receipt.gasUsed * receipt.effectiveGasPrice + BigInt(extra.l1Fee ?? "0")
  );
};

const receivedToken = (trade: Trade, receipt: TransactionReceipt): bigint => {
  let output = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== trade.input.tokenOut.toLowerCase()) {
      continue;
    }
    try {
      const event = decodeEventLog({
        abi: TOKEN,
        eventName: "Transfer",
        data: log.data,
        topics: log.topics,
      });
      if (event.args.to.toLowerCase() === trade.input.wallet.toLowerCase()) {
        output += event.args.value;
      }
      if (event.args.from.toLowerCase() === trade.input.wallet.toLowerCase()) {
        output -= event.args.value;
      }
    } catch {
      /* Other token events do not establish a transfer. */
    }
  }
  return output;
};

export const confirmedTradeReceipt = async (
  client: TradeEvmClient,
  trade: Trade,
  step: TradeStep,
  confirmations: number,
  now: number,
  settlementValues?: (
    trade: Trade,
    step: TradeStep,
    receipt: TransactionReceipt
  ) => { readonly output: string | null; readonly actualInput?: string }
) => {
  if (!Number.isSafeInteger(confirmations) || confirmations < 1) {
    throw new Error(
      "trade.confirmations: a positive confirmation count is required."
    );
  }
  const hash = step.transactionId;
  if (
    hash === null ||
    !isHex(hash) ||
    hash.length !== 66 ||
    step.payload.kind !== "evm"
  ) {
    throw new Error("trade.identity: no valid EVM transaction identity.");
  }
  await assertTradeNetwork(client, trade.input.network);
  let receipt: TransactionReceipt;
  try {
    receipt = await client.getTransactionReceipt({ hash });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) {
      return { state: "pending" as const };
    }
    throw error;
  }
  Schema.decodeUnknownSync(
    Schema.Struct({
      status: Schema.Literals(["success", "reverted"]),
      gasUsed: Schema.BigInt.check(Schema.makeFilter((value) => value >= 0n)),
      effectiveGasPrice: Schema.BigInt.check(
        Schema.makeFilter((value) => value >= 0n)
      ),
      logs: Schema.Array(Schema.Unknown).check(Schema.isMaxLength(256)),
    })
  )(receipt);
  if (
    receipt.transactionHash.toLowerCase() !== hash.toLowerCase() ||
    receipt.from.toLowerCase() !== trade.input.wallet.toLowerCase() ||
    receipt.to?.toLowerCase() !== step.payload.to.toLowerCase()
  ) {
    throw new Error("trade.receipt: transaction identity does not match.");
  }
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const latest = await client.getBlockNumber();
  if (
    block.hash !== receipt.blockHash ||
    latest < receipt.blockNumber + BigInt(confirmations - 1)
  ) {
    return { state: "pending" as const };
  }
  const nativeFee = receiptNativeFee(trade.input.network, receipt);
  const output = receivedToken(trade, receipt);
  const values =
    receipt.status === "success"
      ? settlementValues?.(trade, step, receipt)
      : undefined;
  return {
    state:
      receipt.status === "success"
        ? ("confirmed" as const)
        : ("reverted" as const),
    nativeFee: nativeFee.toString(),
    output:
      !["approve", "permit"].includes(step.kind) && output >= 0n
        ? output.toString()
        : null,
    at: now,
    ...values,
  };
};
