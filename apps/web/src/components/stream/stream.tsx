/**
 * The conversation, with the ledger in it.
 *
 * Turns, the receipts filed under them, and the live page under the last turn
 * that touched it. Each turn is an item the scroller can anchor to: a new
 * message from the person pins to the top of the viewport with a peek of what
 * came before, so a long answer is read from its start rather than chased at
 * its end. Scrolling away disengages the follow; the button brings it back.
 */

import type { Receipt } from "@froggy/domain";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@froggy/ui/components/marker";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@froggy/ui/components/message-scroller";
import { ArrowDownIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import type { StreamItem } from "../../lib/stream-model";
import { ReceiptTicket } from "../cards/receipt-ticket";
import { MarkerRow } from "./marker-row";
import { Turn } from "./turn";

interface StreamProps {
  /** An approval card is open somewhere on the page. */
  readonly asking: boolean;
  readonly busy: boolean;
  readonly empty: ReactNode;
  readonly items: readonly StreamItem[];
  /** The message the live page card sits under; null puts it at the top. */
  readonly liveAfter: string | null;
  readonly liveCard: ReactElement | null;
  /** The model has the turn and nothing has arrived yet. */
  readonly thinking: boolean;
}

/** How close to the live edge counts as following, in pixels. */
const EDGE_PX = 80;
/** How much of the previous turn stays visible when a new one anchors. */
const PEEK_PX = 64;

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

/**
 * The gap between a question and the first word of the answer.
 *
 * A shimmer rather than a spinner: it is text that is not here yet, and the
 * utility already honours reduced motion. No `role`: a status region would
 * announce every turn, and the e2e reads `role="status"` as the drawer's
 * "Saved".
 */
const ThinkingMarker = (): ReactElement => (
  <Marker className="px-1">
    <MarkerIcon>
      <FrogMark />
    </MarkerIcon>
    <MarkerContent className="shimmer">Thinking…</MarkerContent>
  </Marker>
);

export const Stream = ({
  asking,
  busy,
  empty,
  items,
  liveAfter,
  liveCard,
  thinking,
}: StreamProps): ReactElement => {
  const liveAtTop = liveCard !== null && liveAfter === null;
  return (
    <MessageScrollerProvider
      autoScroll
      defaultScrollPosition="end"
      scrollEdgeThreshold={EDGE_PX}
      scrollPreviousItemPeek={PEEK_PX}
    >
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport className="px-1 py-4">
          {/* A log, and busy while a turn streams, so a screen reader defers
              its announcements until the answer has settled. */}
          <MessageScrollerContent
            aria-busy={busy}
            className="mx-auto w-full max-w-3xl gap-5"
            role="log"
          >
            {liveAtTop ? (
              <MessageScrollerItem messageId="live">
                {liveCard}
              </MessageScrollerItem>
            ) : null}
            {items.length === 0 && !liveAtTop ? (
              <MessageScrollerItem messageId="empty">
                {empty}
              </MessageScrollerItem>
            ) : null}
            {items.map((item) => {
              if (item.kind === "earlier") {
                return (
                  <MessageScrollerItem key="earlier" messageId="earlier">
                    <Earlier receipts={item.receipts} />
                  </MessageScrollerItem>
                );
              }
              if (item.kind === "marker") {
                return (
                  <MessageScrollerItem
                    key={item.event.id}
                    messageId={item.event.id}
                  >
                    <MarkerRow event={item.event} />
                  </MessageScrollerItem>
                );
              }
              return (
                <MessageScrollerItem
                  key={item.message.id}
                  messageId={item.message.id}
                  // The person's message is what a new turn anchors to.
                  scrollAnchor={item.message.role === "user"}
                >
                  <Turn
                    after={item.message.id === liveAfter ? liveCard : null}
                    asking={asking}
                    message={item.message}
                    receipts={item.receipts}
                  />
                </MessageScrollerItem>
              );
            })}
            {thinking ? (
              <MessageScrollerItem messageId="thinking">
                <ThinkingMarker />
              </MessageScrollerItem>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton
          className="shadow-float rounded-full"
          direction="end"
          size="sm"
          variant="secondary"
        >
          <ArrowDownIcon data-icon="inline-start" />
          Jump to latest
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  );
};
