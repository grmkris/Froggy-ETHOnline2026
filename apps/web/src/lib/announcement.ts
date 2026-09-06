/**
 * The one thing a screen reader should hear right now.
 *
 * One live region for the page, fed a sentence derived from state, so a new
 * approval, a fresh refusal and a freeze are said once each and nothing is
 * said twice. Derived rather than remembered: what matters most is whatever
 * is true now, in this order. An approval waiting on the person outranks a
 * refusal that just landed, which outranks the wallet being frozen.
 */

import type { Mandate, Receipt } from "@froggy/domain";
import type { ApprovalRequest } from "@froggy/protocol";

export interface AnnouncementInput {
  readonly approvals: readonly ApprovalRequest[];
  readonly mandate: Mandate | null;
  /** Newest first, as the app state keeps them. */
  readonly receipts: readonly Receipt[];
  /** Receipts from before this instant were not events the person watched. */
  readonly since: number;
}

export const announcementFor = (input: AnnouncementInput): string => {
  const open = input.approvals.at(-1);
  if (open !== undefined) {
    return `Your call: ${open.title}`;
  }
  const [latest] = input.receipts;
  if (
    latest !== undefined &&
    latest.at >= input.since &&
    latest.decision._tag === "deny"
  ) {
    return `Refused: ${latest.decision.message}`;
  }
  return input.mandate?.frozen === true ? "The wallet is frozen." : "";
};
