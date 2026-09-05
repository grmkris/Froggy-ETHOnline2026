/**
 * x402 on the wire, both dialects.
 *
 * Version 1 carried the challenge in the 402 body and the payment in
 * `X-PAYMENT`; version 2 moved them to `PAYMENT-REQUIRED` and
 * `PAYMENT-SIGNATURE`, base64 JSON either way. Sellers in the wild speak one
 * or the other — The Graph's gateway is v2 with an empty body — so the buyer
 * reads both and the seller writes both. Nothing here is trusted beyond its
 * shape; every challenge is decoded before a payer sees it.
 */

import type { PaymentRequired } from "@x402/core/types";
import { Schema } from "effect";

import { PaymentChallenge } from "./types";

/** JSON text straight into the challenge, so nothing untyped sits in between. */
const decodeChallengeText = Schema.decodeUnknownResult(
  Schema.fromJsonString(PaymentChallenge)
);

const base64Text = (value: string): string =>
  Buffer.from(value, "base64").toString("utf-8");

/**
 * The challenge a 402 carries: the v2 header when present, else the body.
 * Null when neither decodes as an x402 challenge.
 */
export const challengeFrom = async (
  response: Response
): Promise<PaymentChallenge | null> => {
  const header = response.headers.get("payment-required");
  const text =
    header === null
      ? await response.text().catch(() => "")
      : base64Text(header);
  const decoded = decodeChallengeText(text);
  return decoded._tag === "Failure" ? null : decoded.success;
};

/** The payment under both names, so either kind of seller reads it. */
export interface PaymentHeaders {
  readonly "payment-signature": string;
  readonly "x-payment": string;
}

export const paymentHeaders = (payment: string): PaymentHeaders => ({
  "payment-signature": payment,
  "x-payment": payment,
});

/** The payment a buyer sent us, whichever header they used. */
export const paymentFrom = (headers: Headers): string | null =>
  headers.get("payment-signature") ?? headers.get("x-payment");

/** The settlement a seller sent back, whichever header they used. */
export const settlementHeaderFrom = (headers: Headers): string | null =>
  headers.get("payment-response") ?? headers.get("x-payment-response");

/** Base64 JSON, for the v2 `PAYMENT-REQUIRED` header. */
export const encodeChallengeHeader = (challenge: PaymentRequired): string =>
  Buffer.from(JSON.stringify(challenge), "utf-8").toString("base64");
