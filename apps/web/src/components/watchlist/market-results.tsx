import { EvmAddress } from "@froggy/domain";
import type { MarketSearchResult, TokenInspectResult } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { BookmarkIcon, CheckIcon } from "lucide-react";
import type { ReactElement } from "react";

import { networkWords } from "../../lib/mandate-words";
import { useWatchlist } from "../../lib/watchlist-client";

export const marketPrice = (price: number | null): string =>
  price === null
    ? "Price unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumSignificantDigits: 6,
      }).format(price);

const SaveToken = ({
  token,
}: {
  readonly token: TokenInspectResult["token"];
}): ReactElement | null => {
  const { track, list } = useWatchlist();
  const saved = list.data?.items.find(
    (item) =>
      !item.archived &&
      (item.source._tag === "token" || item.source._tag === "wallet") &&
      item.source.address.toLowerCase() === token.address.toLowerCase()
  );
  const decoded = Schema.decodeUnknownResult(EvmAddress)(token.address);
  if (decoded._tag === "Failure") {
    return null;
  }
  const savedLink =
    saved === undefined ? null : (
      <Link
        className="saved-feedback text-brand flex min-h-11 min-w-24 items-center justify-center gap-1 rounded-xl text-xs font-medium focus-visible:ring-2"
        aria-label={`Open saved ${token.symbol ?? token.name ?? "token"}`}
        to="/watchlist/$itemId"
        params={{ itemId: saved.id }}
      >
        <CheckIcon aria-hidden className="size-3.5" />
        Saved
      </Link>
    );
  return (
    <div className="flex flex-col items-end gap-1">
      {savedLink ?? (
        <Button
          aria-label={`Track ${token.symbol ?? token.name ?? "token"}`}
          disabled={track.isPending || list.isPending || list.isError}
          onClick={() => {
            track.mutate({ v: 1, address: decoded.success });
          }}
          className="min-h-11 min-w-24"
          size="sm"
          variant="outline"
        >
          <BookmarkIcon data-icon="inline-start" />
          {track.isPending ? "Tracking…" : "Track"}
        </Button>
      )}
      {track.isError ? (
        <p className="text-destructive text-xs" role="alert">
          {track.error.message}
        </p>
      ) : null}
    </div>
  );
};

export const MarketResults = ({
  result,
}: {
  readonly result: MarketSearchResult | TokenInspectResult;
}): ReactElement => {
  const tokens =
    result.operation === "market_search" ? result.tokens : [result.token];
  return (
    <section aria-label="Token results" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{networkWords(result.network)}</Badge>
        {result.stubbed ? (
          <Badge variant="outline">Simulated data</Badge>
        ) : null}
        <span className="text-muted-foreground text-xs">
          Snapshot · {new Date(result.observedAt).toLocaleString()}
        </span>
      </div>
      {tokens.length === 0 ? (
        <p className="text-muted-foreground py-4 text-sm">
          No indexed tokens found on this chain.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {tokens.map((token) => (
            <li
              className="flex min-w-0 items-center gap-3 py-3"
              key={`${result.network}:${token.address}`}
            >
              <span
                aria-hidden
                className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl text-xs font-semibold"
              >
                {(token.symbol ?? "?").slice(0, 3)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {token.name ?? token.symbol ?? "Unnamed token"}
                </p>
                <p
                  className="text-muted-foreground truncate font-mono text-[10px]"
                  title={token.address}
                >
                  {token.address}
                </p>
                <p className="mt-1 text-sm tabular-nums">
                  {marketPrice(token.priceUsd)}
                  {token.priceChange24hPercent === null ? null : (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {token.priceChange24hPercent > 0 ? "+" : ""}
                      {token.priceChange24hPercent.toFixed(2)}% · 24h
                    </span>
                  )}
                </p>
              </div>
              <SaveToken token={token} />
            </li>
          ))}
        </ul>
      )}
      {result.limitations.map((limitation) => (
        <p className="text-muted-foreground text-xs" key={limitation}>
          {limitation}
        </p>
      ))}
    </section>
  );
};
