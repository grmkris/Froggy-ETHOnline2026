import type {
  Monitor,
  WatchlistData,
  WatchlistItem,
  WatchlistItemId,
  WatchlistObservation,
} from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { Checkbox } from "@froggy/ui/components/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { BookmarkIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { useNow } from "../../hooks/use-now";
import { useServiceApi } from "../../hooks/use-service-api";
import { snapshotForItem } from "../../lib/market-snapshots";
import type { MarketSnapshot } from "../../lib/market-snapshots";
import { useMonitoring } from "../../lib/monitoring-client";
import { balanceWords, timeWords, watchStanding } from "../../lib/watch-words";
import {
  useWatchlist,
  useWatchlistView,
  useWatchlistDetails,
} from "../../lib/watchlist-client";
import type { WatchlistKind } from "../../lib/watchlist-client";
import { MotionItem, useArrivalDelays } from "../motion-item";
import { CompareItems } from "./compare-items";
import { ItemPresence, sourceWords, sourceSearch } from "./item-identity";
import { marketPrice } from "./market-results";
import { NotifyToggle } from "./notify-toggle";
import { SavedItemCard } from "./saved-item-card";

const KINDS: readonly (readonly [WatchlistKind, string])[] = [
  ["all", "All"],
  ["wallet", "Wallets"],
  ["token", "Tokens"],
  ["product", "Shopping"],
  ["flight", "Travel"],
  ["link", "Links"],
];

const emptyTitle = (query: string, archived: boolean): string => {
  if (query) {
    return "Nothing matches yet";
  }
  return archived ? "No archived items" : "Nothing here yet";
};

const categoryOf = (item: WatchlistItem) =>
  item.source._tag === "email" ? item.source.kind : item.source._tag;

const observationValue = (latest: WatchlistObservation): string | undefined =>
  latest.price === null
    ? latest.facts[0]?.value
    : `${latest.currency ?? ""} ${latest.price.toLocaleString()}`;

type EnrichmentStatus = NonNullable<WatchlistData["enrichment"]>["status"];
const monitorAttention: Partial<Record<Monitor["status"], string>> = {
  needs_help: "a check needs your help",
  failed: "the last check failed",
  budget_exhausted: "the monitoring budget is used up",
};
const enrichmentAttention: Partial<Record<EnrichmentStatus, string>> = {
  failed: "the last lookup failed",
  needs_help: "the lookup needs a hand",
  uncertain: "the last lookup was uncertain",
};
/** Why an item needs the person, in a few words; null when it does not. */
const attentionWords = (
  enrichment: EnrichmentStatus | undefined,
  monitor: Monitor | undefined
): string | null =>
  (monitor === undefined ? undefined : monitorAttention[monitor.status]) ??
  (enrichment === undefined ? undefined : enrichmentAttention[enrichment]) ??
  null;

const Comparison = ({
  chosen,
  onClose,
}: {
  readonly chosen: readonly WatchlistItem[];
  readonly onClose: () => void;
}): ReactElement | null =>
  chosen.length > 1 ? <CompareItems items={chosen} onClose={onClose} /> : null;

/** The row that just arrived from the bar: it polls its own details while discovery runs. */
const JustTrackedRow = ({
  item,
  now,
}: {
  readonly item: WatchlistItem;
  readonly now: number;
}): ReactElement => {
  const details = useWatchlistDetails(item.id);
  const current = details.data?.item ?? item;
  const presence = details.data?.data.presence ?? [];
  const standing = watchStanding(current, { presence, now });
  return (
    <MotionItem spring className="arrive-from-bar flex min-w-0 flex-1">
      <SavedItemCard
        item={current}
        data={details.data?.data}
        state={standing.state}
        words={standing.words}
      >
        <ItemPresence item={current} data={details.data?.data} />
        <NotifyToggle item={current} data={details.data?.data} />
      </SavedItemCard>
    </MotionItem>
  );
};

