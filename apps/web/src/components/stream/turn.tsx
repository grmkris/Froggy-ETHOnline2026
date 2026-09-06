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
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@froggy/ui/components/message";
import type { ReactElement } from "react";

import type { FroggyMessage } from "../../lib/stream-model";
import { isToolPart, toolCallOf } from "../../lib/tool-call";
import { ReceiptTicket } from "../cards/receipt-ticket";
import { MarkdownText } from "./markdown-text";
import { ToolCard } from "./tool-card";

interface TurnProps {
  readonly after?: ReactElement | null;
  readonly message: FroggyMessage;
  readonly receipts: readonly Receipt[];
}

const Reasoning = ({ text }: { readonly text: string }): ReactElement => (
  <details className="text-muted-foreground text-xs">
    <summary className="cursor-pointer select-none">Thinking</summary>
    <p className="mt-1 whitespace-pre-wrap">{text}</p>
  </details>
);

const Parts = ({
  message,
}: {
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
          <Reasoning key={key} text={part.text} />
        );
      }
      if (isToolPart(part)) {
        const call = toolCallOf(part);
        return call === null ? (
          <p className="text-machine text-muted-foreground" key={key}>
            · {part.type}
          </p>
        ) : (
          <ToolCard call={call} key={key} />
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
  return (
    <Message align="start" className="text-[15px] leading-relaxed">
      <MessageAvatar className="bg-primary shadow-card mt-1 size-7 min-w-7 self-start">
        <FrogMark className="size-5" />
      </MessageAvatar>
      <MessageContent className="gap-2">
        <Parts message={message} />
        {after}
        {receipts.map((receipt) => (
          <ReceiptTicket key={receipt.id} receipt={receipt} />
        ))}
      </MessageContent>
    </Message>
  );
};
