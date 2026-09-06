/**
 * What a Hedera payment header says about itself, read without trusting it.
 *
 * The seller records who paid and under which transaction id before any
 * work is done, and the buyer needs its own transaction id when a seller
 * goes silent after the header was sent. Both come from the signed
 * transaction inside the payload, which the SDK can decode; whether that
 * transaction is valid is still only the facilitator's to say.
 */

import {
  extractTransactionFromPayload,
  inspectHederaTransaction,
} from "@x402/hedera";
import { Schema } from "effect";

export interface PaymentDescription {
  /** The account whose transaction id this is: the payer. */
  readonly payer: string | null;
  /** `0.0.x@seconds.nanos`, as Hedera writes it. */
  readonly transactionId: string | null;
}

const NOTHING: PaymentDescription = { payer: null, transactionId: null };

/**
 * The envelope and the one field the SDK reads: the base64 transaction.
 * Its shape is `ExactHederaPayloadV2`, spelled out here so nothing is asserted.
 */
const Envelope = Schema.Struct({
  payload: Schema.Struct({ transaction: Schema.String }),
});
const decodeEnvelope = Schema.decodeUnknownResult(
  Schema.fromJsonString(Envelope)
);

/**
 * Never throws: a header that cannot be read describes nothing, and the
 * caller records nulls rather than refusing a payment the facilitator may
 * still accept.
 */
export const describePayment = (paymentHeader: string): PaymentDescription => {
  const text = Buffer.from(paymentHeader, "base64").toString("utf-8");
  const decoded = decodeEnvelope(text);
  if (decoded._tag === "Failure") {
    return NOTHING;
  }
  try {
    const inspected = inspectHederaTransaction(
      extractTransactionFromPayload(decoded.success.payload)
    );
    // The transaction id names whoever pays the network fee, which on a
    // facilitated payment is the facilitator; the payer is the account whose
    // HBAR (or token) leaves. That is who a receipt and a sale should name.
    const debit =
      inspected.hbarTransfers.find((entry) => BigInt(entry.amount) < 0n) ??
      Object.values(inspected.tokenTransfers)
        .flat()
        .find((entry) => BigInt(entry.amount) < 0n);
    return {
      payer: debit?.accountId ?? inspected.transactionIdAccountId,
      transactionId: inspected.transactionId,
    };
  } catch {
    return NOTHING;
  }
};
