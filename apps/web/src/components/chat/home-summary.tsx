import { Badge } from "@froggy/ui/components/badge";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, WalletIcon } from "lucide-react";
import type { ReactElement } from "react";

import { useCredits } from "../../hooks/use-credits";
import { formatCredits } from "../../lib/credit-view";
import { RecentUpdates } from "../watchlist/recent-updates";

/** Show the available tool budget before a conversation starts. */
export const HomeSummary = (): ReactElement => {
  const { summary } = useCredits();
  let amount = "Loading…";
  if (!summary.isPending) {
    amount = summary.data
      ? formatCredits(summary.data.availableUnits)
      : "Unavailable";
  }
  return (
    <>
      <Link
        aria-label="Your credits"
        className="bg-card border-border focus-visible:ring-ring mx-4 my-2 flex items-center gap-3 rounded-2xl border px-4 py-3 outline-none focus-visible:ring-2 sm:mx-6"
        to="/wallet"
      >
        <span className="bg-brand-soft text-brand hidden size-9 shrink-0 place-items-center rounded-xl sm:grid">
          <WalletIcon aria-hidden className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium whitespace-nowrap">
            Your credits
          </span>
          <span className="text-muted-foreground text-[11px]">
            Tools and browser tasks
          </span>
        </span>
        <span className="flex flex-col items-end gap-0.5">
          <span className="text-base font-semibold tracking-tight tabular-nums">
            {amount}
          </span>
          {summary.data?.stubbed === true ? (
            <Badge variant="outline">Simulated</Badge>
          ) : null}
        </span>
        <ArrowUpRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </Link>
      <div className="mx-4 my-2 sm:mx-6">
        <RecentUpdates limit={3} />
      </div>
    </>
  );
};
