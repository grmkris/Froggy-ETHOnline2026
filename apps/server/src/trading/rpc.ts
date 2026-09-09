import { EvmAddress } from "@froggy/domain";
import { RpcReadInput, RpcReadResult } from "@froggy/protocol";
import { Redacted, Schema } from "effect";

import { boundedBytes, safeFetch } from "../outbound";
import type { OutboundOptions } from "../outbound";

const Natural = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Quantity = Schema.String.check(
  Schema.isPattern(/^0x(?:0|[1-9a-fA-F][\da-fA-F]{0,63})$/u)
);
const Hash = Schema.String.check(Schema.isPattern(/^0x[\da-fA-F]{64}$/u));
const HexData = Schema.String.check(
  Schema.isPattern(/^0x(?:[\da-fA-F]{2})*$/u),
  Schema.isMaxLength(48_000)
);
const PublicKey = Schema.String.check(
  Schema.isPattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u)
);
const Envelope = Schema.Struct({
  jsonrpc: Schema.Literals(["2.0"]),
  id: Natural,
  result: Schema.optionalKey(Schema.Json),
  error: Schema.optionalKey(Schema.Struct({ code: Schema.Int })),
});
const Log = Schema.Struct({
  address: EvmAddress,
  blockHash: Hash,
  blockNumber: Quantity,
  data: HexData,
  logIndex: Quantity,
  removed: Schema.optionalKey(Schema.Boolean),
  topics: Schema.Array(Hash).check(Schema.isMaxLength(4)),
  transactionHash: Hash,
  transactionIndex: Quantity,
});
const Receipt = Schema.NullOr(
  Schema.Struct({
    blockHash: Hash,
    blockNumber: Quantity,
    contractAddress: Schema.NullOr(EvmAddress),
    cumulativeGasUsed: Quantity,
    effectiveGasPrice: Schema.optionalKey(Quantity),
    from: EvmAddress,
    gasUsed: Quantity,
    logs: Schema.Array(Log).check(Schema.isMaxLength(100)),
    status: Schema.Literals(["0x0", "0x1"]),
    to: Schema.NullOr(EvmAddress),
    transactionHash: Hash,
    transactionIndex: Quantity,
    type: Schema.optionalKey(Quantity),
  })
);
const SlotContext = Schema.Struct({ slot: Natural });
const Account = Schema.Struct({
  data: Schema.Tuple([
    Schema.String.check(
      Schema.isPattern(
        /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/u
      ),
      Schema.isMaxLength(1368)
    ),
    Schema.Literals(["base64"]),
  ]),
  executable: Schema.Boolean,
  lamports: Natural,
  owner: PublicKey,
  space: Schema.optionalKey(Natural),
});
const BalanceResult = Schema.Struct({ context: SlotContext, value: Natural });
const AccountResult = Schema.Struct({
  context: SlotContext,
  value: Schema.NullOr(Account),
});
const TokenAccountsResult = Schema.Struct({
  context: SlotContext,
  value: Schema.Array(
    Schema.Struct({ pubkey: PublicKey, account: Account })
  ).check(Schema.isMaxLength(20)),
});
const StatusResult = Schema.Struct({
  context: SlotContext,
  value: Schema.Array(
    Schema.NullOr(
      Schema.Struct({
        slot: Natural,
        confirmations: Schema.NullOr(Natural),
        err: Schema.Json,
        confirmationStatus: Schema.NullOr(
          Schema.Literals(["processed", "confirmed", "finalized"])
        ),
      })
    )
  ).check(Schema.isMaxLength(20)),
});

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const hasBase58Size = (value: string, bytes: number): boolean => {
  let number = 0n;
  for (const character of value) {
    const digit = BASE58.indexOf(character);
    if (digit === -1) {
      return false;
    }
    number = number * 58n + BigInt(digit);
  }
  const leadingZeroes = value.length - value.replace(/^1+/u, "").length;
  const significantBytes =
    number === 0n ? 0 : Math.ceil(number.toString(16).length / 2);
  return leadingZeroes + significantBytes === bytes;
};

/** Call before quoting or charging; only these decoded parameters reach an endpoint. */
export const preflightRpcRead = Schema.decodeUnknownSync(RpcReadInput, {
  onExcessProperty: "error",
});

export interface TradingRpc {
  readonly read: (input: RpcReadInput) => Promise<RpcReadResult>;
}

class RpcProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpcProviderError";
  }
}

const rpcError = (message: string): RpcProviderError =>
  new RpcProviderError(message);

