import {
  ApprovalId,
  HistoryRecord,
  PurchaseId,
  Receipt,
  ReceiptId,
  SaleId,
  TaskId,
} from "@froggy/domain";
import { Schema } from "effect";

export const HistoryBusiness = Schema.Struct({
  kind: Schema.Literals(["purchase", "task"]),
  id: Schema.Union([PurchaseId, TaskId]),
  status: Schema.String,
  payment: Schema.NullOr(Schema.String),
  delivery: Schema.String,
  quotedUsdMicros: Schema.NullOr(Schema.Number),
  receiptIds: Schema.Array(ReceiptId),
  saleId: Schema.NullOr(SaleId),
  approval: Schema.NullOr(
    Schema.Struct({
      id: ApprovalId,
      expiresAt: Schema.Number,
      status: Schema.String,
    })
  ),
  error: Schema.NullOr(Schema.String),
});
export type HistoryBusiness = typeof HistoryBusiness.Type;
export const HistoryDetail = Schema.Struct({
  v: Schema.Literal(1),
  record: HistoryRecord,
  related: Schema.Array(HistoryRecord),
  receipts: Schema.Array(Receipt),
  business: Schema.Array(HistoryBusiness),
});
export type HistoryDetail = typeof HistoryDetail.Type;
export const HistoryUpdate = Schema.Struct({
  v: Schema.Literal(1),
  revision: Schema.Int,
  title: Schema.optional(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))
  ),
  archived: Schema.optional(Schema.Boolean),
});
