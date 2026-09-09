/** Everything the wallet has done or refused, newest first. */

import type { Receipt } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { ReceiptTextIcon } from "lucide-react";
import type { ReactElement } from "react";

import type { ReceiptsBackfill } from "../../hooks/use-receipts";
import { ReceiptTicket } from "../cards/receipt-ticket";
import { MotionItem, useArrivalDelays } from "../motion-item";

export const WalletActivity = ({
  history,
  receipts,
}: {
  readonly history: ReceiptsBackfill;
  readonly receipts: readonly Receipt[];
}): ReactElement => {
  const delays = useArrivalDelays(receipts.map((receipt) => receipt.id));
  return (
    <section
      aria-label="Activity"
      className="flex flex-col gap-3"
      id="activity"
    >
      <h2 className="text-section">Activity</h2>
      {history.loading && receipts.length === 0 ? (
        <output
          aria-label="Loading wallet activity"
          className="flex flex-col gap-2"
        >
          <Skeleton aria-hidden className="h-20 w-full rounded-xl" />
          <Skeleton aria-hidden className="h-20 w-full rounded-xl" />
          <span className="sr-only">Loading wallet activity</span>
        </output>
      ) : null}
      {history.failed ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground text-sm" role="alert">
            Couldn’t load earlier activity. Your wallet is still available.
          </p>
          <Button
            onClick={() => {
              history.retry();
            }}
            size="sm"
            variant="outline"
          >
            Retry activity
          </Button>
        </div>
      ) : null}
      {receipts.length === 0 && !history.loading && !history.failed ? (
        <Empty className="py-[26px]">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptTextIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Nothing spent or refused yet.</EmptyTitle>
            <EmptyDescription>
              Every payment and every refusal lands here with its receipt.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {receipts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {receipts.map((receipt) => (
            <MotionItem
              delay={delays.get(receipt.id) ?? 0}
              key={receipt.id}
              spring
            >
              <ReceiptTicket compact receipt={receipt} />
            </MotionItem>
          ))}
        </div>
      ) : null}
    </section>
  );
};
