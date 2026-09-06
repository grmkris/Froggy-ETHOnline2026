import type { Receipt } from "@froggy/domain";

/** Authorization and settlement are separate facts, on every receipt surface. */
export const receiptStatus = (receipt: Receipt): string => {
  if (receipt.decision._tag === "deny") {
    return "Refused";
  }
  if (receipt.decision._tag === "ask") {
    return "Approval required";
  }
  if (receipt.settlement !== undefined) {
    return "Paid";
  }
  return receipt.failure === undefined
    ? "Allowed, not settled"
    : "Payment problem";
};

export const receiptHeadline = (receipt: Receipt): string => {
  if (receipt.decision._tag === "deny") {
    return receipt.decision.message;
  }
  if (receipt.decision._tag === "ask") {
    return receipt.decision.question;
  }
  const status = receiptStatus(receipt);
  return receipt.failure !== undefined && receipt.settlement === undefined
    ? `${status}: ${receipt.failure}`
    : `${status} ${receipt.intent.payee.label}`;
};
