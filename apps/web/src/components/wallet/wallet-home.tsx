/**
 * The wallet as one number.
 *
 * USDC on Base and HBAR on Hedera, added up in dollars, with the breakdown a
 * disclosure away. Money the chain has not answered for is "unavailable",
 * never zero, and never quietly left out of the total.
 */

import { formatUsd } from "@froggy/domain";
import type { ServiceModes, WalletSummary } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import { WalletIcon } from "lucide-react";
import type { ReactElement } from "react";

import { stubsOf } from "../../lib/stubs";
import { walletAmounts } from "../../lib/wallet-view";
import { AddFunds } from "./add-funds";
import { WalletBreakdown } from "./wallet-breakdown";

const WalletTotal = ({ value }: { readonly value: number }): ReactElement => (
  <p className="text-money mt-2 tabular-nums" data-slot="wallet-total">
    {formatUsd(value)}
  </p>
);

const WalletBalance = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  if (wallet === null) {
    return (
      <output
        aria-label="Loading wallet balance"
        className="mt-2 flex h-9 items-center"
      >
        <Skeleton aria-hidden className="h-8 w-48" />
        <span className="sr-only">Loading wallet balance</span>
      </output>
    );
  }
  const { totalUsdMicros } = walletAmounts(wallet);
  return totalUsdMicros === null ? (
    <p className="text-money mt-2 tabular-nums">Total unavailable</p>
  ) : (
    <WalletTotal value={totalUsdMicros} />
  );
};

const balanceDescription = (wallet: WalletSummary | null): string => {
  if (wallet === null) {
    return "Loading your balances…";
  }
  return walletAmounts(wallet).totalUsdMicros === null
    ? "Known balances are shown below. An unavailable balance is not zero."
    : "USDC on Base and HBAR on Hedera, in dollars.";
};

const balanceUnavailableLabel = (wallet: WalletSummary): string | null =>
  wallet.totalUsdMicros === null &&
  wallet.balanceLabel !== "" &&
  wallet.balanceLabel !== "—"
    ? wallet.balanceLabel
    : null;

const StubChips = ({
  modes,
}: {
  readonly modes: ServiceModes | null;
}): ReactElement | null => {
  const stubs = stubsOf(modes);
  if (stubs.length === 0) {
    return null;
  }
  return (
    <ul aria-label="Stubbed integrations" className="flex flex-wrap gap-1.5">
      {stubs.map((name) => (
        <li key={name}>
          <Badge
            className="border-drive-agent/60 text-drive-agent-foreground text-[10px] uppercase"
            variant="outline"
          >
            {name} stub
          </Badge>
        </li>
      ))}
    </ul>
  );
};

export const WalletHome = ({
  modes,
  wallet,
}: {
  readonly modes: ServiceModes | null;
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  const amounts = walletAmounts(wallet);
  const unavailable = wallet === null ? null : balanceUnavailableLabel(wallet);
  return (
    <section
      aria-label="Wallet"
      className="bg-card shadow-card relative flex flex-col gap-[18px] rounded-2xl p-[18px]"
    >
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="bg-brand-soft text-brand grid size-10 place-items-center rounded-xl">
            <WalletIcon aria-hidden className="size-5" />
          </span>
          <span className="text-machine text-muted-foreground">
            USDC + HBAR
          </span>
        </div>
        <h2 className="text-muted-foreground text-sm font-medium">
          Your wallet
        </h2>
        <WalletBalance wallet={wallet} />
        <p className="text-muted-foreground mt-2 min-h-8 text-xs">
          {unavailable ?? balanceDescription(wallet)}
        </p>
        {wallet?.ledgerNote === null || wallet === null ? null : (
          <output className="text-refused mt-2 text-xs">
            {wallet.ledgerNote}
          </output>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <AddFunds wallet={wallet} />
        <Link
          to="/settings"
          hash="spending"
          className="text-brand inline-flex min-h-11 items-center px-3 text-sm font-medium"
        >
          Spending rules
        </Link>
      </div>
      <StubChips modes={modes} />
      {wallet === null ? (
        <div aria-hidden className="border-t pt-4">
          <div className="flex min-h-11 items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-4" />
          </div>
        </div>
      ) : (
        <WalletBreakdown amounts={amounts} wallet={wallet} />
      )}
    </section>
  );
};
