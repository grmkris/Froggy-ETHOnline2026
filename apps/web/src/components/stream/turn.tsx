/**
 * One message, with the receipts it produced filed beneath it.
 *
 * The person's words sit in a bubble on the right. The agent's answer is not
 * a bubble: it is the frog's mark and then the parts as they came — text,
 * what it thought, what it did — then the page it opened, then the receipts.
 */

import { formatUsd } from "@froggy/domain";
import type { Receipt } from "@froggy/domain";
import { Bubble, BubbleContent } from "@froggy/ui/components/bubble";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { Marker } from "@froggy/ui/components/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@froggy/ui/components/message";
import { Link } from "@tanstack/react-router";
import { BookmarkIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import type { ReactElement } from "react";

import type { FroggyMessage } from "../../lib/stream-model";
import { groupParts, matchReceipts, turnCost } from "../../lib/turn-model";
import type { ClaimedReceipts, TurnBlock } from "../../lib/turn-model";
import { readWatchlistContext } from "../../lib/watchlist-context";
import { ReceiptTicket } from "../cards/receipt-ticket";
import { MotionItem, useArrivalDelays } from "../motion-item";
import { BrowseCard } from "./browse-card";
import { MarkdownText } from "./markdown-text";
import { Reasoning } from "./reasoning";
import { ToolCard } from "./tool-card";
import { TurnActions } from "./turn-actions";

interface TurnProps {
  readonly after?: ReactElement | null;
  /** An approval card is open: a running money tool is the one waiting. */
  readonly asking?: boolean;
  readonly message: FroggyMessage;
  /** Ask the model again, when this turn ended in an error. */
  readonly onRetry?: (() => void) | null;
  readonly receipts: readonly Receipt[];
}

const Blocks = ({
  asking,
  blocks,
  claimed,
  message,
}: {
  readonly asking: boolean;
  readonly blocks: readonly TurnBlock[];
  readonly claimed: ClaimedReceipts;
  readonly message: FroggyMessage;
}): ReactElement => {
  const delays = useArrivalDelays(
    blocks.map((block) => `${message.id}-${block.index}`)
  );
  return (
    <AnimatePresence initial={false}>
      {blocks.map((block) => {
        const key = `${message.id}-${block.index}`;
        switch (block.kind) {
          case "text": {
            return (
              <MarkdownText key={key} live={block.live} text={block.text} />
            );
          }
          case "reasoning": {
            return <Reasoning key={key} live={block.live} text={block.text} />;
          }
          case "step": {
            // A hairline between steps; not before the first, not after the last.
            return (
              <Marker
                aria-hidden
                className="min-h-2 gap-0 before:mr-0 after:ml-0"
                key={key}
                variant="separator"
              />
            );
          }
          case "browse": {
            return (
              <MotionItem delay={delays.get(key) ?? 0} key={key}>
                <BrowseCard calls={block.calls} />
              </MotionItem>
            );
          }
          case "service": {
            const latest = block.calls.at(-1);
            if (!latest) { return null; }
            return <div key={key} className="flex flex-col gap-2"><ToolCard asking={asking} call={latest} receipt={claimed.byCall.get(latest.toolCallId) ?? null} />{block.calls.length > 1 ? <details><summary className="text-muted-foreground min-h-11 cursor-pointer py-3 text-xs">{block.calls.length} task updates and receipts</summary><div className="flex flex-col gap-2">{block.calls.slice(0, -1).map((call) => <ToolCard key={call.toolCallId} call={call} receipt={claimed.byCall.get(call.toolCallId) ?? null} />)}</div></details> : null}</div>;
          }
          case "tool": {
            return (
              <MotionItem delay={delays.get(key) ?? 0} key={key}>
                <ToolCard
                  asking={asking}
                  call={block.call}
                  receipt={claimed.byCall.get(block.call.toolCallId) ?? null}
                />
              </MotionItem>
            );
          }
          case "unknown": {
            return (
              <p className="text-machine text-muted-foreground" key={key}>
                · {block.type}
              </p>
            );
          }
          default: {
            return null;
          }
        }
      })}
    </AnimatePresence>
  );
};

/** "This turn: $0.0040 · 1 payment · 2 refusals", or nothing to say. */
const TurnCostLine = ({
  receipts,
}: {
  readonly receipts: readonly Receipt[];
}): ReactElement | null => {
  const cost = turnCost(receipts);
  if (cost === null) {
    return null;
  }
  const words = [
    `This turn: ${formatUsd(cost.usdMicros)}`,
    `${cost.payments} payment${cost.payments === 1 ? "" : "s"}`,
    ...(cost.refusals === 0
      ? []
      : [`${cost.refusals} refusal${cost.refusals === 1 ? "" : "s"}`]),
  ];
  return (
    <p className="text-machine text-muted-foreground">{words.join(" · ")}</p>
  );
};

/** What the person wrote, joined: their message is one bubble, not parts. */
const textOf = (message: FroggyMessage): string =>
  message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");

export const Turn = ({
  after = null,
  asking = false,
  message,
  onRetry = null,
  receipts,
}: TurnProps): ReactElement => {
  const delays = useArrivalDelays(receipts.map((receipt) => receipt.id));
  if (message.role === "user") {
    const text = textOf(message);
    const saved = readWatchlistContext(text);
    return (
      <Message align="end" className="text-[15px] leading-relaxed">
        <MessageContent>
          <Bubble align="end" className="max-w-[85%]" variant="tinted">
            <BubbleContent className="shadow-card rounded-2xl rounded-tr-md px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
              {saved === null ? null : (
                <Link
                  to="/watchlist/$itemId"
                  params={{ itemId: saved.id }}
                  className="text-brand focus-visible:ring-ring mb-2 flex w-fit items-center gap-1.5 rounded-md text-xs outline-none focus-visible:ring-2"
                >
                  <BookmarkIcon aria-hidden className="size-3" />
                  From your Watchlist
                </Link>
              )}
              {saved?.text ?? text}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }
  // A receipt sits on the card of the call that spent; the rest under the turn.
  const claimed = matchReceipts(message, receipts);
  const blocks = groupParts(message);
  const live = blocks.some(
    (block) =>
      (block.kind === "text" || block.kind === "reasoning") && block.live
  );
  // Never ask a turn that paid to run again: that would be paying twice.
  const paid = receipts.some((receipt) => receipt.settlement !== undefined);
  return (
    <Message align="start" className="text-[15px] leading-relaxed">
      <MessageAvatar className="bg-primary shadow-card mt-1 size-7 min-w-7 self-start">
        <FrogMark className="size-5" compact />
      </MessageAvatar>
      <MessageContent className="gap-2">
        <Blocks
          asking={asking}
          blocks={blocks}
          claimed={claimed}
          message={message}
        />
        {after}
        <AnimatePresence initial={false}>
          {claimed.unclaimed.map((receipt) => (
            <MotionItem
              delay={delays.get(receipt.id) ?? 0}
              key={receipt.id}
              spring
            >
              <ReceiptTicket receipt={receipt} />
            </MotionItem>
          ))}
        </AnimatePresence>
        {live ? null : <TurnCostLine receipts={receipts} />}
        {live ? null : (
          <TurnActions onRetry={paid ? null : onRetry} text={textOf(message)} />
        )}
      </MessageContent>
    </Message>
  );
};
