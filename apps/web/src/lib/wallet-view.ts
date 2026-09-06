import type { WalletSummary } from "@froggy/protocol";

/** Unknown or unrepresentable amounts must not become a complete-looking total. */
export const walletAmounts = (wallet: WalletSummary | null) => {
  const units = wallet?.balances.usdcUnits;
  const parsed =
    units !== null && units !== undefined && /^\d+$/u.test(units)
      ? Number(units)
      : null;
  const funds =
    parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0
      ? parsed
      : null;
  const credit = wallet?.pocketUsdMicros ?? null;
  const sum = funds === null || credit === null ? null : funds + credit;
  return {
    credit,
    funds,
    total: sum !== null && Number.isSafeInteger(sum) ? sum : null,
  };
};
