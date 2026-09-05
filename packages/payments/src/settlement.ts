/**
 * The `x-payment-response` header, both ways.
 *
 * x402 hands the settlement back to the payer as a base64 JSON envelope —
 * `{ success, transaction, network, payer? }` — and the earlier version of
 * this server read the header as a bare transaction id, which only ever
 * worked against itself. Our own oracle now sends the envelope, and the
 * agent decodes one; a bare id from an older or looser seller is still
 * accepted as a transaction id with no network, rather than dropped.
 */

import {
  decodePaymentResponseHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { Schema } from "effect";

export interface SettlementHeader {
  readonly network: string | null;
  readonly transactionId: string;
}

const SettleEnvelope = Schema.Struct({
  network: Schema.optional(Schema.String),
  success: Schema.Boolean,
  transaction: Schema.String,
});
const decodeEnvelope = Schema.decodeUnknownResult(SettleEnvelope);

export const encodeSettlementHeader = (input: {
  /** CAIP-2, as the SDK's `SettleResponse` requires it. */
  readonly network: `${string}:${string}`;
  readonly transactionId: string;
}): string =>
  encodePaymentResponseHeader({
    network: input.network,
    success: true,
    transaction: input.transactionId,
  });

export const decodeSettlementHeader = (
  header: string | null
): SettlementHeader | null => {
  if (header === null || header.trim() === "") {
    return null;
  }
  let raw: unknown;
  try {
    raw = decodePaymentResponseHeader(header);
  } catch {
    // Not the envelope. A bare id is the older convention and still names
    // the transaction; anything else is noise.
    return /^[\w.@:-]{4,}$/u.test(header)
      ? { network: null, transactionId: header }
      : null;
  }
  const decoded = decodeEnvelope(raw);
  if (decoded._tag === "Failure" || !decoded.success.success) {
    return null;
  }
  return {
    network: decoded.success.network ?? null,
    transactionId: decoded.success.transaction,
  };
};
