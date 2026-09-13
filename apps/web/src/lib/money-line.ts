/**
 * The one line of money on Home: the dollar balance and how much of the
 * credits ever bought is still there.
 *
 * `spentUnits` is a lifetime count of captures, so available, held and spent
 * add up to everything ever funded; the gauge is the share of that still
 * unspent. A wallet the chain has not answered for shows its own words and
 * never a zero.
 */

import { formatUsd } from "@froggy/domain";
import type { WalletSummary } from "@froggy/protocol";

import { walletAmounts } from "./wallet-view";

export interface CreditGauge {
  /** Whole percent still spendable; at least 2 while any credit remains. */
  readonly leftPercent: number;
  /** Whole percent held on active work. */
  readonly heldPercent: number;
  /** The count for the label, "2,000" or "No credits yet". */
  readonly count: string;
  readonly empty: boolean;
}

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const percent = (units: number, total: number): number =>
  Math.round((units / total) * 100);

export const creditGauge = (summary: {
  readonly availableUnits: number;
  readonly reservedUnits: number;
  readonly spentUnits: number;
}): CreditGauge => {
  const total =
    summary.availableUnits + summary.reservedUnits + summary.spentUnits;
  if (total <= 0) {
    return {
      count: "No credits yet",
      empty: true,
      heldPercent: 0,
      leftPercent: 0,
    };
  }
  const left = percent(summary.availableUnits, total);
  const held = percent(summary.reservedUnits, total);
  return {
    count: number.format(summary.availableUnits / 10_000),
    empty: false,
    heldPercent: Math.min(held, 100 - left),
    leftPercent: summary.availableUnits > 0 ? Math.max(left, 2) : 0,
  };
};

export interface BalanceWords {
  readonly figure: string;
  readonly unavailable: boolean;
}

export const balanceWords = (wallet: WalletSummary): BalanceWords => {
  const { totalUsdMicros } = walletAmounts(wallet);
  if (totalUsdMicros !== null) {
    return { figure: formatUsd(totalUsdMicros), unavailable: false };
  }
  const label = wallet.balanceLabel.trim();
  return {
    figure: label === "" || label === "—" ? "Balance unavailable" : label,
    unavailable: true,
  };
};

/** The link's accessible name carries both figures, so the row reads as one place. */
export const moneyLineName = (
  balance: BalanceWords | null,
  gauge: CreditGauge | null
): string => {
  const parts: string[] = [];
  if (balance !== null) {
    parts.push(
      balance.unavailable ? balance.figure : `${balance.figure} balance`
    );
  }
  if (gauge !== null) {
    parts.push(gauge.empty ? gauge.count : `${gauge.count} credits left`);
  }
  return parts.length === 0 ? "Your money" : `Your money: ${parts.join(", ")}`;
};
