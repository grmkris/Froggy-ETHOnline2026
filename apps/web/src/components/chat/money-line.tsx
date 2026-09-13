/**
 * One line of money above Home's first screen: the dollar balance, then how
 * much of the credits ever bought is still there. The whole row is the way to
 * Your money. Loading keeps the row's height so the headline beneath it never
 * moves when the figures arrive.
 */

import { Skeleton } from "@froggy/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { useCredits } from "../../hooks/use-credits";
import { balanceWords, creditGauge, moneyLineName } from "../../lib/money-line";
import { useWorkspace } from "../../lib/workspace-context";

export const MoneyLine = (): ReactElement => {
  const { app } = useWorkspace();
  const { summary } = useCredits();
  const balance = app.wallet === null ? null : balanceWords(app.wallet);
  const gauge = summary.data === undefined ? null : creditGauge(summary.data);
  return (
    <Link
      aria-label={moneyLineName(balance, gauge)}
      className="money-line mx-auto w-full max-w-3xl px-4 sm:px-6"
      data-slot="money-line"
      to="/wallet"
    >
      {balance === null ? (
        <Skeleton aria-hidden className="h-7 w-20 rounded-md" />
      ) : (
        <span
          className="money-figure min-w-0 truncate"
          data-unavailable={balance.unavailable ? "" : undefined}
        >
          {balance.figure}
        </span>
      )}
      {balance === null || balance.unavailable ? null : (
        <span className="money-label">Balance</span>
      )}
      <span aria-hidden className="ml-auto flex shrink-0 items-center gap-2.5">
        {gauge === null ? (
          <Skeleton className="h-3 w-28 rounded-full" />
        ) : (
          <>
            {gauge.empty ? null : <span className="money-label">Credits</span>}
            <span className="credit-gauge">
              <span
                className="credit-gauge-left"
                style={{ width: `${gauge.leftPercent}%` }}
              />
              {gauge.heldPercent > 0 ? (
                <span
                  className="credit-gauge-held"
                  style={{ width: `${gauge.heldPercent}%` }}
                />
              ) : null}
            </span>
            <span className="money-count">{gauge.count}</span>
          </>
        )}
        <span className="money-label money-line-more">Your money ↗</span>
      </span>
    </Link>
  );
};
