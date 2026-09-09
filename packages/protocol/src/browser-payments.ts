/**
 * What a page asks for when it demands payment, and what answering it produced.
 *
 * These live in the protocol package rather than in the browser package because
 * the browser observes them and the wallet decides on them, and those two
 * packages are forbidden from importing each other — `tools/graph.ts` enforces
 * it. Every field here is a protocol fact from one top-level navigation. None
 * of it is page text, and none of it may become a payee.
 *
 * Every limit below is a cap on what a hostile page can push into a prompt, a
 * decision or the replay buffer.
 */

import { BrowserPaymentId, TabId } from "@froggy/domain";
import { Schema } from "effect";

/** Why an agent operation unblocked: the human was quiet, went quiet, or never did. */
export const WaitReason = Schema.Literals(["skipped", "idle", "timeout"]);
export type WaitReason = typeof WaitReason.Type;

export const BROWSER_PAYMENT_CHALLENGE_LIMIT = 32_768;
export const BROWSER_PAYMENT_BODY_LIMIT = 65_536;
export const BROWSER_PAYMENT_URL_LIMIT = 8192;

const PaymentHeader = Schema.String.check(
  Schema.isMaxLength(BROWSER_PAYMENT_CHALLENGE_LIMIT)
);
const PaymentUrl = Schema.String.check(
  Schema.isMaxLength(BROWSER_PAYMENT_URL_LIMIT)
);

/** Protocol facts from one top-level GET; never page text or browser credentials. */
export const BrowserPaymentRequest = Schema.Struct({
  id: BrowserPaymentId,
  tabId: TabId,
  url: PaymentUrl,
  method: Schema.Literals(["GET"]),
  paymentRequired: Schema.NullOr(PaymentHeader),
  body: Schema.String.check(
    Schema.isMaxLength(BROWSER_PAYMENT_CHALLENGE_LIMIT)
  ),
  observedAt: Schema.Int,
});
export type BrowserPaymentRequest = typeof BrowserPaymentRequest.Type;

/** The signature is a capability: it never leaves the server, and it is bound to one observed request. */
export const BrowserPaymentReplay = Schema.Struct({
  id: BrowserPaymentId,
  paymentHeader: PaymentHeader.check(Schema.isMinLength(1)),
});
export type BrowserPaymentReplay = typeof BrowserPaymentReplay.Type;

export const BrowserPaymentResult = Schema.Struct({
  sent: Schema.Boolean,
  status: Schema.NullOr(Schema.Int),
  url: PaymentUrl,
  paymentResponse: Schema.NullOr(PaymentHeader),
  body: Schema.String.check(Schema.isMaxLength(BROWSER_PAYMENT_BODY_LIMIT)),
  error: Schema.NullOr(Schema.String.check(Schema.isMaxLength(1000))),
});
export type BrowserPaymentResult = typeof BrowserPaymentResult.Type;
