import type { Monitor, WatchlistItem, WatchlistItemId } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { Checkbox } from "@froggy/ui/components/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { Input } from "@froggy/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@froggy/ui/components/native-select";
import { Skeleton } from "@froggy/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@froggy/ui/components/toggle-group";
import { BookmarkIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import { useServiceApi } from "../../hooks/use-service-api";
import { snapshotForItem } from "../../lib/market-snapshots";
import { useMonitoring } from "../../lib/monitoring-client";
import { useWatchlist, useWatchlistView } from "../../lib/watchlist-client";
import { CompareItems } from "./compare-items";
import { sourceWords, sourceSearch } from "./item-identity";
import { marketPrice } from "./market-results";
import { SavedItemCard } from "./saved-item-card";
import { WalletMonitorBadge } from "./wallet-monitor-panel";

const emptyTitle = (query: string, archived: boolean): string => {
  if (query) {
    return "Nothing matches yet";
  }
  return archived ? "No archived items" : "Your next obsession goes here";
};

const monitoringLabel = (
  item: WatchlistItem,
  monitor: Monitor | undefined
): string => {
  if (item.archived) {
    return "Archived";
  }
  if (!monitor) {
    return "Saved";
  }
  return {
    scheduled: "Monitoring",
    checking: "Checking now",
    needs_help: "Needs your help",
    budget_exhausted: "Budget reached",
    failed: "Check failed",
    paused: "Monitoring paused",
  }[monitor.status];
};

const categoryOf = (item: WatchlistItem) =>
  item.source._tag === "email" ? item.source.kind : item.source._tag;

const ItemStatus = ({
  item,
  monitors,
}: {
  readonly item: WatchlistItem;
  readonly monitors: readonly Monitor[];
}): ReactElement =>
  item.walletMonitor ? (
    <WalletMonitorBadge item={item} />
  ) : (
    <>
      {monitoringLabel(
        item,
        monitors.find((monitor) => monitor.itemId === item.id)
      )}
    </>
  );

export const WatchlistItems = ({
  compact = false,
}: {
  readonly compact?: boolean;
}): ReactElement => {
  const { list, details } = useWatchlist();
  const { state: monitoring } = useMonitoring();
  const { tasks } = useServiceApi();
  const { query, category, sort, archived, attention, update } =
    useWatchlistView();
  const [comparing, setComparing] = useState(false);
  const [selected, setSelected] = useState<readonly WatchlistItemId[]>([]);
  const chosen = (list.data?.items ?? []).filter(
    (item) => selected.includes(item.id) && !item.archived
  );

  const needsAttention = (item: WatchlistItem): boolean =>
    details.data?.items.some(
      (entry) =>
        entry.itemId === item.id &&
        ["failed", "needs_help", "uncertain"].includes(
          entry.enrichment?.status ?? ""
        )
    ) === true ||
    monitoring.data?.monitors.some(
      (monitor) =>
        monitor.itemId === item.id &&
        ["needs_help", "failed", "budget_exhausted"].includes(monitor.status)
    ) === true;

  const items = (list.data?.items ?? [])
    .filter(
      (item) =>
        item.archived === archived &&
        (category === "all" ||
          (item.source._tag === "email"
            ? item.source.kind
            : item.source._tag) === category) &&
        (!attention || needsAttention(item)) &&
        `${item.title} ${item.notes} ${sourceWords(item)} ${sourceSearch(item)}`
          .toLowerCase()
          .includes(query.toLowerCase())
    )
    .toSorted((a, b) => {
      if (sort === "name") {
        return a.title.localeCompare(b.title);
      }
      return sort === "updated"
        ? Math.max(
            b.updatedAt,
            details.data?.items.find((entry) => entry.itemId === b.id)?.latest
              ?.at ?? 0
          ) -
            Math.max(
              a.updatedAt,
              details.data?.items.find((entry) => entry.itemId === a.id)?.latest
                ?.at ?? 0
            )
        : b.createdAt - a.createdAt;
    });
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="Saved items">
      <ToggleGroup
        aria-label="Item category"
        value={[category]}
        onValueChange={(values) => {
          update({ category: values[0] ?? "all" });
        }}
        className="max-w-full flex-wrap"
        variant="outline"
      >
        {[
          ["all", "All"],
          ["token", "Tokens"],
          ["wallet", "Wallets"],
          ["product", "Shopping"],
          ["flight", "Travel"],
          ["link", "Links"],
        ].map(([value, label]) => (
          <ToggleGroupItem
            key={value}
            value={value ?? "all"}
            className="min-h-11"
          >
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-40 flex-1"
          aria-label="Search saved items"
          placeholder="Search saved items…"
          value={query}
          onChange={(event) => {
            update({ query: event.target.value });
          }}
        />
        <NativeSelect
          aria-label="Sort saved items"
          value={sort}
          onChange={(event) => {
            update({ sort: event.target.value });
          }}
        >
          <NativeSelectOption value="newest">Newest saved</NativeSelectOption>
          <NativeSelectOption value="updated">
            Recently updated
          </NativeSelectOption>
          <NativeSelectOption value="name">Name</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          aria-pressed={comparing}
          onClick={() => {
            setComparing(!comparing);
            setSelected([]);
          }}
        >
          Compare{comparing ? " · Select up to 3" : ""}
        </Button>
        <Button
          variant="ghost"
          aria-pressed={attention}
          onClick={() => {
            update({ attention: !attention });
          }}
        >
          Needs attention{attention ? " · On" : ""}
        </Button>
      </div>
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
              update({ archived: !archived });
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
      {items.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Open an item to review its monitoring settings and latest result.
        </p>
      ) : null}
      {chosen.length > 1 ? (
        <CompareItems
          items={chosen}
          onClose={() => {
            setComparing(false);
            setSelected([]);
          }}
        />
      ) : null}
      <ul className="bg-card flex flex-col divide-y rounded-xl border">
        {items.map((item) => {
          const snapshot = snapshotForItem(item, tasks.data?.tasks ?? []);
          const data = details.data?.items.find(
            (entry) => entry.itemId === item.id
          );
          const latest = data?.latest;
          return (
            <li key={item.id} className="flex min-w-0 items-start">
              {comparing ? (
                <div className="pt-5 pl-4">
                  <Checkbox
                    aria-label={`Compare ${item.title}`}
                    checked={selected.includes(item.id)}
                    disabled={
                      !selected.includes(item.id) &&
                      (chosen.length >= 3 ||
                        (chosen[0] !== undefined &&
                          categoryOf(chosen[0]) !== categoryOf(item)))
                    }
                    onCheckedChange={(checked) => {
                      setSelected((previous) =>
                        checked
                          ? [...previous, item.id].slice(0, 3)
                          : previous.filter((id) => id !== item.id)
                      );
                    }}
                  />
                </div>
              ) : null}
              <SavedItemCard item={item} hasImage={Boolean(data?.imageUrl)}>
                {latest ? (
                  <p className="text-sm tabular-nums">
                    {latest.price === null
                      ? latest.facts[0]?.value
                      : `${latest.currency ?? ""} ${latest.price.toLocaleString()}`}
                    <span className="text-muted-foreground ml-2 text-xs">
                      {latest.stubbed ? "Simulated · " : ""}
                      {new Date(latest.at).toLocaleDateString()}
                    </span>
                  </p>
                ) : null}
                {!latest && snapshot !== null ? (
                  <p className="text-sm tabular-nums">
                    {marketPrice(snapshot.token.priceUsd)}{" "}
                    <span className="text-muted-foreground text-xs">
                      {snapshot.stubbed ? "Simulated · " : ""}
                      {new Date(snapshot.observedAt).toLocaleString()}
                    </span>
                  </p>
                ) : null}
                <div className="text-muted-foreground text-xs">
                  <ItemStatus
                    item={item}
                    monitors={monitoring.data?.monitors ?? []}
                  />
                </div>
              </SavedItemCard>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
