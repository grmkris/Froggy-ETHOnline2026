/**
 * What waits on the person, on the page where they came to look: purchases
 * to approve, trade steps to sign, and what Froggy will do later with the
 * one button that cancels each. Approvals are never invented here; every
 * ticket is the same component the workspace already answers with.
 */

import type { ReactElement } from "react";

import { usePurchases } from "../../hooks/use-purchases";
import { useServiceApi } from "../../hooks/use-service-api";
import { useTrades } from "../../hooks/use-trades";
import { useWorkspace } from "../../lib/workspace-context";
import { PurchaseApprovals } from "../purchases/purchase-approvals";
import { LaunchWatchList } from "../services/launch-watch-list";
import { ScheduleList } from "../settings/schedule-list";
import { TradeReview } from "../trading/trade-review";

const WAITING = new Set(["awaiting_approval", "executing", "uncertain"]);

export const NeedsYou = (): ReactElement => {
  const { app } = useWorkspace();
  const purchases = usePurchases(app.sessionId);
  const trades = useTrades(app.sessionId);
  const services = useServiceApi(undefined, false);
  const waitingTrades =
    trades.trades.data?.trades.filter((trade) => WAITING.has(trade.status)) ??
    [];
  const waitingPurchases =
    purchases.purchases.data?.purchases.some(
      (purchase) =>
        purchase.status === "awaiting_approval" || purchase.status === "paying"
    ) ?? false;
  return (
    <>
      {waitingPurchases ||
      waitingTrades.length > 0 ||
      purchases.purchases.isError ? (
        <section aria-label="Needs you" className="flex flex-col gap-4">
          <h3 className="text-section">Needs you</h3>
          <PurchaseApprovals api={purchases} inline />
          {waitingTrades.length > 0 ? (
            <div aria-label="Trades waiting" className="flex flex-col gap-3">
              {waitingTrades.map((trade) => (
                <TradeReview api={trades} key={trade.id} trade={trade} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      <section aria-label="Coming up" className="flex flex-col gap-4">
        <h3 className="text-section">Coming up</h3>
        <ScheduleList compact />
        <LaunchWatchList api={services.api} />
      </section>
    </>
  );
};
