/**
 * Bounded x402 v2 messages, with legacy header aliases.
 *
 * A v2 challenge may arrive in `PAYMENT-REQUIRED` or as a JSON body. Older
 * header names are accepted, but this does not implement v1's different
 * requirements and payload shape. Every challenge is decoded before signing.
 */

import type { PaymentRequired } from "@x402/core/types";
import { Schema } from "effect";

import { PaymentChallenge } from "./types";

const MAX_CHALLENGE_BYTES = 65_536;
const MAX_CHALLENGE_HEADER_LENGTH = Math.ceil(MAX_CHALLENGE_BYTES / 3) * 4;
const isChallengeHeader = Schema.is(
  Schema.String.check(
    Schema.isMaxLength(MAX_CHALLENGE_HEADER_LENGTH),
    Schema.isPattern(
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
    )
  )
);
const WireChallenge = Schema.Struct({
  ...PaymentChallenge.fields,
  accepts: PaymentChallenge.fields.accepts.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(16)
  ),
  x402Version: Schema.Literal(2),
});

/** JSON text straight into the challenge, so nothing untyped sits in between. */
const decodeChallengeText = Schema.decodeUnknownResult(
  Schema.fromJsonString(WireChallenge)
);

const challengeBody = async (response: Response): Promise<string | null> => {
  if (response.body === null) {
    return null;
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_CHALLENGE_BYTES) {
      return null;
    }
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
};

/**
 * The challenge a 402 carries: the v2 header when present, else the body.
 * Null when neither decodes as an x402 challenge.
 */
export const challengeFrom = async (
  response: Response
): Promise<PaymentChallenge | null> => {
  try {
    const header = response.headers.get("payment-required");
    let text: string | null;
    if (header === null) {
      text = await challengeBody(response);
    } else {
      await response.body?.cancel();
      if (!isChallengeHeader(header)) {
        return null;
      }
      const bytes = Buffer.from(header, "base64");
      if (bytes.byteLength > MAX_CHALLENGE_BYTES) {
        return null;
      }
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    if (text === null) {
      return null;
    }
    const decoded = decodeChallengeText(text);
    return decoded._tag === "Failure" ? null : decoded.success;
  } catch {
    return null;
  }
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
