/**
 * One message, with the receipts it produced filed beneath it.
 */

import type { Receipt } from "@froggy/domain";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { cn } from "@froggy/ui/lib/utils";
import type { ReactElement } from "react";

import type { FroggyMessage } from "../../lib/stream-model";
import { isToolPart, toolCallOf } from "../../lib/tool-call";
import { ReceiptTicket } from "../cards/receipt-ticket";
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
          <p className="whitespace-pre-wrap" key={key}>
            {part.text}
          </p>
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

export const Turn = ({
  after = null,
  message,
  receipts,
}: TurnProps): ReactElement => {
  const mine = message.role === "user";
  return (
    <div className={cn("flex gap-3", mine && "justify-end")}>
      {mine ? null : (
        <span className="bg-primary shadow-card mt-1 grid size-7 shrink-0 place-items-center rounded-full">
          <FrogMark className="size-5" />
        </span>
      )}
      <div className={cn("min-w-0 space-y-2", mine ? "max-w-[85%]" : "flex-1")}>
        <div
          className={cn(
            "space-y-2 text-[15px] leading-relaxed",
            mine &&
              "bg-brand-soft shadow-card rounded-2xl rounded-tr-md px-4 py-2.5"
          )}
        >
          <Parts message={message} />
        </div>
        {after}
        {receipts.map((receipt) => (
          <ReceiptTicket key={receipt.id} receipt={receipt} />
        ))}
      </div>
    </div>
  );
};
