import { listChainNames } from "@froggy/domain";
import type { AddressLookupResult } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactElement } from "react";

import { useServiceApi } from "../../hooks/use-service-api";
import { richResultOf } from "../../lib/tool-call";
import type { ToolCall } from "../../lib/tool-call";
import { summarize } from "../../lib/tool-summary";
import type { ToolSummary } from "../../lib/tool-summary";
import { useWatchlist } from "../../lib/watchlist-client";
import { ServiceTaskResult } from "../services/service-task-result";
import { ChainChips } from "../watchlist/item-identity";
import { PriceHistory } from "../watchlist/price-history";
import { SavedItemCard } from "../watchlist/saved-item-card";
import { states } from "../watchlist/wallet-monitor-panel";

const AddressResult = ({
  result,
  summary,
}: {
  readonly result: AddressLookupResult;
  readonly summary: ToolSummary | null;
}): ReactElement => {
  const { track, list } = useWatchlist();
  const saved = list.data?.items.find(
    (item) =>
      !item.archived &&
      (item.source._tag === "token" || item.source._tag === "wallet") &&
      item.source.address.toLowerCase() === result.address.toLowerCase()
  );
  const unavailable = result.networks.filter(
    (row) => row.status === "unavailable"
  );
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-xs break-all">{result.address}</p>
      {summary ? (
        <div>
          <p className="text-sm font-medium">{summary.headline}</p>
          <p className="text-muted-foreground text-xs">{summary.detail}</p>
        </div>
      ) : null}
      <ChainChips
        rows={result.networks.map((row) => ({
          ...row,
          token:
            row.token === null
              ? null
              : { ...row.token, name: row.token.name ?? null },
          observedAt: result.observedAt,
          stubbed: result.stubbed,
        }))}
      />
      <p className="text-muted-foreground text-xs">
        {result.stubbed ? "Simulated lookup · " : ""}
        {new Date(result.observedAt).toLocaleString()}
      </p>
      {unavailable.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {listChainNames(unavailable.map((row) => row.network))} could not be
          checked.
        </p>
      ) : null}
      {saved ? (
        <Link
          className="saved-feedback text-brand min-h-11 content-center text-sm underline"
          to="/watchlist/$itemId"
          params={{ itemId: saved.id }}
        >
          Tracked · Open
        </Link>
      ) : (
        <Button
          variant="outline"
          className="min-h-11 self-start"
          disabled={track.isPending}
          onClick={() => {
            track.mutate({ v: 1, address: result.address });
          }}
        >
          {track.isPending ? "Tracking…" : "Track this"}
        </Button>
      )}
      {track.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {track.error.message}
        </p>
      ) : null}
    </div>
  );
};

export const RichToolResult = ({
  call,
}: {
  readonly call: ToolCall;
}): ReactElement | null => {
  const result = richResultOf(call);
  const { download } = useServiceApi(undefined, false);
  const [expanded, setExpanded] = useState(false);
  if (result === null) {
    return null;
  }
  if ("service" in result) {
    return (
      <div className="p-3">
        <ServiceTaskResult task={result} download={download} />
      </div>
    );
  }
  if ("operation" in result) {
    return (
      <div className="p-3">
        <AddressResult result={result} summary={summarize(call)} />
      </div>
    );
  }
  if ("status" in result && "item" in result) {
    return (
      <SavedItemCard item={result.item}>
        <p className="text-muted-foreground text-xs">
          {states[result.status.state]}
        </p>
        {result.status.monitor ? (
          <p className="text-muted-foreground text-xs">
            Watch ends{" "}
            {new Date(result.status.monitor.expiresAt).toLocaleString()}
          </p>
        ) : null}
        <Link
          to="/watchlist/$itemId"
          params={{ itemId: result.item.id }}
          className="text-brand min-h-11 content-center text-sm underline"
        >
          Open in Watchlist
        </Link>
      </SavedItemCard>
    );
  }
  if ("item" in result) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <SavedItemCard item={result.item}>
          {result.data.latest ? (
            <p className="text-muted-foreground text-xs">
              {result.data.latest.stubbed ? "Simulated · " : ""}
              {result.data.latest.source} ·{" "}
              {new Date(result.data.latest.at).toLocaleString()}
            </p>
          ) : null}
        </SavedItemCard>
        {result.data.latest ? (
          <dl className="grid gap-3 px-4 sm:grid-cols-2">
            {result.data.latest.facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-muted-foreground text-xs">{fact.label}</dt>
                <dd className="text-sm break-words">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {result.snapshot ? <PriceHistory snapshot={result.snapshot} /> : null}
      </div>
    );
  }
  if ("items" in result) {
    return (
      <div className="flex flex-col divide-y">
        {(expanded ? result.items : result.items.slice(0, 5)).map((item) => (
          <SavedItemCard key={item.id} item={item} />
        ))}
        {result.items.length > 5 ? (
          <Button
            variant="ghost"
            onClick={() => {
              setExpanded(!expanded);
            }}
          >
            {expanded ? "Show fewer" : `Show all ${result.items.length} items`}
          </Button>
        ) : null}
      </div>
    );
  }
  return <SavedItemCard item={result} />;
};