/** The third line of a row: balances for an address, the latest figure for anything else. */
const RowFacts = ({
  item,
  data,
  snapshot,
  words,
}: {
  readonly item: WatchlistItem;
  readonly data: WatchlistData | undefined;
  readonly snapshot: MarketSnapshot | null;
  readonly words: string | null;
}): ReactNode => {
  const latest = data?.latest ?? null;
  if ("address" in item.source) {
    const balances = balanceWords(data?.presence ?? []);
    if (balances === null) {
      return <ItemPresence item={item} data={data} />;
    }
    return (
      <p className="watch-row-words text-foreground">
        {balances}
        {latest?.stubbed === true ? " · Simulated" : ""}
      </p>
    );
  }
  return (
    <>
      {words === null ? (
        <p className="watch-row-words">Saved · {sourceWords(item)}</p>
      ) : null}
      {latest ? (
        <p className="watch-row-words text-foreground tabular-nums">
          {observationValue(latest)}
          {latest.stubbed ? " · Simulated" : ""}
        </p>
      ) : null}
      {!latest && snapshot !== null ? (
        <p className="watch-row-words text-foreground tabular-nums">
          {marketPrice(snapshot.token.priceUsd)}
          {snapshot.stubbed ? " · Simulated" : ""}
        </p>
      ) : null}
    </>
  );
};

const WatchRow = ({
  item,
  data,
  monitor,
  snapshot,
  attention,
  now,
}: {
  readonly item: WatchlistItem;
  readonly data: WatchlistData | undefined;
  readonly monitor: Monitor | undefined;
  readonly snapshot: MarketSnapshot | null;
  readonly attention: string | null;
  readonly now: number;
}): ReactElement => {
  const standing = watchStanding(item, {
    presence: data?.presence ?? [],
    monitor,
    now,
    attention,
  });
  const lastAt = data?.latest?.at ?? null;
  return (
    <SavedItemCard
      item={item}
      data={data}
      hasImage={Boolean(data?.imageUrl)}
      state={standing.state}
      words={standing.words}
      time={lastAt === null ? null : timeWords(lastAt, now)}
    >
      <RowFacts
        item={item}
        data={data}
        snapshot={snapshot}
        words={standing.words}
      />
    </SavedItemCard>
  );
};

const FilterChip = ({
  on,
  needs = false,
  onClick,
  children,
}: {
  readonly on: boolean;
  readonly needs?: boolean;
  readonly onClick: () => void;
  readonly children: string;
}): ReactElement => (
  <button
    type="button"
    className="playground-chip playground-chip-sm"
    aria-pressed={on}
    data-needs={needs && !on ? "" : undefined}
    onClick={onClick}
  >
    {children}
  </button>
);

const ListFilters = ({
  compact,
  needsCount,
  comparing,
  onCompare,
}: {
  readonly compact: boolean;
  readonly needsCount: number;
  readonly comparing: boolean;
  readonly onCompare: () => void;
}): ReactElement => {
  const { kind, archived, attention, update } = useWatchlistView();
  return (
    <div className="watch-filters" role="toolbar" aria-label="Show">
      {compact
        ? null
        : KINDS.map(([value, label]) => (
            <FilterChip
              key={value}
              on={kind === value}
              onClick={() => {
                update({ kind: value });
              }}
            >
              {label}
            </FilterChip>
          ))}
      {compact ? null : <span className="watch-filters-gap" aria-hidden />}
      {needsCount > 0 ? (
        <FilterChip
          on={attention}
          needs
          onClick={() => {
            update({ attention: !attention });
          }}
        >
          {`Needs attention · ${needsCount}`}
        </FilterChip>
      ) : null}
      {compact ? null : (
        <FilterChip
          on={archived}
          onClick={() => {
            update({ archived: !archived });
          }}
        >
          {archived ? "Back to saved" : "Archived"}
        </FilterChip>
      )}
      <FilterChip on={comparing} onClick={onCompare}>
        {`Compare${comparing ? " · Select up to 3" : ""}`}
      </FilterChip>
    </div>
  );
};

