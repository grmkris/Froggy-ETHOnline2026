/**
 * A seller's payment attempt and the work it purchases.
 *
 * A pending row may claim the proof before settlement; the work starts only
 * after settlement is confirmed. A buyer who paid and lost
 * the answer can present the same proof and get the same sale back rather
 * than paying again — and a buyer whose answer failed after settlement has a
 * record that says so, in place of a 500 and a debit.
 */

import { Schema } from "effect";

import { SaleId } from "./id";

/**
 * `pending` reserves a proof before settlement is attempted; `uncertain`
 * means that attempt cannot safely be repeated; `rejected` did not settle.
 * `settled` is accepted payment with work outstanding; `delivered` stores the
 * result; `failed` is delivery failure after confirmed settlement.
 */
export const SaleStatus = Schema.Literals([
  "pending",
  "uncertain",
  "rejected",
  "settled",
  "delivered",
  "failed",
]);
export type SaleStatus = typeof SaleStatus.Type;

export const Sale = Schema.Struct({
  /** In the asset's smallest unit, as the 402 demanded. */
  amount: Schema.String,
  asset: Schema.String,
  at: Schema.Int,
  deliveredAt: Schema.NullOr(Schema.Int),
  error: Schema.NullOr(Schema.String),
  id: SaleId,
  network: Schema.String,
  /** The paying account as the payload named it, or null when it could not be read. */
  payer: Schema.NullOr(Schema.String),
  /**
   * SHA-256 of the payment header, hex. The same proof presented twice finds
   * this row before the facilitator is asked again.
   */
  paymentHash: Schema.String,
  /** What was sold, as the 402 described it. */
  resource: Schema.String,
  /** The delivered document, once there is one. */
  result: Schema.NullOr(Schema.Unknown),
  status: SaleStatus,
  stubbed: Schema.Boolean,
  transactionId: Schema.NullOr(Schema.String),
});
export type Sale = typeof Sale.Type;
