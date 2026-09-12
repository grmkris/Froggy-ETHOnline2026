import type { Receipt } from "@froggy/domain";

const STUBBED_COPY =
  "Nothing was paid. This receipt exists so a demo cannot be mistaken for a purchase.";

const PRICE_CHANGED_COPY =
  "Your approval does not cover this. Nothing was paid.";

const UNCERTAIN_COPY = "Outcome not yet known.";

const UNCERTAIN_FOLLOW_UP =
  "The payment may have gone through. Froggy will not try again and will not switch payment method until this is resolved.";

/** Authorization and settlement are separate facts, on every receipt surface. */
export const receiptStatus = (receipt: Receipt): string => {
  if (receipt.decision._tag === "deny") {
    return receipt.decision.code === "price_changed"
      ? "Price changed"
      : "Refused";
  }
  if (receipt.decision._tag === "ask") {
    return "Approval required";
  }
  if (receipt.stubbed) {
    return "Stubbed";
  }
  if (receipt.settlement !== undefined) {
    return "Confirmed";
  }
  return receipt.failure === undefined
    ? "Allowed, not settled"
    : "Outcome not yet known";
};

export const receiptHeadline = (receipt: Receipt): string => {
  if (receipt.decision._tag === "deny") {
    return receipt.decision.code === "price_changed"
      ? PRICE_CHANGED_COPY
      : receipt.decision.message;
  }
  if (receipt.decision._tag === "ask") {
    return receipt.decision.question;
  }
  if (
    receipt.quote.source === "unpriced" &&
    receipt.decision._tag === "allow"
  ) {
    if (receipt.intent.kind === "dapp_transaction") {
      return receipt.stubbed
        ? STUBBED_COPY
        : `Sent from the injected wallet to ${receipt.intent.payee.label}`;
    }
    if (receipt.intent.kind === "dapp_signature") {
      return receipt.stubbed
        ? STUBBED_COPY
        : `${receipt.intent.purpose} at ${receipt.intent.payee.label}`;
    }
  }
  if (receipt.stubbed) {
    return STUBBED_COPY;
  }
  if (receipt.settlement !== undefined) {
    return `Confirmed ${receipt.intent.payee.label}`;
  }
  if (receipt.failure !== undefined) {
    return UNCERTAIN_COPY;
  }
  return `${receiptStatus(receipt)} ${receipt.intent.payee.label}`;
};

/**
 * The sentence the status itself does not carry. Uncertain is the one that
 * needs it: the payment may have moved, and Froggy will not try again.
 */
export const receiptFollowUp = (receipt: Receipt): string | null => {
  if (
    receipt.decision._tag !== "allow" ||
    receipt.stubbed ||
    receipt.settlement !== undefined ||
    receipt.failure === undefined
  ) {
    return null;
  }
  return UNCERTAIN_FOLLOW_UP;
};
