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
import { isToolPart, toolCallOf } from "../../lib/tool-call";
import { matchReceipts } from "../../lib/turn-model";
import type { ClaimedReceipts } from "../../lib/turn-model";
import { ReceiptTicket } from "../cards/receipt-ticket";
import { MarkdownText } from "./markdown-text";
import { Reasoning } from "./reasoning";
import { ToolCard } from "./tool-card";

interface TurnProps {
  readonly after?: ReactElement | null;
  /** An approval card is open: a running money tool is the one waiting. */
  readonly asking?: boolean;
  readonly message: FroggyMessage;
  readonly receipts: readonly Receipt[];
}

const Parts = ({
  asking,
  claimed,
  message,
}: {
  readonly asking: boolean;
  readonly claimed: ClaimedReceipts;
  readonly message: FroggyMessage;
}): ReactElement => (
  <>
    {message.parts.map((part, index) => {
      const key = `${message.id}-${index}`;
      if (part.type === "text") {
        return (
          <MarkdownText
            key={key}
            live={part.state === "streaming"}
            text={part.text}
          />
        );
      }
      if (part.type === "reasoning") {
        return part.text.trim() === "" ? null : (
          <Reasoning
            key={key}
            live={part.state === "streaming"}
            text={part.text}
          />
        );
      }
      if (part.type === "step-start") {
        // A hairline between steps; not before the first, not after the last.
        return index > 0 && index < message.parts.length - 1 ? (
          <Marker
            aria-hidden
            className="min-h-2"
            key={key}
            variant="separator"
          />
        ) : null;
      }
      if (isToolPart(part)) {
        const call = toolCallOf(part);
        return call === null ? (
          <p className="text-machine text-muted-foreground" key={key}>
            · {part.type}
          </p>
        ) : (
          <ToolCard
            asking={asking}
            call={call}
            key={key}
            receipt={claimed.byCall.get(call.toolCallId) ?? null}
          />
        );
      }
      return null;
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
  return (
    <Message align="start" className="text-[15px] leading-relaxed">
      <MessageAvatar className="bg-primary shadow-card mt-1 size-7 min-w-7 self-start">
        <FrogMark className="size-5" />
      </MessageAvatar>
      <MessageContent className="gap-2">
        <Parts asking={asking} claimed={claimed} message={message} />
        {after}
        {claimed.unclaimed.map((receipt) => (
          <ReceiptTicket key={receipt.id} receipt={receipt} />
        ))}
      </MessageContent>
    </Message>
  );
};
