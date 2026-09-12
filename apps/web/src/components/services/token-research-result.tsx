/**
 * Structured renderer for a paid token_research result. Per-source status is
 * the point: observed / not indexed / unavailable / not applicable must stay
 * distinct so absence of evidence never reads as a clean screen.
 */

import type { TokenResearchFacts } from "@froggy/domain";
import { TokenResearchResult } from "@froggy/protocol";
import type { ServiceTicket } from "@froggy/protocol";
import { Schema } from "effect";
import type { ReactElement } from "react";

const STATUS_LABEL: Record<TokenResearchFacts["launcher"]["status"], string> = {
  observed: "Observed",
  not_indexed: "Not indexed",
  unavailable: "Unavailable",
  not_applicable: "Not applicable",
};

const SourceStatus = ({
  label,
  status,
}: {
  readonly label: string;
  readonly status: TokenResearchFacts["launcher"]["status"];
}): ReactElement => (
  <div className="flex items-baseline justify-between gap-3 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium">{STATUS_LABEL[status]}</span>
  </div>
);

const Addresses = ({
  label,
  values,
}: {
  readonly label: string;
  readonly values: readonly string[];
}): ReactElement | null => {
  if (values.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <ul className="text-machine flex flex-col gap-0.5 break-all">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
};

export const TokenResearchResultView = ({
  facts,
}: {
  readonly facts: TokenResearchFacts;
}): ReactElement => (
  <div
    aria-label="Token research result"
    className="flex flex-col gap-4 text-sm"
  >
    {facts.stubbed ? (
      <p className="text-muted-foreground">
        Stubbed research — no live chain or provider was queried.
      </p>
    ) : null}
    <div className="flex flex-col gap-1">
      <p>
        <span className="text-muted-foreground">Launcher </span>
        <span className="font-medium">{facts.launcher.launcher}</span>
        {facts.launcher.phase === null ? null : ` · ${facts.launcher.phase}`}
      </p>
      <p className="text-muted-foreground text-xs break-all">
        {facts.address}
        {facts.block === null ? null : ` · block ${facts.block}`}
      </p>
    </div>
    <div className="flex flex-col gap-2">
      <SourceStatus label="Launcher" status={facts.launcher.status} />
      <SourceStatus label="Template" status={facts.template.status} />
      <SourceStatus label="Cohort" status={facts.cohort.status} />
      <SourceStatus label="Holders" status={facts.holders.status} />
      <SourceStatus label="GoPlus screen" status={facts.screen.status} />
    </div>
    {facts.template.matches === null ? null : (
      <p>
        Template match:{" "}
        <span className="font-medium">
          {facts.template.matches ? "yes" : "no"}
        </span>
      </p>
    )}
    {facts.cohort.status === "observed" ? (
      <div className="flex flex-col gap-2">
        <p>
          Cohort basis <span className="font-medium">{facts.cohort.basis}</span>
          {facts.cohort.launchBlock === null
            ? null
            : ` · launch block ${facts.cohort.launchBlock}`}
          {` · ${facts.cohort.buyerCount} buyers / ${facts.cohort.sellerCount} sellers`}
        </p>
        <Addresses
          label="Same-block buyers"
          values={facts.cohort.sameBlockBuyers}
        />
        <Addresses label="Insider buyers" values={facts.cohort.insiderBuyers} />
        <Addresses label="Early sellers" values={facts.cohort.earlySellers} />
      </div>
    ) : null}
    {facts.holders.status === "observed" ? (
      <div className="flex flex-col gap-1">
        <p>
          Holders {facts.holders.holdersCounted} · top{" "}
          {facts.holders.topHolderCount} share{" "}
          {facts.holders.topShareBps === null
            ? "unknown"
            : `${(facts.holders.topShareBps / 100).toFixed(2)}%`}{" "}
          of {facts.holders.denominator}
        </p>
        <p className="text-muted-foreground text-xs">
          Coverage {facts.holders.coverage} · basis {facts.holders.basis}
          {facts.holders.supplyReconciled
            ? " · supply reconciled"
            : " · supply not reconciled"}
          {facts.holders.note === null ? null : ` · ${facts.holders.note}`}
        </p>
      </div>
    ) : null}
    {facts.screen.status === "observed" ? (
      <ul className="text-muted-foreground grid gap-1 sm:grid-cols-2">
        <li>Honeypot: {String(facts.screen.isHoneypot)}</li>
        <li>Mintable: {String(facts.screen.isMintable)}</li>
        <li>Proxy: {String(facts.screen.isProxy)}</li>
        <li>Pausable: {String(facts.screen.transferPausable)}</li>
        <li>Blacklist: {String(facts.screen.isBlacklisted)}</li>
        <li>
          Take-back ownership: {String(facts.screen.canTakeBackOwnership)}
        </li>
      </ul>
    ) : null}
  </div>
);

export const tryTokenResearchFacts = (
  task: ServiceTicket
): TokenResearchFacts | null => {
  if (task.data === undefined) {
    return null;
  }
  const decoded = Schema.decodeUnknownResult(TokenResearchResult)(task.data);
  if (decoded._tag === "Failure") {
    return null;
  }
  return decoded.success.data;
};
