import type { PurchaseStatus } from "@froggy/domain";
import type { PurchaseTicket } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import type { ReactElement } from "react";

import type { PurchasesApi } from "../../hooks/use-purchases";
import { PurchaseDetails } from "./purchase-details";

const STATUS: Record<PurchaseStatus, string> = {
  probing: "Getting price",
  awaiting_approval: "Needs your approval",
  paying: "Payment in progress",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Approval expired",
  failed: "Failed",
  uncertain: "Payment uncertain",
};
const resultLabel = (purchase: PurchaseTicket): string => {
  if (
    purchase.payment.state === "uncertain" ||
    purchase.status === "uncertain"
  ) {
    return "Payment uncertain · do not buy again until checked";
  }
  if (purchase.payment.state === "settled") {
    const paid = purchase.stubbed ? "Simulated payment" : "Paid";
    if (purchase.delivery.state === "pending") {
      return `${paid} · waiting for the result`;
    }
    return purchase.delivery.state === "delivered"
      ? `${paid} · result delivered`
      : `${paid} · delivery failed`;
  }
  if (purchase.payment.state === "sent") {
    return "Payment sent · settlement not yet confirmed";
  }
  if (purchase.payment.state === "signed") {
    return "Payment signed · not yet sent";
  }
  if (
    purchase.delivery.state === "delivered" &&
    purchase.payment.state === "none"
  ) {
    return "Delivered · no payment";
  }
  return purchase.delivery.state === "failed"
    ? "Delivery failed · no payment confirmed"
    : STATUS[purchase.status];
};

export const PurchaseCancel = ({
  api,
  purchase,
}: {
  readonly api: PurchasesApi;
  readonly purchase: PurchaseTicket;
}): ReactElement | null => {
  if (purchase.status !== "paying") {
    return null;
  }
  const thisCancel =
    api.cancel.isPending && api.cancel.variables === purchase.id;
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="min-h-11 w-fit"
        disabled={api.cancel.isPending}
        onClick={() => {
          api.cancel.mutate(purchase.id);
        }}
        type="button"
        variant="outline"
      >
        {thisCancel ? "Cancelling…" : "Cancel payment"}
      </Button>
      {api.cancel.isError && api.cancel.variables === purchase.id ? (
        <p className="text-destructive text-sm" role="alert">
          {api.cancel.error.message} Try again to stop this purchase.
        </p>
      ) : null}
    </div>
  );
};

export const PurchaseResults = ({
  api,
}: {
  readonly api: PurchasesApi;
}): ReactElement => (
  <section aria-label="URL purchases" className="flex min-w-0 flex-col gap-3">
    <h3 className="text-section">Recent URL purchases</h3>
    {api.purchases.isPending ? (
      <p className="text-muted-foreground text-sm">Loading purchases…</p>
    ) : null}
    {api.purchases.isError ? (
      <p className="text-destructive text-sm" role="alert">
        {api.purchases.error.message}
      </p>
    ) : null}
    {api.purchases.data?.purchases.length === 0 ? (
      <p className="text-muted-foreground text-sm">
        Purchases from this workspace and your connected agents appear here.
      </p>
    ) : null}
    {api.purchases.data?.purchases.slice(0, 10).map((purchase) => (
      <Card key={purchase.id}>
        <CardHeader>
          <CardTitle>
            <h4 className="break-words">{purchase.purpose}</h4>
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={
                purchase.status === "uncertain" || purchase.status === "failed"
                  ? "destructive"
                  : "secondary"
              }
            >
              {STATUS[purchase.status]}
            </Badge>
            {purchase.stubbed ? (
              <Badge variant="outline">Simulated</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-3">
          <output className="font-medium">{resultLabel(purchase)}</output>
          <PurchaseCancel api={api} purchase={purchase} />
          {purchase.error === null ? null : (
            <p className="text-destructive break-words">{purchase.error}</p>
          )}
          <details>
            <summary className="focus-visible:outline-ring cursor-pointer rounded-sm underline-offset-4 hover:underline">
              Request & payment details
            </summary>
            <div className="mt-3 flex min-w-0 flex-col gap-3">
              <PurchaseDetails purchase={purchase} />
              <p className="text-machine break-all">Purchase: {purchase.id}</p>
              {purchase.payment.transactionId === null ? null : (
                <p className="text-machine break-all">
                  Transaction: {purchase.payment.transactionId}
                </p>
              )}
              {purchase.receiptId === null ? null : (
                <p className="text-machine break-all">
                  Receipt: {purchase.receiptId}
                </p>
              )}
              {purchase.delivery.status === null ? null : (
                <p>Response: HTTP {purchase.delivery.status}</p>
              )}
            </div>
          </details>
          {purchase.delivery.body === null ? null : (
            <details open={purchase.delivery.state === "delivered"}>
              <summary className="focus-visible:outline-ring cursor-pointer rounded-sm underline-offset-4 hover:underline">
                Response text
              </summary>
              <pre className="bg-muted text-machine mt-2 max-h-64 overflow-y-auto rounded-lg p-3 break-all whitespace-pre-wrap">
                {purchase.delivery.body}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    ))}
  </section>
);
