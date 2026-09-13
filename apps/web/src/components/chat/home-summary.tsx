import { formatUsd } from "@froggy/domain";
import { Badge } from "@froggy/ui/components/badge";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, WalletIcon } from "lucide-react";
import type { ReactElement } from "react";

import { walletAmounts } from "../../lib/wallet-view";
import { useWorkspace } from "../../lib/workspace-context";

/** Funding balances are not holdings valuation or reservation-adjusted buying power. */
export const HomeSummary = (): ReactElement => {
  const { app } = useWorkspace();
  const total = walletAmounts(app.wallet).totalUsdMicros;
  let amount = "Loading…";
  if (app.wallet !== null) {
    amount = total === null ? "Unavailable" : formatUsd(total);
  }
  return (
    <Link
      aria-label="Your money"
      className="bg-card border-border focus-visible:ring-ring mx-4 my-2 flex items-center gap-3 rounded-2xl border px-4 py-3 outline-none focus-visible:ring-2 sm:mx-6"
      to="/wallet"
    >
      <span className="bg-brand-soft text-brand hidden size-9 shrink-0 place-items-center rounded-xl sm:grid">
        <WalletIcon aria-hidden className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium whitespace-nowrap">
          Your money
        </span>
        <span className="text-muted-foreground text-[11px]">USDC + HBAR</span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <span className="text-base font-semibold tracking-tight tabular-nums">
          {amount}
        </span>
        {app.modes?.privy === "stub" || app.modes?.hedera === "stub" ? (
          <Badge variant="outline">Simulated</Badge>
        ) : null}
      </span>
      <ArrowUpRightIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
    </Link>
  );
};
