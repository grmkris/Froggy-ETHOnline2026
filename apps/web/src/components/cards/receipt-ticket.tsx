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

import { layerOf } from "../../lib/denial";
import {
  clockTime,
  explorerUrl,
  hcsMessageUrl,
  shortId,
} from "../../lib/format";
import { useSessionIds } from "../../lib/session-ids";

interface ReceiptTicketProps {
  readonly compact?: boolean;
  /** Arrived while the person was watching: the refusal stamps itself in. */
  readonly fresh?: boolean;
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
  return receipt.failure === undefined
    ? `Allowed, not settled — ${receipt.intent.payee.label}`
    : `Allowed, but not paid: ${receipt.failure}`;
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

/** The transaction, linked to its explorer when we know one. */
const TransactionLine = ({
  network,
  transactionId,
}: {
  readonly network: string;
  readonly transactionId: string;
}): React.ReactElement => {
  const url = explorerUrl(network, transactionId);
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="opacity-60">{network}</span>
      {url === null ? (
        <span className="text-foreground/80">{transactionId}</span>
      ) : (
        <a
          className="text-foreground/80 underline decoration-dotted underline-offset-2 hover:decoration-solid"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          {transactionId}
        </a>
      )}
    </span>
  );
};

/**
 * What the agent was acting on when it spent: which Graph indexes answered,
 * at which block, and the digest of the answer. "Because" is the word,
 * since this is the justification the receipt exists to carry.
 */
const Because = ({
  evidence,
}: {
  readonly evidence: NonNullable<Receipt["evidence"]>;
}): React.ReactElement => {
  const fresh = evidence.deployments.filter(
    (deployment) => deployment.status === "fresh"
  ).length;
  return (
    <details className="mt-1.5 text-xs">
      <summary className="text-muted-foreground cursor-pointer select-none">
        Because {fresh} of {evidence.deployments.length} Graph indexes answered
        at a current block{evidence.stubbed ? " (a recorded fixture)" : ""}
      </summary>
      <ul className="text-machine text-muted-foreground mt-1 space-y-0.5">
        {evidence.deployments.map((deployment) => (
          <li key={deployment.id}>
            {deployment.label} · block {deployment.blockNumber ?? "—"} ·{" "}
            {deployment.status}
          </li>
        ))}
        <li>snapshot {shortId(evidence.snapshotHash, 16)}</li>
      </ul>
    </details>
  );
};

/** The HCS note's number, linked to the note when the topic is known. */
const HcsLine = ({
  sequence,
}: {
  readonly sequence: number;
}): React.ReactElement => {
  const { hcsTopicId } = useSessionIds();
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="opacity-60">hcs</span>
      {hcsTopicId === null ? (
        <span className="text-foreground/80">#{sequence}</span>
      ) : (
        <a
          className="text-foreground/80 underline decoration-dotted underline-offset-2 hover:decoration-solid"
          href={hcsMessageUrl(hcsTopicId, sequence)}
          rel="noreferrer"
          target="_blank"
        >
          #{sequence}
        </a>
      )}
    </span>
  );
};

/** The machine facts: the rule, the code, the transaction, the evidence. */
const ReceiptStub = ({
  receipt,
  ruleId,
}: {
  readonly receipt: Receipt;
  readonly ruleId: string | undefined;
}): React.ReactElement => (
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
      <TransactionLine
        network={receipt.settlement.network}
        transactionId={receipt.settlement.transactionId}
      />
    )}
    {receipt.settlement?.hcsSequence === undefined ? null : (
      <HcsLine sequence={receipt.settlement.hcsSequence} />
    )}
    {receipt.failure === undefined ? null : (
      <StubLine label="not settled" value={receipt.failure} />
    )}
    {receipt.evidence === undefined ? null : (
      <StubLine
        label="evidence"
        value={`${shortId(receipt.evidence.snapshotHash, 12)} · ${receipt.evidence.deployments.length} index${receipt.evidence.deployments.length === 1 ? "" : "es"}`}
      />
    )}
    <StubLine label="quote" value={receipt.quote.source} />
  </TicketStub>
);

export const ReceiptTicket = ({
  compact = false,
  fresh = false,
  receipt,
}: ReceiptTicketProps): React.ReactElement => {
  const refused = receipt.decision._tag === "deny";
  const layer = compact ? null : layerOf(receipt);
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
            {layer === null ? null : (
              <p className="mt-1.5 text-xs">
                <span className="font-medium">{layer.who}</span>{" "}
                <span className="text-muted-foreground">{layer.why}</span>
              </p>
            )}
            {compact || receipt.evidence === undefined ? null : (
              <Because evidence={receipt.evidence} />
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {refused ? (
              <span
                className={fresh ? "stamp-refused stamp-in" : "stamp-refused"}
              >
                Refused
              </span>
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
      <ReceiptStub receipt={receipt} ruleId={ruleId} />
    </Ticket>
  );
};
