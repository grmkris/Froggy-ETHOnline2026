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
import type { ExactHederaPayloadV2 } from "@x402/hedera";
import { Schema } from "effect";

export interface PaymentDescription {
  /** The account whose transaction id this is: the payer. */
  readonly payer: string | null;
  /** `0.0.x@seconds.nanos`, as Hedera writes it. */
  readonly transactionId: string | null;
}

const NOTHING: PaymentDescription = { payer: null, transactionId: null };

/** Only the envelope; the SDK reads the transaction inside `payload`. */
const Envelope = Schema.Struct({ payload: Schema.Unknown });
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
    // SAFETY: the SDK's own type for the Hedera payload, checked by the SDK
    // itself on the next line; a payload of any other shape throws there and
    // is reported as nothing rather than as a wrong answer.
    const inner = decoded.success.payload as ExactHederaPayloadV2;
    const inspected = inspectHederaTransaction(
      extractTransactionFromPayload(inner)
    );
    return {
      payer: inspected.transactionIdAccountId,
      transactionId: inspected.transactionId,
    };
  } catch {
    return NOTHING;
  }
};
