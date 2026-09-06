/**
 * One message, with the receipts it produced filed beneath it.
 *
 * The person's words sit in a bubble on the right. The agent's answer is not
 * a bubble: it is the frog's mark and then the parts as they came — text,
 * what it thought, what it did — then the page it opened, then the receipts.
 */

import type { Receipt } from "@froggy/domain";
import { Bubble, BubbleContent } from "@froggy/ui/components/bubble";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { Marker } from "@froggy/ui/components/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@froggy/ui/components/message";
import type { ReactElement } from "react";

import type { FroggyMessage } from "../../lib/stream-model";
import { groupParts, matchReceipts } from "../../lib/turn-model";
import type { ClaimedReceipts, TurnBlock } from "../../lib/turn-model";
import { ReceiptTicket } from "../cards/receipt-ticket";
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
}): ReactElement => (
  <>
    {blocks.map((block) => {
      const key = `${message.id}-${block.index}`;
      switch (block.kind) {
        case "text": {
          return <MarkdownText key={key} live={block.live} text={block.text} />;
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
          return <BrowseCard calls={block.calls} key={key} />;
        }
        case "tool": {
          return (
            <ToolCard
              asking={asking}
              call={block.call}
              key={key}
              receipt={claimed.byCall.get(block.call.toolCallId) ?? null}
            />
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
  </>
);

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
  if (message.role === "user") {
    return (
      <Message align="end" className="text-[15px] leading-relaxed">
        <MessageContent>
          <Bubble align="end" className="max-w-[85%]" variant="tinted">
            <BubbleContent className="shadow-card rounded-2xl rounded-tr-md px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
              {textOf(message)}
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
        <FrogMark className="size-5" />
      </MessageAvatar>
      <MessageContent className="gap-2">
        <Blocks
          asking={asking}
          blocks={blocks}
          claimed={claimed}
          message={message}
        />
        {after}
        {claimed.unclaimed.map((receipt) => (
          <ReceiptTicket key={receipt.id} receipt={receipt} />
        ))}
        {live ? null : (
          <TurnActions onRetry={paid ? null : onRetry} text={textOf(message)} />
        )}
      </MessageContent>
    </Message>
  );
};