const CompareBox = ({
  item,
  selected,
  chosen,
  onChange,
}: {
  readonly item: WatchlistItem;
  readonly selected: readonly WatchlistItemId[];
  readonly chosen: readonly WatchlistItem[];
  readonly onChange: (checked: boolean) => void;
}): ReactElement => (
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
        onChange(checked);
      }}
    />
  </div>
);

export const WatchlistItems = ({
  compact = false,
}: {
  readonly compact?: boolean;
}): ReactElement => {
  const { list, details } = useWatchlist();
  const { state: monitoring } = useMonitoring();
  const { tasks } = useServiceApi();
  const { query, kind, archived, attention, justTracked } = useWatchlistView();
  const [comparing, setComparing] = useState(false);
  const [selected, setSelected] = useState<readonly WatchlistItemId[]>([]);
  const now = useNow();
  const allItems = list.data === undefined ? [] : list.data.items;
  const allDetails = details.data === undefined ? [] : details.data.items;
  const allTasks = tasks.data === undefined ? [] : tasks.data.tasks;
  const allMonitors =
    monitoring.data === undefined ? [] : monitoring.data.monitors;
  const chosen = allItems.filter(
    (item) => selected.includes(item.id) && !item.archived
  );
  const dataFor = (item: WatchlistItem) =>
    allDetails.find((entry) => entry.itemId === item.id);
  const monitorFor = (item: WatchlistItem) =>
    allMonitors.find((monitor) => monitor.itemId === item.id);
  const attentionFor = (item: WatchlistItem): string | null =>
    attentionWords(dataFor(item)?.enrichment?.status, monitorFor(item));
  const needsCount = allItems.filter(
    (item) => !item.archived && attentionFor(item) !== null
  ).length;
  const items = allItems
    .filter(
      (item) =>
        item.archived === archived &&
        (kind === "all" || categoryOf(item) === kind) &&
        (!attention || attentionFor(item) !== null) &&
        `${item.title} ${item.notes} ${sourceWords(item)} ${sourceSearch(item)}`
          .toLowerCase()
          .includes(query.toLowerCase())
    )
    .toSorted((a, b) => b.createdAt - a.createdAt);
  const delays = useArrivalDelays(items.map((item) => item.id));
  const stopComparing = () => {
    setComparing(false);
    setSelected([]);
  };
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Saved items">
      <ListFilters
        compact={compact}
        needsCount={needsCount}
        comparing={comparing}
        onCompare={() => {
          setComparing(!comparing);
          setSelected([]);
        }}
      />
      <p className="watch-sentence">
        {items.length} {archived ? "archived" : "saved"}{" "}
        {items.length === 1 ? "item" : "items"}
      </p>
      {list.isPending ? <Skeleton className="h-32 w-full rounded-lg" /> : null}
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
        <Empty className="watch-card py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookmarkIcon />
            </EmptyMedia>
            <EmptyTitle>{emptyTitle(query, archived)}</EmptyTitle>
            <EmptyDescription>
              {query
                ? "Try another name, address or website."
                : "Paste a wallet or token address above, or save a link you want to come back to."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      <Comparison chosen={chosen} onClose={stopComparing} />
      {items.length === 0 ? null : (
        <ul className="watch-card watch-rows">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <MotionItem
                key={item.id}
                delay={delays.get(item.id) ?? 0}
                className="flex min-w-0"
              >
                <li className="flex min-w-0 flex-1 items-start">
                  {comparing ? (
                    <CompareBox
                      item={item}
                      selected={selected}
                      chosen={chosen}
                      onChange={(checked) => {
                        setSelected((previous) =>
                          checked
                            ? [...previous, item.id].slice(0, 3)
                            : previous.filter((id) => id !== item.id)
                        );
                      }}
                    />
                  ) : null}
                  {justTracked.includes(item.id) ? (
                    <JustTrackedRow item={item} now={now} />
                  ) : (
                    <WatchRow
                      item={item}
                      data={dataFor(item)}
                      monitor={monitorFor(item)}
                      snapshot={snapshotForItem(item, allTasks)}
                      attention={attentionFor(item)}
                      now={now}
                    />
                  )}
                </li>
              </MotionItem>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
};
