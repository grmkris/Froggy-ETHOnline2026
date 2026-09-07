/**
 * The wallet as one number.
 *
 * USDC on Base and HBAR on Hedera, added up in dollars, with the breakdown a
 * disclosure away. Money the chain has not answered for is "unavailable",
 * never zero, and never quietly left out of the total.
 */

import { formatUsd } from "@froggy/domain";
import type { WalletSummary } from "@froggy/protocol";
import { buttonVariants } from "@froggy/ui/components/button";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { walletAmounts } from "../../lib/wallet-view";
import { AddFunds } from "./add-funds";
import { WalletBreakdown } from "./wallet-breakdown";

export const WalletHome = ({
  wallet,
}: {
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  const amounts = walletAmounts(wallet);
  const { totalUsdMicros } = amounts;
  return (
    <section
      aria-label="Wallet"
      className="bg-card shadow-card flex flex-col gap-5 rounded-2xl border p-4 sm:gap-6 sm:p-6"
    >
      <div>
        <h2 className="text-muted-foreground text-sm font-medium">
          Your wallet
        </h2>
        <p className="text-money mt-2 text-[2rem] leading-9 tabular-nums sm:text-[2.5rem] sm:leading-11">
          {totalUsdMicros === null
            ? "Total unavailable"
            : formatUsd(totalUsdMicros)}
        </p>
        <p className="text-muted-foreground mt-2 text-xs">
          {totalUsdMicros === null
            ? "Known balances are shown below. An unavailable balance is not zero."
            : "USDC on Base and HBAR on Hedera, in dollars."}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <AddFunds wallet={wallet} />
        <Link
          className={`${buttonVariants({ variant: "outline" })} min-h-11 px-4`}
          to="/agents"
        >
          Connect an agent
        </Link>
      </div>
      {wallet === null ? null : (
        <WalletBreakdown amounts={amounts} wallet={wallet} />
      )}
    </section>
  );
};
