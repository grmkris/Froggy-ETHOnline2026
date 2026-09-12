/**
 * The question, as a ticket.
 *
 * The body says what the agent wants to do; the stub holds the four answers
 * in the order every surface uses, the primary "yes" furthest from a stray
 * click. A countdown says how long the question stays open, and the whole
 * thing disappears on every tab the moment anyone answers.
 *
 * A dapp's Allow is different: the person's key has to sign a one-shot Privy
 * rule before the agent key may sign, so that button runs prepare/sign/commit
 * instead of the socket used for Deny.
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
import type { ReactElement } from "react";

import { approveWalletRequest } from "../../lib/agent-policy";
import { answerLabel } from "../../lib/approval-labels";
import { hostOf, secondsLeft } from "../../lib/format";
import { useIdentity } from "../../lib/privy";
import { useSessionToken } from "../../lib/session-token";
import { ApprovalLedger } from "./approval-ledger";

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

const chainLabel = (chainId: number): string => {
  if (chainId === 8453) {
    return "Base";
  }
  if (chainId === 84_532) {
    return "Base Sepolia";
  }
  return `chain ${chainId}`;
};

const WalletBody = ({
  request,
}: {
  readonly request: ApprovalRequest;
}): ReactElement | null => {
  const { wallet } = request;
  if (wallet === undefined) {
    return null;
  }
  return (
    <div className="mt-2 space-y-1.5 text-sm">
      <p>
        <span className="text-muted-foreground">Site </span>
        {hostOf(wallet.origin)}
        <span className="text-muted-foreground">
          {" "}
          on {chainLabel(wallet.chainId)}
        </span>
      </p>
      <ul className="text-muted-foreground space-y-0.5">
        {wallet.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {wallet.warnings.length === 0 ? null : (
        <ul className="text-refused space-y-0.5">
          {wallet.warnings.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {wallet.needsSignature ? (
        <p className="text-muted-foreground text-xs">
          Allowing this signs a one-shot rule into your policy. It expires in
          ten minutes and covers only this request.
        </p>
      ) : null}
    </div>
  );
};

export const ApprovalTicket = ({
  disabled,
  onAnswer,
  request,
}: ApprovalTicketProps): ReactElement => {
  const identity = useIdentity();
  const { getToken } = useSessionToken();
  const [left, setLeft] = useState(() => secondsLeft(request.expiresAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const allowWallet = async (): Promise<void> => {
    const { wallet } = request;
    if (wallet === undefined) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await approveWalletRequest({
      requestId: wallet.requestId,
      sign: identity.signPrivyRequest,
      token: await getToken(),
    });
    setBusy(false);
    if (result.kind === "refused") {
      setError(result.reason);
    }
  };

  return (
    <Ticket aria-label={request.title} ref={ticketRef} tone="asking">
      <TicketBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-drive-agent-foreground text-xs font-semibold tracking-wide uppercase">
              Your call
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-money shrink-0 text-3xl leading-none whitespace-nowrap">
                {request.amountLabel}
              </span>
              <span className="min-w-0 text-sm break-all">
                to {request.payeeLabel}
              </span>
            </div>
            <p className="mt-1.5 text-sm">{request.detail}</p>
            {request.breakdown === undefined ? null : (
              <ApprovalLedger lines={request.breakdown} />
            )}
            <WalletBody request={request} />
            {error === null ? null : (
              <p className="text-refused mt-2 text-sm" role="alert">
                {error}
              </p>
            )}
            {busy ? (
              <p className="text-muted-foreground mt-2 text-sm">
                {request.wallet?.needsSignature === true
                  ? "Signing the one-shot rule…"
                  : "Allowing this request…"}
              </p>
            ) : null}
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
            disabled={disabled || busy || left === 0}
            key={option.id}
            onClick={() => {
              if (
                option.kind === "allow_once" &&
                request.wallet !== undefined
              ) {
                void allowWallet();
                return;
              }
              onAnswer(request.id, option.id);
            }}
            size="sm"
            variant={VARIANT[option.kind]}
          >
            {request.wallet === undefined
              ? answerLabel(option.kind, request.amountLabel, option.label)
              : option.label}
          </Button>
        ))}
      </TicketStub>
    </Ticket>
  );
};
