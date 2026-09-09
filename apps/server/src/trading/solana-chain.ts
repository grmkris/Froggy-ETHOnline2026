import { SolanaTradingAddress, TradingUnits } from "@froggy/domain";
import { Redacted, Schema } from "effect";

import { boundedBytes, safeFetch } from "../outbound";
import type { OutboundOptions } from "../outbound";

const Natural = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })
);
const Context = Schema.Struct({ slot: Natural });
const Base64 = Schema.String.check(
  Schema.isPattern(
    /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/u
  ),
  Schema.isMaxLength(64_000)
);
const Account = Schema.Struct({
  data: Schema.Tuple([Base64, Schema.Literal("base64")]),
  executable: Schema.Boolean,
  lamports: Natural,
  owner: SolanaTradingAddress,
});
export type SolanaTradeAccount = typeof Account.Type;
const Accounts = Schema.Struct({
  context: Context,
  value: Schema.Array(Schema.NullOr(Account)).check(Schema.isMaxLength(64)),
});
const InnerInstructions = Schema.Array(
  Schema.Struct({
    index: Natural,
    instructions: Schema.Array(
      Schema.Struct({
        programIdIndex: Natural,
        accounts: Schema.Array(Natural).check(Schema.isMaxLength(64)),
        data: Schema.String.check(
          Schema.isPattern(/^[1-9A-HJ-NP-Za-km-z]*$/u),
          Schema.isMaxLength(4096)
        ),
      })
    ).check(Schema.isMaxLength(128)),
  })
).check(Schema.isMaxLength(12));
export type SolanaInnerInstructions = typeof InnerInstructions.Type;
const Simulation = Schema.Struct({
  context: Context,
  value: Schema.Struct({
    err: Schema.Json,
    unitsConsumed: Natural,
    innerInstructions: Schema.optionalKey(Schema.NullOr(InnerInstructions)),
    accounts: Schema.Array(Schema.NullOr(Account)).check(
      Schema.isMaxLength(64)
    ),
  }),
});
const TokenBalance = Schema.Struct({
  accountIndex: Natural,
  mint: SolanaTradingAddress,
  owner: Schema.optionalKey(SolanaTradingAddress),
  uiTokenAmount: Schema.Struct({ amount: TradingUnits, decimals: Natural }),
});
const TransactionResult = Schema.NullOr(
  Schema.Struct({
    slot: Natural,
    transaction: Schema.Tuple([Base64, Schema.Literal("base64")]),
    meta: Schema.Struct({
      err: Schema.Json,
      loadedAddresses: Schema.optionalKey(
        Schema.Struct({
          writable: Schema.Array(SolanaTradingAddress).check(
            Schema.isMaxLength(64)
          ),
          readonly: Schema.Array(SolanaTradingAddress).check(
            Schema.isMaxLength(64)
          ),
        })
      ),
      fee: Natural,
      innerInstructions: Schema.optionalKey(Schema.NullOr(InnerInstructions)),
      preBalances: Schema.Array(Natural).check(Schema.isMaxLength(64)),
      postBalances: Schema.Array(Natural).check(Schema.isMaxLength(64)),
      preTokenBalances: Schema.Array(TokenBalance).check(
        Schema.isMaxLength(64)
      ),
      postTokenBalances: Schema.Array(TokenBalance).check(
        Schema.isMaxLength(64)
      ),
    }),
  })
);
export type SolanaTradeReceipt = Exclude<typeof TransactionResult.Type, null>;
const Envelope = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Natural,
  result: Schema.optionalKey(Schema.Json),
  error: Schema.optionalKey(Schema.Struct({ code: Schema.Int })),
});

interface SolanaTradeRpcOptions {
  readonly endpoint: Redacted.Redacted;
  readonly outbound?: OutboundOptions;
}

/** Execution-only RPC. Inputs and outputs never become generic agent capabilities. */
export class SolanaTradeRpc {
  private readonly options: SolanaTradeRpcOptions;
  private sequence = 0;

  constructor(options: SolanaTradeRpcOptions) {
    this.options = options;
  }

