/** Everything the wallet has done or refused, newest first. */

import type { Receipt } from "@froggy/domain";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { ReceiptTextIcon } from "lucide-react";
import type { ReactElement } from "react";

import { ReceiptTicket } from "../cards/receipt-ticket";

export const WalletActivity = ({
  receipts,
}: {
  readonly receipts: readonly Receipt[];
}): ReactElement => (
  <section aria-label="Activity" className="flex flex-col gap-3" id="activity">
    <h2 className="text-section">Activity</h2>
    {receipts.length === 0 ? (
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
    ) : (
      <div className="flex flex-col gap-2">
        {receipts.map((receipt) => (
          <ReceiptTicket compact key={receipt.id} receipt={receipt} />
        ))}
      </div>
    )}
  </section>
);
