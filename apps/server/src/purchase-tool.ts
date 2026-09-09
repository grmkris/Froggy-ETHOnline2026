import { PurchaseRequest } from "@froggy/protocol";
import type { PurchaseTicket } from "@froggy/protocol";
import { Struct } from "effect";

/** Agents can request and inspect a purchase, but cannot answer its approval. */
export const PurchaseToolInput = PurchaseRequest.mapFields(Struct.omit(["v"]));

/** No signing parameters, credentials, or redeemable payment proof reach a tool. */
export const purchaseToolResult = (purchase: PurchaseTicket) => ({
  v: 1,
  id: purchase.id,
  status: purchase.status,
  purpose: purchase.purpose,
  url: purchase.request.url,
  method: purchase.request.method,
  approvalRequired: purchase.status === "awaiting_approval",
  approvalPhase: purchase.quote === null ? "send_input" : "payment",
  expiresAt: purchase.expiresAt,
  quote:
    purchase.quote === null
      ? null
      : {
          amount: purchase.quote.amount,
          origin: purchase.quote.origin,
          payTo: purchase.quote.payTo,
          usdMicros: purchase.quote.usdMicros,
        },
  payment: {
    state: purchase.payment.state,
    transactionId: purchase.payment.transactionId,
  },
  delivery: {
    state: purchase.delivery.state,
    status: purchase.delivery.status,
    body: purchase.delivery.body?.slice(0, 16_000) ?? null,
    truncated: (purchase.delivery.body?.length ?? 0) > 16_000,
  },
  receiptId: purchase.receiptId,
  error: purchase.error,
  stubbed: purchase.stubbed,
});