  private async call<S extends Schema.Codec<unknown>>(
    method: string,
    params: Schema.Json[],
    schema: S
  ): Promise<S["Type"]> {
    this.sequence += 1;
    const id = this.sequence;
    try {
      const response = await safeFetch(
        Redacted.value(this.options.endpoint),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        },
        { ...this.options.outbound, maxRedirects: 0, timeoutMs: 15_000 }
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("RPC unavailable");
      }
      const envelope = Schema.decodeUnknownSync(Envelope)(
        JSON.parse(
          new TextDecoder().decode(await boundedBytes(response, 256_000))
        )
      );
      if (
        envelope.id !== id ||
        envelope.error !== undefined ||
        envelope.result === undefined
      ) {
        throw new Error("Invalid RPC envelope");
      }
      return Schema.decodeUnknownSync(schema)(envelope.result);
    } catch {
      throw new Error(
        "trade.rpc: Solana execution RPC failed or returned an invalid response."
      );
    }
  }

  async assertNetwork(network: string): Promise<void> {
    const genesis = await this.call("getGenesisHash", [], SolanaTradingAddress);
    // CAIP-2 uses the first 32 characters of the Solana genesis hash.
    if (`solana:${genesis.slice(0, 32)}` !== network) {
      throw new Error("trade.network: Solana RPC belongs to another network.");
    }
  }

  async accounts(
    addresses: readonly string[],
    minimumSlot = 0
  ): Promise<typeof Accounts.Type> {
    if (addresses.length === 0 || addresses.length > 64) {
      throw new Error(
        "trade.accounts: account list exceeds the supported bound."
      );
    }
    const result = await this.call(
      "getMultipleAccounts",
      [
        [...addresses],
        {
          encoding: "base64",
          commitment: "confirmed",
          minContextSlot: minimumSlot,
        },
      ],
      Accounts
    );
    if (
      result.context.slot < minimumSlot ||
      result.value.length !== addresses.length
    ) {
      throw new Error(
        "trade.accounts: RPC returned an incomplete or stale account set."
      );
    }
    return result;
  }

  async validity(
    blockhash: string,
    lastValidBlockHeight: number,
    minimumSlot = 0
  ): Promise<void> {
    const [valid, height] = await Promise.all([
      this.call(
        "isBlockhashValid",
        [blockhash, { commitment: "confirmed", minContextSlot: minimumSlot }],
        Schema.Struct({ context: Context, value: Schema.Boolean })
      ),
      this.call(
        "getBlockHeight",
        [{ commitment: "confirmed", minContextSlot: minimumSlot }],
        Natural
      ),
    ]);
    if (
      !valid.value ||
      valid.context.slot < minimumSlot ||
      height > lastValidBlockHeight
    ) {
      throw new Error(
        "trade.expired: the Solana blockhash is no longer valid."
      );
    }
  }

  async fee(message: string, minimumSlot: number): Promise<bigint> {
    const result = await this.call(
      "getFeeForMessage",
      [message, { commitment: "confirmed", minContextSlot: minimumSlot }],
      Schema.Struct({ context: Context, value: Schema.NullOr(Natural) })
    );
    if (result.value === null || result.context.slot < minimumSlot) {
      throw new Error("trade.gas: a fresh Solana fee is unavailable.");
    }
    return BigInt(result.value);
  }

  async simulate(
    transaction: string,
    addresses: readonly string[],
    minimumSlot: number
  ): Promise<typeof Simulation.Type> {
    const result = await this.call(
      "simulateTransaction",
      [
        transaction,
        {
          encoding: "base64",
          commitment: "confirmed",
          minContextSlot: minimumSlot,
          sigVerify: false,
          innerInstructions: true,
          replaceRecentBlockhash: false,
          accounts: { encoding: "base64", addresses: [...addresses] },
        },
      ],
      Simulation
    );
    if (
      result.context.slot < minimumSlot ||
      result.value.accounts.length !== addresses.length ||
      result.value.err !== null
    ) {
      throw new Error(
        "trade.simulation: Solana simulation reverted or returned incomplete account changes."
      );
    }
    return result;
  }

  async receipt(transactionId: string): Promise<typeof TransactionResult.Type> {
    return await this.call(
      "getTransaction",
      [
        transactionId,
        {
          encoding: "base64",
          commitment: "finalized",
          maxSupportedTransactionVersion: 0,
        },
      ],
      TransactionResult
    );
  }

  async latestBlockhash() {
    return await this.call(
      "getLatestBlockhash",
      [{ commitment: "confirmed" }],
      Schema.Struct({
        context: Context,
        value: Schema.Struct({
          blockhash: SolanaTradingAddress,
          lastValidBlockHeight: Natural,
        }),
      })
    );
  }

  async send(transaction: string, transactionId: string): Promise<void> {
    const result = await this.call(
      "sendTransaction",
      [
        transaction,
        {
          encoding: "base64",
          skipPreflight: false,
          preflightCommitment: "confirmed",
          maxRetries: 0,
        },
      ],
      Schema.String.check(Schema.isPattern(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/u))
    );
    if (result !== transactionId) {
      throw new Error(
        "trade.submission_unknown: RPC returned a different transaction identity."
      );
    }
  }

  async rent(bytes: number): Promise<bigint> {
    return BigInt(
      await this.call(
        "getMinimumBalanceForRentExemption",
        [bytes, { commitment: "confirmed" }],
        Natural
      )
    );
  }
}
