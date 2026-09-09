import {
  ApprovalId,
  Network,
  Purchase,
  PurchaseHttpRequest,
  PURCHASE_MAX_USD_MICROS,
} from "@froggy/domain";
import { Schema } from "effect";

export const PurchaseRequest = Schema.Struct({
  v: Schema.Literals([1]),
  url: PurchaseHttpRequest.fields.url,
  method: Schema.optional(PurchaseHttpRequest.fields.method),
  body: Schema.optional(PurchaseHttpRequest.fields.body),
  purpose: Purchase.fields.purpose,
  idempotencyKey: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128)
  ),
  maxUsdMicros: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: PURCHASE_MAX_USD_MICROS })
  ),
  network: Schema.optional(Network),
});
export type PurchaseRequest = typeof PurchaseRequest.Type;

export const PurchaseTicket = Schema.Struct({
  v: Schema.Literals([1]),
  ...Purchase.fields,
});
export type PurchaseTicket = typeof PurchaseTicket.Type;
export const PurchaseList = Schema.Struct({
  v: Schema.Literals([1]),
  purchases: Schema.Array(PurchaseTicket).check(Schema.isMaxLength(50)),
});
export const PurchaseAnswer = Schema.Struct({
  v: Schema.Literals([1]),
  approvalId: ApprovalId,
  decision: Schema.Literals(["allow_once", "deny", "deny_stop"]),
});
export type PurchaseAnswer = typeof PurchaseAnswer.Type;

export const PurchaseWallets = Schema.Struct({
  v: Schema.Literals([1]),
  stubbed: Schema.Boolean,
  networks: Schema.Array(
    Schema.Struct({
      network: Network,
      address: Schema.NullOr(Schema.String),
      balanceUnits: Schema.NullOr(Schema.String),
      symbol: Schema.String,
      ready: Schema.Boolean,
      note: Schema.String,
    })
  ),
});
export type PurchaseWallets = typeof PurchaseWallets.Type;
