/**
 * The one balance, and what it is made of.
 *
 * Unknown amounts stay unknown: a balance the chain did not answer for is
 * not zero, and a total with a hole in it would read as complete. The server
 * reports the total it computed; the same rule is applied here so a summary
 * from an older server still adds up the same way.
 */

import type { WalletSummary } from "@froggy/protocol";

export interface WalletAmounts {
  readonly hbarTinybars: number | null;
  /** The HBAR at the mirror rate. A person with no account holds a known zero. */
  readonly hbarUsdMicros: number | null;
  /**
   * What Froggy holds for the person's Hedera payments before they have an
   * account of their own: a stub or an older deployment. Never part of the
   * total once an account exists, because the HBAR there is the same money.
   */
  readonly heldUsdMicros: number | null;
  readonly totalUsdMicros: number | null;
  /** USDC has six decimals, so its units are USD millionths already. */
  readonly usdcUsdMicros: number | null;
}

const UNKNOWN: WalletAmounts = {
  hbarTinybars: null,
  hbarUsdMicros: null,
  heldUsdMicros: null,
  totalUsdMicros: null,
  usdcUsdMicros: null,
};

const TINYBARS_PER_HBAR = 100_000_000;

/** A chain integer as a number, or null for anything that is not one. */
const integer = (units: string | null): number | null => {
  if (units === null || !/^\d+$/u.test(units)) {
    return null;
  }
  const parsed = Number(units);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const hbarValue = (
  wallet: WalletSummary,
  tinybars: number | null
): number | null => {
  if (wallet.hederaAccountId === null) {
    return 0;
  }
  const rate = wallet.balances.usdMicrosPerHbar;
  if (tinybars === null || rate === null || !(rate >= 0)) {
    return null;
  }
  return Math.round((tinybars / TINYBARS_PER_HBAR) * rate);
};

export const walletAmounts = (wallet: WalletSummary | null): WalletAmounts => {
  if (wallet === null) {
    return UNKNOWN;
  }
  const usdcUsdMicros = integer(wallet.balances.usdcUnits);
  const hbarTinybars = integer(wallet.balances.hbarTinybars);
  const hbarUsdMicros = hbarValue(wallet, hbarTinybars);
  const computed =
    usdcUsdMicros === null || hbarUsdMicros === null
      ? null
      : usdcUsdMicros + hbarUsdMicros;
  const total = wallet.totalUsdMicros ?? computed;
  return {
    hbarTinybars,
    hbarUsdMicros,
    heldUsdMicros: wallet.pocketUsdMicros,
    totalUsdMicros:
      total !== null && Number.isSafeInteger(total) ? total : null,
    usdcUsdMicros,
  };
};

/** Money held before an account exists is shown, so it is never hidden. */
export const showsHeld = (wallet: WalletSummary): boolean =>
  wallet.hederaAccountId === null && (wallet.pocketUsdMicros ?? 0) > 0;
