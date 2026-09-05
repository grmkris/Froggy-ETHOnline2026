/**
 * A receipt, as a ticket.
 *
 * The body is for the person: how much, to whom, what for, and whether it
 * happened. The stub is for whoever has to check: the rule that decided, the
 * transaction, the evidence digest, the stub marker. A refused spend gets a
 * stamp rather than a red box, because a refusal is the product working.
 */

import { formatUsd } from "@froggy/domain";
import type { Receipt } from "@froggy/domain";
import { Badge } from "@froggy/ui/components/badge";
import {
  Ticket,
  TicketBody,
  TicketPerforation,
  TicketStub,
} from "@froggy/ui/components/ticket";

import { clockTime, shortId } from "../../lib/format";

interface ReceiptTicketProps {
  readonly compact?: boolean;
  readonly receipt: Receipt;
}

const APPROVAL_WORDS: Record<
  NonNullable<Receipt["approval"]>["resolution"],
  string
> = {
  aborted: "question withdrawn",
  allow_once: "you allowed it once",
  allow_session: "you allowed it for this session",
  deny: "you said no",
  deny_stop: "you stopped the agent",
  timeout: "nobody answered",
  unavailable: "nobody to ask",
};

const headline = (receipt: Receipt): string => {
  const { decision } = receipt;
  if (decision._tag === "deny") {
    return decision.message;
  }
  if (decision._tag === "ask") {
    return decision.question;
  }
  if (receipt.settlement !== undefined) {
    return `Paid ${receipt.intent.payee.label}`;
  }
  return `Allowed, not settled — ${receipt.intent.payee.label}`;
};

const StubLine = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.ReactElement => (
  <span className="inline-flex items-baseline gap-1.5">
    <span className="opacity-60">{label}</span>
    <span className="text-foreground/80">{value}</span>
  </span>
);

export const ReceiptTicket = ({
  compact = false,
  receipt,
}: ReceiptTicketProps): React.ReactElement => {
  const refused = receipt.decision._tag === "deny";
  const ruleId =
    receipt.decision._tag === "allow"
      ? receipt.decision.satisfied.at(-1)
      : receipt.decision.ruleId;
  return (
    <Ticket
      aria-label={`${refused ? "Refused" : "Receipt"}: ${headline(receipt)}`}
      className="rise-in"
      tone={refused ? "refused" : "default"}
    >
      <TicketBody className={compact ? "px-3 pt-2.5 pb-2" : undefined}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-money ${compact ? "text-lg" : "text-2xl"} leading-none`}
              >
                {formatUsd(receipt.intent.usdMicros)}
              </span>
              <span className="text-muted-foreground text-xs">
                {receipt.intent.amount.asset.symbol} ·{" "}
                {receipt.intent.payee.label}
              </span>
            </div>
            <p className="mt-1.5 text-sm">{headline(receipt)}</p>
            {compact ? null : (
              <p className="text-muted-foreground mt-0.5 text-xs">
                {receipt.intent.purpose}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {refused ? (
              <span className="stamp-refused">Refused</span>
            ) : (
              <span className="text-muted-foreground text-xs">
                {clockTime(receipt.at)}
              </span>
            )}
            {receipt.stubbed ? (
              <Badge
                className="border-drive-agent/60 text-drive-agent text-[10px]"
                variant="outline"
              >
                stubbed
              </Badge>
            ) : null}
          </div>
        </div>
      </TicketBody>
      <TicketPerforation />
      <TicketStub className="flex flex-wrap gap-x-4 gap-y-1">
        {receipt.decision._tag === "deny" ? (
          <StubLine label="code" value={receipt.decision.code} />
        ) : null}
        {ruleId === undefined ? null : (
          <StubLine label="rule" value={shortId(ruleId, 14)} />
        )}
        {receipt.approval === undefined ? null : (
          <StubLine
            label="approval"
            value={APPROVAL_WORDS[receipt.approval.resolution]}
          />
        )}
        {receipt.settlement === undefined ? null : (
          <StubLine
            label={receipt.settlement.network}
            value={receipt.settlement.transactionId}
          />
        )}
        {receipt.evidence === undefined ? null : (
          <StubLine
            label="evidence"
            value={`${shortId(receipt.evidence.snapshotHash, 12)} · ${receipt.evidence.deployments.length} index${receipt.evidence.deployments.length === 1 ? "" : "es"}`}
          />
        )}
        <StubLine label="quote" value={receipt.quote.source} />
      </TicketStub>
    </Ticket>
  );
};
