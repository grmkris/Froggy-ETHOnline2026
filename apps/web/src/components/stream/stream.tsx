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
import { AnimatePresence } from "motion/react";
import type { ReactElement } from "react";

import type { StreamItem } from "../../lib/stream-model";
import { ReceiptTicket } from "../cards/receipt-ticket";
import { MotionItem, useArrivalDelays } from "../motion-item";
import { MarkerRow } from "./marker-row";
import { Turn } from "./turn";

interface StreamProps {
  readonly context?: ReactElement;
  /** An approval card is open somewhere on the page. */
  readonly asking: boolean;
  readonly busy: boolean;
  readonly items: readonly StreamItem[];
  /** The message the live page card sits under; null puts it at the top. */
  readonly liveAfter: string | null;
  readonly liveCard: ReactElement | null;
  /** Ask the model again for the turn with this id. */
  readonly onRetry: (messageId: string) => void;
  /** The assistant turn that ended in an error, if the last one did. */
  readonly retryId: string | null;
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
  <details className="bg-muted shadow-inset rounded-2xl p-3">
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
 * A quiet placeholder while text is not here yet. No `role`: a status region would
 * announce every turn, and the e2e reads `role="status"` as the drawer's
 * "Saved".
 */
const ThinkingMarker = (): ReactElement => (
  <Marker className="px-1">
    <MarkerIcon>
      <FrogMark compact />
    </MarkerIcon>
    <MarkerContent>Thinking…</MarkerContent>
  </Marker>
);

export const Stream = ({
  context,
  asking,
  busy,
  items,
  liveAfter,
  liveCard,
  onRetry,
  retryId,
  thinking,
}: StreamProps): ReactElement => {
  const ids = items.map((item) => {
    if (item.kind === "earlier") {
      return "earlier";
    }
    if (item.kind === "marker") {
      return item.event.id;
    }
    return item.message.id;
  });
  const delays = useArrivalDelays(ids);
  const liveAtTop = liveCard !== null && liveAfter === null;
  return (
    <MessageScrollerProvider
      autoScroll
      // The empty screen reads from its top; a conversation from its end.
      defaultScrollPosition={items.length === 0 ? "start" : "end"}
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
            {context ? (
              <MessageScrollerItem messageId="email-context">
                {context}
              </MessageScrollerItem>
            ) : null}
            {liveAtTop ? (
              <MessageScrollerItem messageId="live">
                {liveCard}
              </MessageScrollerItem>
            ) : null}
            <AnimatePresence initial={false}>
              {items.map((item, index) => {
                if (item.kind === "earlier") {
                  return (
                    <MessageScrollerItem key="earlier" messageId="earlier">
                      <MotionItem delay={delays.get(ids[index] ?? "") ?? 0}>
                        <Earlier receipts={item.receipts} />
                      </MotionItem>
                    </MessageScrollerItem>
                  );
                }
                if (item.kind === "marker") {
                  return (
                    <MessageScrollerItem
                      key={item.event.id}
                      messageId={item.event.id}
                    >
                      <MotionItem delay={delays.get(ids[index] ?? "") ?? 0}>
                        <MarkerRow event={item.event} />
                      </MotionItem>
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
                    <MotionItem delay={delays.get(ids[index] ?? "") ?? 0}>
                      <Turn
                        after={item.message.id === liveAfter ? liveCard : null}
                        asking={asking}
                        message={item.message}
                        onRetry={
                          item.message.id === retryId
                            ? () => {
                                onRetry(item.message.id);
                              }
                            : null
                        }
                        receipts={item.receipts}
                      />
                    </MotionItem>
                  </MessageScrollerItem>
                );
              })}
              {thinking ? (
                <MessageScrollerItem key="thinking" messageId="thinking">
                  <MotionItem>
                    <ThinkingMarker />
                  </MotionItem>
                </MessageScrollerItem>
              ) : null}
            </AnimatePresence>
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
