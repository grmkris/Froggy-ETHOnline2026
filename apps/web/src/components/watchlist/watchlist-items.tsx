import type { WatchlistItem } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { Input } from "@froggy/ui/components/input";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import {
  BookmarkIcon,
  ChevronRightIcon,
  CoinsIcon,
  GlobeIcon,
  PlaneIcon,
  ShoppingBagIcon,
} from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import { useServiceApi } from "../../hooks/use-service-api";
import { networkWords } from "../../lib/mandate-words";
import { snapshotForItem } from "../../lib/market-snapshots";
import { useWatchlist } from "../../lib/watchlist-client";
import { marketPrice } from "./market-results";

export const sourceWords = (item: WatchlistItem): string =>
  item.source._tag === "token"
    ? networkWords(item.source.network)
    : new URL(item.source.url).hostname.replace(/^www\./u, "");

export const ItemIcon = ({
  item,
}: {
  readonly item: WatchlistItem;
}): ReactElement => {
  const Icon = {
    token: CoinsIcon,
    flight: PlaneIcon,
    product: ShoppingBagIcon,
    link: GlobeIcon,
  }[item.source._tag];
  return (
    <span
      aria-hidden
      className="bg-brand-soft text-brand grid size-11 shrink-0 place-items-center rounded-2xl"
    >
      <Icon className="size-5" />
    </span>
  );
};

const emptyTitle = (query: string, archived: boolean): string => {
  if (query) {
    return "Nothing matches yet";
  }
  return archived ? "No archived items" : "Your next obsession goes here";
};

export const WatchlistItems = ({
  compact = false,
}: {
  readonly compact?: boolean;
}): ReactElement => {
  const { list } = useWatchlist();
  const { tasks } = useServiceApi();
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const items = (list.data?.items ?? []).filter(
    (item) =>
      item.archived === archived &&
      `${item.title} ${item.notes} ${sourceWords(item)} ${item.source._tag === "token" ? item.source.address : item.source.url}`
        .toLowerCase()
        .includes(query.toLowerCase())
  );
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="Saved items">
      <Input
        aria-label="Search saved items"
        placeholder="Find something you saved…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      {compact ? null : (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs">
            {items.length} {archived ? "archived" : "saved"}{" "}
            {items.length === 1 ? "item" : "items"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setArchived(!archived);
            }}
          >
            {archived ? "Back to saved" : "Archived"}
          </Button>
        </div>
      )}
      {list.isPending ? <Skeleton className="h-32 w-full rounded-2xl" /> : null}
      {list.isError ? (
        <div role="alert" className="text-sm">
          <p>Could not load your watchlist.</p>
          <Button
            variant="outline"
            onClick={() => {
              void list.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {!list.isPending && !list.isError && items.length === 0 ? (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookmarkIcon />
            </EmptyMedia>
            <EmptyTitle>{emptyTitle(query, archived)}</EmptyTitle>
            <EmptyDescription>
              {query
                ? "Try another name, address or website."
                : "Save a token, a pair of shoes, a flight, or a link you want to come back to."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Saved for later. Automatic price checks are not running.
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const snapshot = snapshotForItem(item, tasks.data?.tasks ?? []);
          return (
            <li key={item.id}>
              <Link
                className="bg-card border-border hover:bg-accent focus-visible:ring-ring flex min-w-0 items-center gap-3 rounded-2xl border p-3.5 outline-none focus-visible:ring-2"
                params={{ itemId: item.id }}
                to="/watchlist/$itemId"
              >
                <ItemIcon item={item} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-medium">
                    {item.title}
                  </span>
                  {snapshot === null ? null : (
                    <span className="text-sm tabular-nums">
                      {marketPrice(snapshot.token.priceUsd)}
                      <span className="text-muted-foreground ml-2 text-[10px]">
                        {snapshot.stubbed ? "Simulated · " : ""}
                        {new Date(
                          snapshot.observedAt
                        ).toLocaleDateString()}{" "}
                        snapshot
                      </span>
                    </span>
                  )}
                  <span className="text-muted-foreground truncate text-xs">
                    {sourceWords(item)}
                    {item.notes ? ` · ${item.notes}` : ""}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    {item.archived ? "Archived" : "Saved"}
                  </span>
                </span>
                <ChevronRightIcon
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
