import { EvmAddress } from "@froggy/domain";
import { Schema } from "effect";

import { hasBase58Size, SolanaTradingAddress, TradingNetwork } from "./trading";

const Quantity = Schema.String.check(
  Schema.isPattern(/^0x(?:0|[1-9a-fA-F][\da-fA-F]{0,63})$/u)
);
const Hash = Schema.String.check(Schema.isPattern(/^0x[\da-fA-F]{64}$/u));
const Block = Schema.Union([
  Quantity,
  Schema.Literals(["latest", "safe", "finalized", "earliest"]),
]);
const Commitment = Schema.Literals(["confirmed", "finalized"]);
const CommitmentConfig = Schema.Struct({ commitment: Commitment });
const DataConfig = Schema.Struct({
  commitment: Commitment,
  encoding: Schema.Literals(["base64"]),
  dataSlice: Schema.Struct({
    offset: Schema.Int.check(
      Schema.isBetween({ minimum: 0, maximum: 1_048_576 })
    ),
    length: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1024 })),
  }),
});

const RpcCall = Schema.Union([
  Schema.Struct({
    method: Schema.Literals(["eth_blockNumber"]),
    params: Schema.Tuple([]),
  }),
  Schema.Struct({
    method: Schema.Literals(["eth_getBalance", "eth_getCode"]),
    params: Schema.Tuple([EvmAddress, Block]),
  }),
  Schema.Struct({
    method: Schema.Literals(["eth_call"]),
    params: Schema.Tuple([
      Schema.Struct({
        to: EvmAddress,
        from: Schema.optionalKey(EvmAddress),
        data: Schema.String.check(
          Schema.isPattern(/^0x(?:[\da-fA-F]{2})*$/u),
          Schema.isMaxLength(8194)
        ),
      }),
      Block,
    ]),
  }),
  Schema.Struct({
    method: Schema.Literals(["eth_getTransactionReceipt"]),
    params: Schema.Tuple([Hash]),
  }),
  Schema.Struct({
    method: Schema.Literals(["getSlot"]),
    params: Schema.Tuple([CommitmentConfig]),
  }),
  Schema.Struct({
    method: Schema.Literals(["getBalance"]),
    params: Schema.Tuple([SolanaTradingAddress, CommitmentConfig]),
  }),
  Schema.Struct({
    method: Schema.Literals(["getAccountInfo"]),
    params: Schema.Tuple([SolanaTradingAddress, DataConfig]),
  }),
  Schema.Struct({
    method: Schema.Literals(["getTokenAccountsByOwner"]),
    params: Schema.Tuple([
      SolanaTradingAddress,
      Schema.Struct({ mint: SolanaTradingAddress }),
      DataConfig,
    ]),
  }),
  Schema.Struct({
    method: Schema.Literals(["getSignatureStatuses"]),
    params: Schema.Tuple([
      Schema.Array(
        Schema.String.check(
          Schema.isPattern(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/u),
          Schema.makeFilter((value) => hasBase58Size(value, 64), {
            message: "A Solana signature must encode exactly 64 bytes.",
          })
        )
      ).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
      Schema.Struct({ searchTransactionHistory: Schema.Literals([false]) }),
    ]),
  }),
]);

export const RpcReadInput = Schema.Struct({
  network: TradingNetwork,
  call: RpcCall,
})
  .check(
    Schema.makeFilter(
      (input) =>
        input.network.startsWith("eip155:") ===
        input.call.method.startsWith("eth_"),
      { message: "RPC method does not belong to the requested network." }
    )
  )
  .annotate({ parseOptions: { onExcessProperty: "error" } });
export type RpcReadInput = typeof RpcReadInput.Type;

export const RpcReadResult = Schema.Struct({
  v: Schema.Literals([1]),
  operation: Schema.Literals(["rpc_read"]),
  provider: Schema.Literals(["quicknode"]),
  stubbed: Schema.Boolean,
  observedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  network: TradingNetwork,
  method: Schema.Literals([
    "eth_blockNumber",
    "eth_getBalance",
    "eth_getCode",
    "eth_call",
    "eth_getTransactionReceipt",
    "getSlot",
    "getBalance",
    "getAccountInfo",
    "getTokenAccountsByOwner",
    "getSignatureStatuses",
  ]),
  result: Schema.Json.check(
    Schema.makeFilter((value) => JSON.stringify(value).length <= 48_000, {
      message: "RPC result exceeds the output limit.",
    })
  ),
  context: Schema.Struct({
    blockNumber: Schema.NullOr(Quantity),
    blockHash: Schema.NullOr(Hash),
    slot: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    commitment: Schema.NullOr(Commitment),
  }),
  limitations: Schema.Array(Schema.String.check(Schema.isMaxLength(300))).check(
    Schema.isMaxLength(8)
  ),
});
export type RpcReadResult = typeof RpcReadResult.Type;
