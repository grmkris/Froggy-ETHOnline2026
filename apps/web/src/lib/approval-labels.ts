/**
 * The four answers, in the mandate's words, on every ticket.
 *
 * Purchase tickets used to say Deny / Pay once; the mandate says Not this
 * time / Allow once. One product, one vocabulary. The primary yes names the
 * amount already on the card.
 */

import type { ApprovalKind } from "@froggy/domain";

export const answerLabel = (
  kind: ApprovalKind,
  amountLabel: string,
  existing: string
): string => {
  if (kind === "deny") {
    return "Not this time";
  }
  if (kind === "deny_stop") {
    return "Stop the agent";
  }
  if (kind === "allow_once") {
    // Getting a price prints $0 and is not a spend.
    return amountLabel === "$0" ? "Allow once" : `Approve ${amountLabel}`;
  }
  return existing;
};
