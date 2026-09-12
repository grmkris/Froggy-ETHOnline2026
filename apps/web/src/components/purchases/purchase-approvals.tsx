import type {
  ApprovalRequest,
  PurchaseAnswer,
  PurchaseTicket,
} from "@froggy/protocol";
import { useRef } from "react";
import type { ReactElement } from "react";

import type { PurchasesApi } from "../../hooks/use-purchases";
import { ApprovalTicket } from "../cards/approval-ticket";
import { PurchaseDetails } from "./purchase-details";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

const approvalFor = (purchase: PurchaseTicket): ApprovalRequest => ({
  id: purchase.approvalId,
  amountLabel:
    purchase.quote === null
      ? "$0"
      : dollars.format(purchase.quote.usdMicros / 1_000_000),
  detail:
    purchase.quote === null
      ? `Send this input to get a price. Payment needs a second approval. Request: ${purchase.purpose}`
      : `Pay once for this exact request. Request: ${purchase.purpose}`,
  expiresAt: purchase.expiresAt,
  payeeLabel: new URL(purchase.request.url).host,
  purpose: purchase.purpose,
  title:
    purchase.quote === null
      ? "Send input and get price"
      : "Approve URL purchase",
  options: [
    { id: "deny_stop", kind: "deny_stop", label: "Stop the agent" },
    { id: "deny", kind: "deny", label: "Not this time" },
    {
      id: "allow_once",
      kind: "allow_once",
      label:
        purchase.quote === null
          ? "Allow once"
          : `Approve ${dollars.format(purchase.quote.usdMicros / 1_000_000)}`,
    },
  ],
});

export const PurchaseApprovals = ({
  api,
}: {
  readonly api: PurchasesApi;
}): ReactElement | null => {
  const answering = useRef(false);
  const pending =
    api.purchases.data?.purchases.filter(
      (purchase) => purchase.status === "awaiting_approval"
    ) ?? [];
  if (pending.length === 0 && !api.purchases.isError) {
    return null;
  }
  const answer = (
    purchase: PurchaseTicket,
    decision: PurchaseAnswer["decision"]
  ): void => {
    if (answering.current) {
      return;
    }
    answering.current = true;
    api.answer.mutate(
      {
        id: purchase.id,
        answer: { v: 1, approvalId: purchase.approvalId, decision },
      },
      {
        onSettled: () => {
          answering.current = false;
        },
      }
    );
  };
  return (
    <section
      aria-label="Purchase approvals"
      className="border-border bg-background max-h-[45dvh] shrink-0 overflow-y-auto overscroll-contain border-b px-[26px] py-3"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3">
        {api.purchases.isError ? (
          <p className="text-destructive text-sm" role="alert">
            Couldn’t refresh purchase approvals. {api.purchases.error.message}
          </p>
        ) : null}
        {api.answer.isError ? (
          <p className="text-destructive text-sm" role="alert">
            {api.answer.error.message} The purchase status is being refreshed.
          </p>
        ) : null}
        {pending.map((purchase) => (
          <div
            className="flex min-w-0 flex-col gap-3 [overflow-wrap:anywhere]"
            key={purchase.approvalId}
          >
            <PurchaseDetails purchase={purchase} />
            <ApprovalTicket
              disabled={api.answer.isPending || api.purchases.isError}
              onAnswer={(_id, decision) => {
                if (
                  decision === "allow_once" ||
                  decision === "deny" ||
                  decision === "deny_stop"
                ) {
                  answer(purchase, decision);
                }
              }}
              request={approvalFor(purchase)}
            />
          </div>
        ))}
      </div>
    </section>
  );
};
