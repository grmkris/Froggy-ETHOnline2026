/**
 * The first screen: the leash, then three things to try.
 *
 * Before anything has been asked the conversation has nothing to show, and
 * the honest thing to show instead is the mandate — what this agent may
 * spend, on whom, where — as one ticket. Under it the demo, numbered, so a
 * first-time visitor and a judge follow the same path: read the data, pay
 * for the answer, send money to someone.
 */

import { formatUsd } from "@froggy/domain";
import type { Mandate } from "@froggy/domain";
import type { ServiceModes, WalletSummary } from "@froggy/protocol";
import { Skeleton } from "@froggy/ui/components/skeleton";
import {
  Ticket,
  TicketBody,
  TicketPerforation,
  TicketStub,
} from "@froggy/ui/components/ticket";
import type { ReactElement } from "react";

import { shortId } from "../../lib/format";
import { capsLine, mandateLists } from "../../lib/mandate-words";
import { useSessionIds } from "../../lib/session-ids";

interface EmptyStateProps {
  readonly disabled: boolean;
  readonly mandate: Mandate | null;
  readonly modes: ServiceModes | null;
  readonly onSend: (text: string) => void;
  readonly wallet: WalletSummary | null;
}

/** The demo, in the order it is meant to be watched. */
const DEMO = [
  "What's the cheapest USDC borrow right now?",
  "Buy the lending snapshot and tell me what it says.",
  "Send 5 USDC to 0xdead0000000000000000000000000000deadbeef",
] as const;

const TOP_UP = "Top up the pocket with 1 USDC";

const StubList = ({
  items,
  label,
}: {
  readonly items: readonly string[];
  readonly label: string;
}): ReactElement | null =>
  items.length === 0 ? null : (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="opacity-60">{label}</span>
      <span className="text-foreground/80">{items.join(", ")}</span>
    </span>
  );

const MandateTicket = ({
  mandate,
  wallet,
}: {
  readonly mandate: Mandate;
  readonly wallet: WalletSummary | null;
}): ReactElement => {
  const caps = capsLine(mandate);
  const lists = mandateLists(mandate);
  const pocket = wallet?.pocketUsdMicros ?? null;
  const { policyId } = useSessionIds();
  return (
    <Ticket
      aria-label="The mandate"
      tone={mandate.frozen ? "muted" : "default"}
    >
      <TicketBody>
        <p className="text-muted-foreground text-xs">
          {mandate.frozen
            ? "Frozen. Nothing is spent until you unfreeze."
            : "The leash"}
        </p>
        <p className="font-display mt-1 text-lg font-semibold">
          {caps ?? "No caps set: nothing may be spent."}
        </p>
      </TicketBody>
      <TicketPerforation />
      <TicketStub className="flex flex-wrap gap-x-4 gap-y-1">
        <StubList items={lists.hosts} label="hosts" />
        <StubList items={lists.payees} label="payees" />
        <StubList items={lists.networks} label="on" />
        {pocket === null ? null : (
          <span className="inline-flex items-baseline gap-1.5">
            <span className="opacity-60">pocket</span>
            <span className="text-foreground/80">{formatUsd(pocket)}</span>
          </span>
        )}
        {policyId === null ? null : (
          <span
            className="inline-flex items-baseline gap-1.5"
            title="The Privy policy the agent's signer is held to. A spend the mandate allows can still be refused there."
          >
            <span className="opacity-60">signer policy</span>
            <span className="text-foreground/80">{shortId(policyId, 12)}</span>
          </span>
        )}
      </TicketStub>
    </Ticket>
  );
};

export const EmptyState = ({
  disabled,
  mandate,
  modes,
  onSend,
  wallet,
}: EmptyStateProps): ReactElement => {
  const chips =
    wallet?.pocketUsdMicros === null || wallet?.pocketUsdMicros === undefined
      ? DEMO
      : [...DEMO, TOP_UP];
  return (
    <div className="mx-auto max-w-xl space-y-6 py-4 sm:py-8">
      <div className="text-center">
        <p className="font-display text-xl font-semibold">
          Froggy spends only what this mandate allows.
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          Ask for something that costs money. You will see the page, the
          receipt, and the rule that let it through — in that order.
        </p>
      </div>
      {mandate === null ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : (
        <MandateTicket mandate={mandate} wallet={wallet} />
      )}
      <ol className="space-y-2">
        {chips.map((text, index) => (
          <li key={text}>
            <button
              className="bg-card shadow-card hover:bg-accent flex w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onClick={() => {
                onSend(text);
              }}
              type="button"
            >
              <span className="text-machine bg-muted grid size-6 shrink-0 place-items-center rounded-full">
                {index + 1}
              </span>
              <span className="min-w-0 wrap-anywhere">{text}</span>
            </button>
          </li>
        ))}
      </ol>
      {modes?.model === "stub" ? (
        <p className="text-muted-foreground text-center text-xs">
          No model key is set here, so a scripted run plays the three steps and
          says so.
        </p>
      ) : null}
    </div>
  );
};
