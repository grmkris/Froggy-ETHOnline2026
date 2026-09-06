/**
 * The body of a tool card whose call spent, or tried to.
 *
 * The receipt is the body. It already says how much, to whom, what for,
 * which layer refused and why; a summary line beside it would be a second,
 * poorer telling. A paid fetch adds one thing the ticket cannot: the page
 * the payment unlocked is in the shared browser, and a button takes you to
 * it. The link itself is never shown here — it opens once, in that browser.
 */

import type { Receipt } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { GlobeIcon } from "lucide-react";
import type { ReactElement } from "react";

import { scrollToLive } from "../../lib/scroll-to-live";
import type { ToolCall } from "../../lib/tool-call";
import { ReceiptTicket } from "../cards/receipt-ticket";

/** Receipts filed after this instant arrived while the person watched. */
const LOADED_AT = Date.now();

export const MoneyBody = ({
  call,
  receipt,
}: {
  readonly call: ToolCall;
  readonly receipt: Receipt;
}): ReactElement => {
  const unlockedPage =
    call.name === "x402_fetch" && receipt.settlement !== undefined;
  return (
    <div className="space-y-2 px-2 pb-2">
      <ReceiptTicket fresh={receipt.at >= LOADED_AT} receipt={receipt} />
      {unlockedPage ? (
        <Button
          className="rounded-full"
          onClick={scrollToLive}
          size="sm"
          type="button"
          variant="outline"
        >
          <GlobeIcon data-icon="inline-start" />
          Show the unlocked page
        </Button>
      ) : null}
    </div>
  );
};
