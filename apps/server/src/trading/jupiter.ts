import { SolanaTradingAddress, TradingUnits } from "@froggy/domain";
import type { TradeInput } from "@froggy/domain";
import { Redacted, Schema } from "effect";

import { boundedBytes, safeFetch } from "../outbound";
import type { OutboundOptions } from "../outbound";
import { SOLANA_MAINNET } from "./networks";

// Jupiter's Swap v2 reference and Solana's native mint, reviewed 2026-09-08.
const API = "https://api.jup.ag/swap/v2";
export const WRAPPED_SOL = "So11111111111111111111111111111111111111112";
export const jupiterMint = (asset: string): string =>
  asset === "native" ? WRAPPED_SOL : asset;
const Positive = TradingUnits.check(
  Schema.makeFilter((value) => BigInt(value) > 0n)
);
const Order = Schema.Struct({
  inputMint: SolanaTradingAddress,
  outputMint: SolanaTradingAddress,
  taker: SolanaTradingAddress,
  inAmount: Positive,
  outAmount: Positive,
  otherAmountThreshold: Positive,
  swapMode: Schema.Literal("ExactIn"),
  slippageBps: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 5000 })
  ),
  router: Schema.Literal("metis"),
  gasless: Schema.Literal(false),
  feeBps: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 })),
  feeMint: SolanaTradingAddress,
  transaction: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(1644)
  ),
  requestId: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128)
  ),
  lastValidBlockHeight: Schema.String.check(
    Schema.isPattern(/^[1-9]\d{0,14}$/u)
  ),
});
type JupiterOrder = typeof Order.Type;
const Execute = Schema.Struct({
  status: Schema.Literals(["Success", "Failed"]),
  signature: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(88))),
  code: Schema.Int,
});

export interface JupiterOptions {
  readonly apiKey: Redacted.Redacted;
  readonly outbound?: OutboundOptions;
}

const request = async <S extends Schema.Codec<unknown>>(
  options: JupiterOptions,
  url: URL,
  init: RequestInit,
  schema: S
): Promise<S["Type"]> => {
  try {
    const response = await safeFetch(
      url.toString(),
      {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-api-key": Redacted.value(options.apiKey),
        },
      },
      { ...options.outbound, maxRedirects: 0, timeoutMs: 20_000 }
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Provider unavailable");
    }
    return Schema.decodeUnknownSync(schema)(
      JSON.parse(
        new TextDecoder().decode(await boundedBytes(response, 128_000))
      )
    );
  } catch {
    throw new Error(
      "trade.jupiter: the provider returned an unavailable or unsupported order."
    );
  }
};

export const jupiterOrders = (options: JupiterOptions) => ({
  order: async (input: TradeInput): Promise<JupiterOrder> => {
    if (
      input.network !== SOLANA_MAINNET ||
      input.venue !== "jupiter" ||
      input.action !== "swap"
    ) {
      throw new Error(
        "trade.network: Jupiter execution requires a Solana mainnet swap."
      );
    }
    const url = new URL(`${API}/order`);
    url.search = new URLSearchParams({
      inputMint: jupiterMint(input.tokenIn),
      outputMint: jupiterMint(input.tokenOut),
      amount: input.amount,
      taker: input.wallet,
      slippageBps: String(input.slippageBps),
      swapMode: "ExactIn",
      excludeRouters: "jupiterz,dflow,okx",
      jitoTipLamports: "0",
    }).toString();
    const order = await request(options, url, { method: "GET" }, Order);
    if (
      order.inputMint !== jupiterMint(input.tokenIn) ||
      order.outputMint !== jupiterMint(input.tokenOut) ||
      order.taker !== input.wallet ||
      order.inAmount !== input.amount ||
      order.slippageBps !== input.slippageBps ||
      BigInt(order.otherAmountThreshold) <
        (BigInt(order.outAmount) * BigInt(10_000 - input.slippageBps)) / 10_000n
    ) {
      throw new Error(
        "trade.quote: Jupiter changed the requested assets, authority or output protection."
      );
    }
    return order;
  },
  execute: async (input: {
    readonly requestId: string;
    readonly transaction: string;
    readonly transactionId: string;
    readonly lastValidBlockHeight: number;
  }): Promise<void> => {
    const result = await request(
      options,
      new URL(`${API}/execute`),
      {
        method: "POST",
        body: JSON.stringify({
          requestId: input.requestId,
          signedTransaction: input.transaction,
          lastValidBlockHeight: String(input.lastValidBlockHeight),
        }),
      },
      Execute
    );
    if (
      result.signature !== input.transactionId ||
      result.code !== 0 ||
      result.status !== "Success"
    ) {
      throw new Error(
        "trade.submission_unknown: Jupiter has not confirmed the saved transaction; independent reconciliation is required."
      );
    }
  },
});
