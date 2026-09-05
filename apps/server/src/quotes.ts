/**
 * What an asset is worth, at the one place that decides.
 *
 * Stablecoins are par by definition — that is the claim the asset itself
 * makes, and a receipt saying `par:stablecoin` is honest about resting on it.
 * HBAR is not, and pretending otherwise is how the whole mandate ended up
 * denominated in the wrong unit: one HBAR was valued at one dollar, which is
 * out by more than a factor of ten against the network's own published rate.
 *
 * Anything we cannot price returns null, and the session refuses. A guess here
 * is not a conservative default — it is a cap that was never applied.
 */

import type { Amount, Quote } from "@froggy/domain";
import { parQuote } from "@froggy/domain";
import type { RateSource } from "@froggy/payments";

/** Assets whose whole point is to be worth a dollar. */
const STABLE_SYMBOLS = new Set(["USDC", "USDT", "DAI", "EURC"]);

export const createQuotes = (rates: RateSource) => ({
  quote: (asset: Amount["asset"], now: number): Quote | null => {
    if (STABLE_SYMBOLS.has(asset.symbol.toUpperCase())) {
      return parQuote(now);
    }
    if (asset.symbol.toUpperCase() !== "HBAR") {
      return null;
    }
    const rate = rates.current(now);
    if (rate === null) {
      return null;
    }
    return {
      asOf: now,
      // Named so a receipt says where the number came from, and so a spend
      // priced by the stub is greppable rather than indistinguishable.
      source:
        rates.mode === "live"
          ? "hedera:mirror-node/exchangerate"
          : "stub:hbar-rate",
      usdMicrosPerUnit: rate.usdMicrosPerHbar,
    };
  },
});
