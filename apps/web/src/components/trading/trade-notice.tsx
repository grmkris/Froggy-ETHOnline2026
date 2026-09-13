/** One line, anywhere in the workspace, when a trade waits for the person. */

import { buttonVariants } from "@froggy/ui/components/button";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import type { TradesApi } from "../../hooks/use-trades";

export const TradeNotice = ({
  api,
}: {
  readonly api: TradesApi;
}): ReactElement | null => {
  const pending =
    api.trades.data?.trades.filter(
      (trade) => trade.status === "awaiting_approval"
    ) ?? [];
  if (pending.length === 0) {
    return null;
  }
  return (
    <output className="border-border bg-background flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-[26px] py-3">
      <span className="text-sm">
        {pending.length === 1
          ? "A trade is ready for your review."
          : `${pending.length} trades are ready for your review.`}
      </span>
      <Link
        className={buttonVariants({ variant: "outline", size: "sm" })}
        search={{}}
        to="/activity"
      >
        Review trades
      </Link>
    </output>
  );
};
