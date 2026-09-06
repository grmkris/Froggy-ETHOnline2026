/**
 * The question, as a ticket.
 *
 * The body says what the agent wants to do; the stub holds the four answers
 * in the order every surface uses, the primary "yes" furthest from a stray
 * click. A countdown says how long the question stays open, and the whole
 * thing disappears on every tab the moment anyone answers.
 */

import type { ApprovalKind } from "@froggy/domain";
import type { ApprovalRequest } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import {
  Ticket,
  TicketBody,
  TicketPerforation,
  TicketStub,
} from "@froggy/ui/components/ticket";
import { useEffect, useRef, useState } from "react";

import { secondsLeft } from "../../lib/format";

interface ApprovalTicketProps {
  readonly disabled: boolean;
  readonly onAnswer: (requestId: string, optionId: string) => void;
  readonly request: ApprovalRequest;
}

const VARIANT: Record<
  ApprovalKind,
  "default" | "destructive" | "outline" | "secondary"
> = {
  allow_once: "default",
  allow_session: "secondary",
  deny: "outline",
  deny_stop: "destructive",
};

export const ApprovalTicket = ({
  disabled,
  onAnswer,
  request,
}: ApprovalTicketProps): React.ReactElement => {
  const [left, setLeft] = useState(() => secondsLeft(request.expiresAt));
  const ticketRef = useRef<HTMLElement>(null);
  // The card arrives while the person may be typing; focus must not be taken
  // from a half-written message. Otherwise the safe answer is a keypress away.
  useEffect(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLInputElement
    ) {
      return;
    }
    ticketRef.current
      ?.querySelector<HTMLButtonElement>('[data-kind="deny"]')
      ?.focus();
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      setLeft(secondsLeft(request.expiresAt));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [request.expiresAt]);

  return (
    <Ticket
      aria-label={request.title}
      className="rise-in"
      ref={ticketRef}
      tone="asking"
    >
      <TicketBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-drive-agent text-xs font-semibold tracking-wide uppercase">
              Your call
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-money text-3xl leading-none">
                {request.amountLabel}
              </span>
              <span className="text-sm">to {request.payeeLabel}</span>
            </div>
            <p className="mt-1.5 text-sm">{request.detail}</p>
          </div>
          <span
            aria-label={`${left} seconds left`}
            className="text-machine bg-card shrink-0 rounded-full px-2 py-1 tabular-nums"
          >
            {left}s
          </span>
        </div>
      </TicketBody>
      <TicketPerforation />
      <TicketStub className="flex flex-wrap items-center justify-end gap-2 py-3">
        {request.options.map((option) => (
          <Button
            data-kind={option.kind}
            disabled={disabled || left === 0}
            key={option.id}
            onClick={() => {
              onAnswer(request.id, option.id);
            }}
            size="sm"
            variant={VARIANT[option.kind]}
          >
            {option.label}
          </Button>
        ))}
      </TicketStub>
    </Ticket>
  );
};