const requestedContext = (input: RpcReadInput): RpcReadResult["context"] => {
  const context: RpcReadResult["context"] = {
    blockNumber: null,
    blockHash: null,
    slot: null,
    commitment: null,
  };
  const { call } = input;
  switch (call.method) {
    case "eth_getBalance":
    case "eth_getCode":
    case "eth_call": {
      const [, block] = call.params;
      if (block === "earliest") {
        return { ...context, blockNumber: "0x0" };
      }
      return {
        ...context,
        blockNumber: block.startsWith("0x") ? block : null,
      };
    }
    case "getSlot": {
      return { ...context, commitment: call.params[0].commitment };
    }
    case "getBalance":
    case "getAccountInfo": {
      return { ...context, commitment: call.params[1].commitment };
    }
    case "getTokenAccountsByOwner": {
      return { ...context, commitment: call.params[2].commitment };
    }
    case "eth_blockNumber":
    case "eth_getTransactionReceipt":
    case "getSignatureStatuses": {
      return context;
    }
    default: {
      throw rpcError("Unsupported RPC method.");
    }
  }
};

const validateAccount = (
  account: typeof Account.Type,
  length: number
): void => {
  if (
    !hasBase58Size(account.owner, 32) ||
    Buffer.from(account.data[0], "base64").byteLength > length
  ) {
    throw rpcError("RPC account data does not match the bounded request.");
  }
};

const readResult = (
  input: RpcReadInput,
  value: Schema.Json
): Pick<RpcReadResult, "result" | "context"> => {
  const context = requestedContext(input);
  const { call } = input;
  switch (call.method) {
    case "eth_blockNumber": {
      const result = Schema.decodeUnknownSync(Quantity)(value);
      return { result, context: { ...context, blockNumber: result } };
    }
    case "eth_getBalance": {
      return { result: Schema.decodeUnknownSync(Quantity)(value), context };
    }
    case "eth_getCode":
    case "eth_call": {
      return { result: Schema.decodeUnknownSync(HexData)(value), context };
    }
    case "eth_getTransactionReceipt": {
      const result = Schema.decodeUnknownSync(Receipt)(value);
      if (result === null) {
        return { result, context };
      }
      if (
        result.transactionHash.toLowerCase() !== call.params[0].toLowerCase()
      ) {
        throw rpcError("RPC receipt does not match the requested transaction.");
      }
      return {
        result,
        context: {
          ...context,
          blockNumber: result.blockNumber,
          blockHash: result.blockHash,
        },
      };
    }
    case "getSlot": {
      const result = Schema.decodeUnknownSync(Natural)(value);
      return { result, context: { ...context, slot: result } };
    }
    case "getBalance": {
      const result = Schema.decodeUnknownSync(BalanceResult)(value);
      return { result, context: { ...context, slot: result.context.slot } };
    }
    case "getAccountInfo": {
      const result = Schema.decodeUnknownSync(AccountResult)(value);
      if (result.value !== null) {
        validateAccount(result.value, call.params[1].dataSlice.length);
      }
      return { result, context: { ...context, slot: result.context.slot } };
    }
    case "getTokenAccountsByOwner": {
      const result = Schema.decodeUnknownSync(TokenAccountsResult)(value);
      for (const account of result.value) {
        if (!hasBase58Size(account.pubkey, 32)) {
          throw rpcError("RPC returned an invalid token account address.");
        }
        validateAccount(account.account, call.params[2].dataSlice.length);
      }
      return { result, context: { ...context, slot: result.context.slot } };
    }
    case "getSignatureStatuses": {
      const result = Schema.decodeUnknownSync(StatusResult)(value);
      if (result.value.length !== call.params[0].length) {
        throw rpcError(
          "RPC signature status count does not match the request."
        );
      }
      return { result, context: { ...context, slot: result.context.slot } };
    }
    default: {
      throw rpcError("Unsupported RPC method.");
    }
  }
};

const limitations = (input: RpcReadInput): readonly string[] => {
  const notes = [
    "One provider observation, not independent consensus evidence. RPC quantities retain their native wire encoding.",
  ];
  const { call } = input;
  if (call.method.startsWith("eth_")) {
    notes.push(
      "An explicit block number or receipt can be reorganized. A block tag without a returned block hash is not a pinned snapshot."
    );
  }
  if (call.method === "eth_call") {
    notes.push(
      "eth_call is capped at 500,000 gas; it does not submit a transaction or establish that a trade is executable."
    );
  }
  if (
    call.method === "getAccountInfo" ||
    call.method === "getTokenAccountsByOwner"
  ) {
    notes.push(
      "Account data is the requested base64 slice. rentEpoch is omitted; integers that cannot be represented exactly are refused."
    );
  }
  if (call.method === "getSignatureStatuses") {
    notes.push(
      "Recent status cache only. Null is unknown; processed status is not confirmation, and archival history is not searched."
    );
  }
  return notes;
};

