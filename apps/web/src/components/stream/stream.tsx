/**
 * The conversation, with the ledger in it.
 *
 * Turns, the receipts filed under them, and the live page under the last turn
 * that touched it. Follows the newest message while the person is at the
 * bottom and stops following the moment they scroll up, with a way back.
 */

import type { Receipt } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { ArrowDownIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import type { StreamItem } from "../../lib/stream-model";
import { ReceiptTicket } from "../cards/receipt-ticket";
import { Turn } from "./turn";

interface StreamProps {
  readonly busy: boolean;
  readonly empty: ReactNode;
  readonly items: readonly StreamItem[];
  /** The message the live page card sits under; null puts it at the top. */
  readonly liveAfter: string | null;
  readonly liveCard: ReactElement | null;
}

const NEAR_BOTTOM_PX = 80;

const Earlier = ({
  receipts,
}: {
  readonly receipts: readonly Receipt[];
}): ReactElement => (
  <details className="rounded-2xl border border-dashed p-3">
    <summary className="text-muted-foreground cursor-pointer text-xs select-none">
      Earlier ({receipts.length} receipt{receipts.length === 1 ? "" : "s"})
    </summary>
    <div className="mt-3 space-y-2">
      {receipts.map((receipt) => (
        <ReceiptTicket compact key={receipt.id} receipt={receipt} />
      ))}
    </div>
  </details>
);

export const Stream = ({
  busy,
  empty,
  items,
  liveAfter,
  liveCard,
}: StreamProps): ReactElement => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null || !following || items.length === 0) {
      return;
    }
    // Instant while a turn streams (every token would otherwise start a new
    // smooth scroll), eased once it settles.
    scroller.scrollTo({
      behavior: busy ? "auto" : "smooth",
      top: scroller.scrollHeight,
    });
  }, [busy, following, items]);

  const onScroll = (): void => {
    const scroller = scrollerRef.current;
    if (scroller === null) {
      return;
    }
    const gap =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    setFollowing(gap < NEAR_BOTTOM_PX);
  };

  const liveAtTop = liveCard !== null && liveAfter === null;
  return (
    <div className="relative min-h-0 flex-1">
      <div
        className="scroll-fade-y h-full overflow-y-auto px-1 py-4"
        onScroll={onScroll}
        ref={scrollerRef}
      >
        <div className="mx-auto max-w-3xl space-y-5">
          {liveAtTop ? liveCard : null}
          {items.length === 0 && !liveAtTop ? empty : null}
          {items.map((item) =>
            item.kind === "earlier" ? (
              <Earlier key="earlier" receipts={item.receipts} />
            ) : (
              <Turn
                after={item.message.id === liveAfter ? liveCard : null}
                key={item.message.id}
                message={item.message}
                receipts={item.receipts}
              />
            )
          )}
        </div>
      </div>
      {following ? null : (
        <Button
          className="shadow-float absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full"
          onClick={() => {
            setFollowing(true);
          }}
          size="sm"
          variant="secondary"
        >
          <ArrowDownIcon data-icon="inline-start" />
          Jump to latest
        </Button>
      )}
    </div>
  );
};
