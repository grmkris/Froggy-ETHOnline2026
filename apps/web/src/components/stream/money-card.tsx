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
import { Button, buttonVariants } from "@froggy/ui/components/button";
import { Link } from "@tanstack/react-router";
import { GlobeIcon } from "lucide-react";
import type { ReactElement } from "react";

import { scrollToLive } from "../../lib/scroll-to-live";
import type { ToolCall } from "../../lib/tool-call";
import { urlPurchaseOf } from "../../lib/tool-summary";
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
  const fetched = call.name === "x402_fetch" && call.output !== null;
  const purchase =
    fetched && call.output !== null ? urlPurchaseOf(call.output) : null;
  const unlockedPage =
    fetched && call.output?.includes("[Paid. The unlocked page");
  return (
    <div className="space-y-2 px-2 pb-2">
      <ReceiptTicket fresh={receipt.at >= LOADED_AT} receipt={receipt} />
      {purchase === null ? null : (
        <Link
          className={buttonVariants({ size: "sm", variant: "outline" })}
          to="/services"
          search={{ view: "purchases" }}
        >
          View saved result
        </Link>
      )}
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