export const liveTradingRpc = (options: {
  readonly endpoints: Readonly<Record<string, Redacted.Redacted>>;
  readonly outbound?: OutboundOptions;
  readonly now?: () => number;
}): TradingRpc => {
  const checked = new Map<string, Promise<void>>();
  let requestId = 0;
  const invoke = async (
    endpoint: Redacted.Redacted,
    method: string,
    params: readonly Schema.Json[]
  ): Promise<Schema.Json> => {
    requestId += 1;
    const id = requestId;
    try {
      const response = await safeFetch(
        Redacted.value(endpoint),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        },
        { ...options.outbound, maxRedirects: 0, timeoutMs: 15_000 }
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw rpcError(`RPC provider returned HTTP ${response.status}.`);
      }
      const body: unknown = JSON.parse(
        new TextDecoder().decode(await boundedBytes(response, 64_000))
      );
      const envelope = Schema.decodeUnknownSync(Envelope)(body);
      if (
        envelope.id !== id ||
        (envelope.error !== undefined && envelope.result !== undefined)
      ) {
        throw rpcError("RPC provider returned an invalid response envelope.");
      }
      if (envelope.error !== undefined) {
        throw rpcError(
          `RPC provider rejected the read (code ${envelope.error.code}).`
        );
      }
      if (envelope.result === undefined) {
        throw rpcError("RPC provider returned no result.");
      }
      return envelope.result;
    } catch (error) {
      if (error instanceof RpcProviderError) {
        throw error;
      }
      // Endpoint paths and provider errors may contain the configured API credential.
      throw rpcError(
        "RPC transport failed or returned an invalid or oversized response."
      );
    }
  };
  const confirmNetwork = async (
    network: string,
    endpoint: Redacted.Redacted
  ): Promise<void> => {
    const evm = network.startsWith("eip155:");
    const result = await invoke(
      endpoint,
      evm ? "eth_chainId" : "getGenesisHash",
      []
    );
    const decoded = Schema.decodeUnknownResult(evm ? Quantity : PublicKey)(
      result
    );
    const actual = decoded._tag === "Success" ? decoded.success : null;
    const expected = network.slice(network.indexOf(":") + 1);
    const matches =
      actual !== null &&
      (evm
        ? BigInt(actual) === BigInt(expected)
        : hasBase58Size(actual, 32) && actual.slice(0, 32) === expected);
    if (!matches) {
      throw rpcError(
        "Configured RPC endpoint does not match the requested network."
      );
    }
  };
  return {
    read: async (input) => {
      const request = preflightRpcRead(input);
      const endpoint = options.endpoints[request.network];
      if (endpoint === undefined || Redacted.value(endpoint).trim() === "") {
        throw rpcError("RPC endpoint is not configured for this network.");
      }
      let identity = checked.get(request.network);
      if (identity === undefined) {
        identity = confirmNetwork(request.network, endpoint);
        checked.set(request.network, identity);
      }
      try {
        await identity;
      } catch (error) {
        checked.delete(request.network);
        throw error;
      }
      const { call } = request;
      const params =
        call.method === "eth_call"
          ? [{ ...call.params[0], gas: "0x7a120" }, call.params[1]]
          : call.params;
      const value = await invoke(endpoint, call.method, params);
      try {
        return Schema.decodeUnknownSync(RpcReadResult)({
          v: 1,
          operation: "rpc_read",
          provider: "quicknode",
          stubbed: false,
          observedAt: (options.now ?? Date.now)(),
          network: request.network,
          method: call.method,
          ...readResult(request, value),
          limitations: limitations(request),
        });
      } catch (error) {
        if (error instanceof RpcProviderError) {
          throw error;
        }
        throw rpcError(
          "RPC provider returned a malformed or oversized method result."
        );
      }
    },
  };
};

const stubValue = (input: RpcReadInput): Schema.Json => {
  switch (input.call.method) {
    case "eth_blockNumber":
    case "eth_getBalance": {
      return "0x0";
    }
    case "eth_getCode":
    case "eth_call": {
      return "0x";
    }
    case "eth_getTransactionReceipt": {
      return null;
    }
    case "getSlot": {
      return 0;
    }
    case "getBalance": {
      return { context: { slot: 0 }, value: 0 };
    }
    case "getAccountInfo": {
      return { context: { slot: 0 }, value: null };
    }
    case "getTokenAccountsByOwner": {
      return { context: { slot: 0 }, value: [] };
    }
    case "getSignatureStatuses": {
      return {
        context: { slot: 0 },
        value: input.call.params[0].map(() => null),
      };
    }
    default: {
      throw rpcError("Unsupported RPC method.");
    }
  }
};

export const stubTradingRpc = (): TradingRpc => ({
  read: async (input) => {
    const request = preflightRpcRead(input);
    await Promise.resolve();
    return Schema.decodeUnknownSync(RpcReadResult)({
      v: 1,
      operation: "rpc_read",
      provider: "quicknode",
      stubbed: true,
      observedAt: Date.now(),
      network: request.network,
      method: request.call.method,
      ...readResult(request, stubValue(request)),
      limitations: [
        "DEMO fixture. These values do not describe the requested account, transaction, or network.",
      ],
    });
  },
});
