import { TradingUnits } from "@froggy/domain";
import type { TradeInput } from "@froggy/domain";
import { Schema } from "effect";

import { boundedBytes, safeFetch } from "../outbound";
import type { OutboundOptions } from "../outbound";
import { jupiterMint, WRAPPED_SOL } from "./jupiter";
import { SOLANA_MAINNET } from "./networks";

const Positive = TradingUnits.check(
  Schema.makeFilter((value) => BigInt(value) > 0n)
);
const Order = Schema.Struct({
  transaction: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(1644)
  ),
  pumpMintInfo: Schema.Struct({
    hasGraduated: Schema.Boolean,
    expectedOutAmount: Positive,
  }),
});

export const pumpOrder = async (
  input: TradeInput,
  outbound?: OutboundOptions
) => {
  if (
    input.network !== SOLANA_MAINNET ||
    input.venue !== "pump" ||
    input.action !== "swap" ||
    (input.tokenIn === "native") === (input.tokenOut === "native") ||
    input.tokenIn === WRAPPED_SOL ||
    input.tokenOut === WRAPPED_SOL
  ) {
    throw new Error(
      "trade.assets: Pump supports native SOL buys and sells on Solana mainnet."
    );
  }
  try {
    const response = await safeFetch(
      "https://fun-block.pump.fun/agents/swap",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inputMint: jupiterMint(input.tokenIn),
          outputMint: jupiterMint(input.tokenOut),
          amount:
            input.tokenIn === "native"
              ? (
                  (BigInt(input.amount) * 10_000n) /
                  BigInt(10_000 + input.slippageBps)
                ).toString()
              : input.amount,
          user: input.wallet,
          feePayer: input.wallet,
          slippagePct: input.slippageBps / 100,
          frontRunningProtection: false,
          tipAmount: 0,
          encoding: "base64",
        }),
      },
      { ...outbound, maxRedirects: 0, timeoutMs: 20_000 }
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Provider unavailable");
    }
    const result = Schema.decodeUnknownSync(Order)(
      JSON.parse(
        new TextDecoder().decode(await boundedBytes(response, 128_000))
      )
    );
    const minimum =
      (BigInt(result.pumpMintInfo.expectedOutAmount) *
        BigInt(10_000 - input.slippageBps)) /
      10_000n;
    if (minimum <= 0n) {
      throw new Error("No positive protected output");
    }
    return {
      transaction: result.transaction,
      expectedOutput: result.pumpMintInfo.expectedOutAmount,
      minimumOutput: minimum.toString(),
      phase: result.pumpMintInfo.hasGraduated
        ? ("graduated" as const)
        : ("curve" as const),
    };
  } catch {
    throw new Error(
      "trade.pump: the native builder returned an unavailable or unsupported order."
    );
  }
};
