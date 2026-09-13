import { CheckoutDecimal } from "@froggy/domain";
import { Schema } from "effect";

import { boundedBytes } from "./outbound";

const Rates = Schema.Struct({
  data: Schema.Struct({
    currency: Schema.Literal("USDC"),
    rates: Schema.Record(Schema.String, Schema.String),
  }),
});
export interface CardRates {
  readonly get: (currency: string) => Promise<{
    readonly rate: string;
    readonly usdRate: string;
    readonly observedAt: number;
    readonly stubbed: boolean;
  }>;
}
export const coinbaseCardRates = (call = fetch, now = Date.now): CardRates => ({
  get: async (currency) => {
    const response = await call(
      "https://api.coinbase.com/v2/exchange-rates?currency=USDC",
      {
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
        cache: "no-store",
      }
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("card.rate: the exchange rate is unavailable.");
    }
    try {
      const { data } = Schema.decodeUnknownSync(Rates)(
        JSON.parse(
          new TextDecoder().decode(await boundedBytes(response, 128_000))
        )
      );
      return {
        rate: Schema.decodeUnknownSync(CheckoutDecimal)(data.rates[currency]),
        usdRate: Schema.decodeUnknownSync(CheckoutDecimal)(data.rates["USD"]),
        observedAt: now(),
        stubbed: false,
      };
    } catch {
      throw new Error(
        "card.rate: no valid USDC exchange rate for this currency."
      );
    }
  },
});
export const stubCardRates = (now = Date.now): CardRates => ({
  get: async (currency) => {
    await Promise.resolve();
    const rates = new Map<string, string>(
      Object.entries({
        USD: "1",
        EUR: "0.92",
        GBP: "0.78",
        JPY: "150",
      })
    );
    const rate = rates.get(currency);
    if (rate === undefined) {
      throw new Error("card.rate: no fixture rate for this currency.");
    }
    return { rate, usdRate: "1", observedAt: now(), stubbed: true };
  },
});
