import { WatchlistInput } from "@froggy/domain";
import type { AddressLookupResult } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { Schema } from "effect";
import { useState } from "react";
import type { ReactElement } from "react";

import { useServiceApi } from "../../hooks/use-service-api";
import { networkWords } from "../../lib/mandate-words";
import { richResultOf } from "../../lib/tool-call";
import type { ToolCall } from "../../lib/tool-call";
import { summarize } from "../../lib/tool-summary";
import type { ToolSummary } from "../../lib/tool-summary";
import { useWatchlist } from "../../lib/watchlist-client";
import { ServiceTaskResult } from "../services/service-task-result";
import { PriceHistory } from "../watchlist/price-history";
import { SavedItemCard } from "../watchlist/saved-item-card";

const AddressResult = ({
  result,
  summary,
}: {
  readonly result: AddressLookupResult;
  readonly summary: ToolSummary | null;
}): ReactElement => {
  const { save } = useWatchlist();
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-xs break-all">{result.address}</p>
      {summary ? (
        <div>
          <p className="text-sm font-medium">{summary.headline}</p>
          <p className="text-muted-foreground text-xs">{summary.detail}</p>
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {result.stubbed ? "Simulated lookup · " : ""}
        {new Date(result.observedAt).toLocaleString()}
      </p>
      {result.networks.map((row) => (
        <div
          key={row.network}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {networkWords(row.network)} ·{" "}
              {row.token?.name ??
                row.token?.symbol ??
                (row.status === "unavailable" ? "Unavailable" : "Address")}
            </p>
            <p className="text-muted-foreground text-xs">{row.note}</p>
          </div>
          {row.status === "observed" ? (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={save.isPending}
              onClick={() => {
                const input = Schema.decodeUnknownSync(WatchlistInput)({
                  title: row.token?.name ?? row.token?.symbol ?? result.address,
                  notes: "",
                  source: {
                    _tag:
                      (row.token?.symbol ?? null) !== null ||
                      (row.token?.decimals ?? null) !== null
                        ? "token"
                        : "wallet",
                    network: row.network,
                    address: result.address,
                  },
                });
                save.mutate(input);
              }}
            >
              Save on {networkWords(row.network)}
            </Button>
          ) : null}
        </div>
      ))}
      {save.data ? <SavedItemCard item={save.data} /> : null}
      {save.isError ? <p role="alert">{save.error.message}</p> : null}
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
