import { WatchlistItemId, shortEvmAddress } from "@froggy/domain";
import type { WatchlistData, WatchlistItem } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { Skeleton } from "@froggy/ui/components/skeleton";
import {
  Link,
  useLocation,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { ArrowUpRightIcon } from "lucide-react";
import type { ReactElement } from "react";

import { InboxNudge } from "../components/chat/inbox-nudge";
import { ScheduleList } from "../components/settings/schedule-list";
import { SaveItem } from "../components/watchlist/item-form";
import {
  AddressChip,
  ChainChips,
  ItemIcon,
  sourceWords,
  displayTitle,
  ItemPresence,
} from "../components/watchlist/item-identity";
import { ItemImage } from "../components/watchlist/item-image";
import { marketPrice } from "../components/watchlist/market-results";
import {
  MonitoringBudget,
  ExistingMonitoring,
  ItemMonitoring,
} from "../components/watchlist/monitoring-panel";
import { NotifyToggle } from "../components/watchlist/notify-toggle";
import { PriceHistory } from "../components/watchlist/price-history";
import { RefreshItem } from "../components/watchlist/refresh-item";
import { TrackBar } from "../components/watchlist/track-bar";
import { WalletMonitorPanel } from "../components/watchlist/wallet-monitor-panel";
import { WatchlistItems } from "../components/watchlist/watchlist-items";
import { useNow } from "../hooks/use-now";
import { useServiceApi } from "../hooks/use-service-api";
import { useChatSurface } from "../lib/chat-context";
import { snapshotForItem } from "../lib/market-snapshots";
import type { MarketSnapshot } from "../lib/market-snapshots";
import { useMonitoring } from "../lib/monitoring-client";
import {
  balanceWords,
  pageSentence,
  stateWords,
  watchStanding,
} from "../lib/watch-words";
import { useWatchlistDetails, useWatchlist } from "../lib/watchlist-client";

const Eyebrow = ({ children }: { readonly children: string }): ReactElement => (
  <h2 className="playground-eyebrow">{children}</h2>
);

/** The newest observation with its source and the facts it carried. */
const LatestDetails = ({
  data,
}: {
  readonly data: WatchlistData;
}): ReactElement | null => {
  const { latest } = data;
  if (!latest) {
    return null;
  }
  return (
    <div className="watch-card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">Latest details</h3>
        <p className="watch-time">
          {latest.stubbed ? "Simulated · " : ""}
          {new Date(latest.at).toLocaleString()}
        </p>
      </div>
      {latest.price === null ? null : (
        <p className="text-2xl font-semibold tabular-nums">
          {latest.currency} {latest.price.toLocaleString()}
        </p>
      )}
      <p className="text-muted-foreground text-xs break-words">
        {latest.basis}
      </p>
      <p className="text-muted-foreground text-xs">
        Source:{" "}
        {latest.sourceUrl === null ? (
          latest.source
        ) : (
          <a
            className="underline"
            href={latest.sourceUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {latest.source}
          </a>
        )}
      </p>
      {data.observations.length > 1 ? (
        <details className="watch-disclosure">
          <summary className="playground-eyebrow min-h-11">
            Earlier observations
          </summary>
          <ol className="flex flex-col gap-3 pt-2">
            {data.observations
              .slice(-10)
              .toReversed()
              .map((observation, index) => (
                <li
                  key={`${observation.at}:${index}`}
                  className="text-muted-foreground text-xs"
                >
                  <time>{new Date(observation.at).toLocaleString()}</time> ·{" "}
                  {observation.stubbed ? "Simulated · " : ""}
                  {observation.source}
                  <p className="mt-1 break-words">
                    {observation.price === null
                      ? "No price reported"
                      : `${observation.currency ?? ""} ${observation.price.toLocaleString()}`}{" "}
                    · {observation.basis}
                  </p>
                </li>
              ))}
          </ol>
        </details>
      ) : null}
      {latest.facts.length > 0 ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {latest.facts.map((fact) => (
            <div key={fact.label}>
              <dt className="watch-help">{fact.label}</dt>
              <dd className="mt-1 text-sm break-words">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
};

/** The enrichment trail: what the paid lookup said, and where its task lives. */
const EnrichmentTrail = ({
  enrichment,
}: {
  readonly enrichment: WatchlistData["enrichment"];
}): ReactElement | null => {
  if (enrichment === null) {
    return null;
  }
  return (
    <>
      <output className="text-muted-foreground text-sm">
        {enrichment.status.replaceAll("_", " ")} · {enrichment.note}
      </output>
      {enrichment.taskId === null ? null : (
        <Link
          className="text-brand min-h-11 w-fit content-center text-sm underline"
          to="/activity"
          search={{ tab: "tools", task: enrichment.taskId }}
        >
          View enrichment task
        </Link>
      )}
    </>
  );
};

const TokenSnapshot = ({
  snapshot,
}: {
  readonly snapshot: MarketSnapshot | null;
}): ReactElement | null =>
  snapshot === null ? null : (
    <p className="text-sm tabular-nums">
      {marketPrice(snapshot.token.priceUsd)}
      <span className="watch-time ml-2">
        {snapshot.stubbed ? "Simulated · " : ""}
        {new Date(snapshot.observedAt).toLocaleString()}
      </span>
    </p>
  );

/** Balances, facts, the price history and the enrichment trail, after the watch. */
const ItemFacts = ({
  item,
}: {
  readonly item: WatchlistItem;
}): ReactElement | null => {
  const details = useWatchlistDetails(item.id);
  const { tasks } = useServiceApi();
  const snapshot = snapshotForItem(item, tasks.data?.tasks ?? []);
  const data = details.data?.data;
  if (data === undefined) {
    return null;
  }
  const balances = balanceWords(data.presence ?? []);
  const image = (data.imageUrl ?? "") !== "";
  const history = details.data?.snapshot ?? null;
  const empty =
    balances === null &&
    data.latest === null &&
    data.enrichment === null &&
    !image &&
    history === null &&
    snapshot === null;
  if (empty) {
    return null;
  }
  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-label="Balances and facts"
    >
      <Eyebrow>Balances and facts</Eyebrow>
      {balances === null ? null : (
        <p className="watch-event-sentence">{balances}</p>
      )}
      <TokenSnapshot snapshot={snapshot} />
      {image ? (
        <ItemImage key={item.id} id={item.id} title={item.title} />
      ) : null}
      {history === null ? null : <PriceHistory snapshot={history} />}
      <LatestDetails data={data} />
      <EnrichmentTrail enrichment={data.enrichment} />
      <RefreshItem item={item} />
    </section>
  );
};

/** The identity: name, address, chains, state. Never a badge that says the same for every item. */
const DetailIdentity = ({
  item,
}: {
  readonly item: WatchlistItem;
}): ReactElement => {
  const details = useWatchlistDetails(item.id);
  const { state: monitoring } = useMonitoring();
  const now = useNow();
  const presence = details.data?.data.presence ?? [];
  const standing = watchStanding(item, {
    presence,
    monitor: monitoring.data?.monitors.find(
      (entry) => entry.itemId === item.id
    ),
    now,
  });
  const address = "address" in item.source ? item.source.address : null;
  return (
    <header className="flex flex-col gap-4" data-slot="watch-identity">
      <div className="flex items-start justify-between gap-4">
        <ItemIcon item={item} />
        <span className="watch-state" data-state={standing.state}>
          {stateWords[standing.state]}
        </span>
      </div>
      <h1 className="watch-title">
        {displayTitle(item, details.data?.data.presence)}
      </h1>
      {address === null ? (
        <p className="watch-row-words">{sourceWords(item)}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <AddressChip
            address={address}
            named={
              displayTitle(item, details.data?.data.presence) ===
              shortEvmAddress(address)
            }
          />
          <ChainChips rows={presence} />
        </div>
      )}
      {standing.words === null ? null : (
        <p className="watch-row-words text-foreground">{standing.words}</p>
      )}
      {address === null ? null : (
        <ItemPresence item={item} data={details.data?.data} />
      )}
    </header>
  );
};

/** What Froggy is doing about this item: the live watch for an address, the scheduled check for a page. */
const MonitorSlot = ({
  item,
}: {
  readonly item: WatchlistItem;
}): ReactElement | null => {
  const details = useWatchlistDetails(item.id);
  if ("address" in item.source) {
    return (
      <>
        <NotifyToggle item={item} data={details.data?.data} />
        <WalletMonitorPanel item={item} />
      </>
    );
  }
  if (item.source._tag === "email") {
    return null;
  }
  return <ItemMonitoring item={item} />;
};

const ItemActions = ({
  item,
}: {
  readonly item: WatchlistItem;
}): ReactElement => {
  const { patch, remove } = useWatchlist();
  const { attachItem } = useChatSurface();
  const navigate = useNavigate();
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="playground-chip"
          onClick={() => {
            attachItem(item);
            void navigate({ to: "/" });
          }}
        >
          Ask Froggy about this
        </button>
        <SaveItem item={item} />
        {item.source._tag === "email" ? (
          <Button
            nativeButton={false}
            variant="outline"
            render={
              <Link to="/inbox" search={{ message: item.source.emailId }} />
            }
          >
            Open source email
          </Button>
        ) : null}
        {"url" in item.source ? (
          <Button
            nativeButton={false}
            render={
              <a
                aria-label="Open website"
                href={item.source.url}
                rel="noopener noreferrer"
                target="_blank"
              />
            }
            variant="outline"
          >
            Open website
            <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          disabled={patch.isPending}
          onClick={() => {
            patch.mutate({
              v: 1,
              id: item.id,
              revision: item.revision,
              archived: !item.archived,
            });
          }}
        >
          {item.archived ? "Restore item" : "Archive"}
        </Button>
        {item.archived ? (
          <Button
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate(item.id, {
                onSuccess: () => {
                  void navigate({ to: "/watchlist" });
                },
              });
            }}
          >
            Remove permanently
          </Button>
        ) : null}
      </div>
      {patch.isError || remove.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {patch.error?.message ?? remove.error?.message}
        </p>
      ) : null}
    </>
  );
};

const ItemDetail = ({
  item,
}: {
  readonly item: WatchlistItem;
}): ReactElement => (
  <article className="flex flex-col gap-8">
    <DetailIdentity item={item} />
    <MonitorSlot item={item} />
    <ItemFacts item={item} />
    <section className="flex flex-col gap-3" aria-label="Your notes">
      <Eyebrow>Your notes</Eyebrow>
      {item.notes ? (
        <p className="text-sm whitespace-pre-wrap">{item.notes}</p>
      ) : (
        <p className="text-muted-foreground text-sm">
          Add what matters to you: a target price, a size, or your travel dates.
        </p>
      )}
      <p className="watch-time">
        Saved {new Date(item.createdAt).toLocaleDateString()}
      </p>
    </section>
    <ItemActions item={item} />
  </article>
);

const ListHeader = (): ReactElement => {
  const { list } = useWatchlist();
  const now = useNow();
  return (
    <header className="flex flex-col">
      <p className="playground-eyebrow">Small frog. Sharp eyes.</p>
      <h1 className="watch-headline">
        <span className="playground-mark">Watchlist</span>
      </h1>
      <p className="watch-sentence mt-5">
        {list.data === undefined
          ? "Looking…"
          : pageSentence(list.data.items, now)}
      </p>
    </header>
  );
};

const ListPage = ({ track }: { readonly track: boolean }): ReactElement => (
  <>
    <ListHeader />
    <TrackBar autoFocus={track} />
    <WatchlistItems />
    <InboxNudge className="min-h-11 no-underline" />
    <details className="watch-disclosure flex flex-col gap-4">
      <summary className="playground-eyebrow min-h-11">
        Manage monitoring
      </summary>
      <div className="flex flex-col gap-5 pt-4">
        <MonitoringBudget />
        <ExistingMonitoring />
      </div>
    </details>
    <section
      className="flex flex-col gap-3"
      aria-label="Reminders and scheduled tasks"
    >
      <Eyebrow>Coming up</Eyebrow>
      <ScheduleList compact />
    </section>
  </>
);

const DetailPage = ({
  item,
  pending,
  error,
  retry,
}: {
  readonly item: WatchlistItem | undefined;
  readonly pending: boolean;
  readonly error: boolean;
  readonly retry: () => void;
}): ReactElement => (
  <div className="flex min-w-0 flex-col gap-6">
    <Link to="/watchlist" className="playground-chip self-start">
      ← Watchlist
    </Link>
    {pending ? <Skeleton className="h-80 w-full rounded-lg" /> : null}
    {!pending && item === undefined ? (
      <div role="alert" className="flex flex-col gap-3">
        <h1 className="watch-title">
          {error ? "Could not load this item" : "Item not found"}
        </h1>
        <Button variant="outline" className="self-start" onClick={retry}>
          Retry
        </Button>
      </div>
    ) : null}
    {!pending && item !== undefined ? <ItemDetail item={item} /> : null}
  </div>
);

export const WatchlistPage = (): ReactElement => {
  const search = useSearch({ strict: false });
  const path = useLocation({ select: (location) => location.pathname });
  const id = path.startsWith("/watchlist/")
    ? path.slice("/watchlist/".length)
    : null;
  const { list } = useWatchlist();
  const item =
    id !== null && WatchlistItemId.is(id)
      ? list.data?.items.find((entry) => entry.id === id)
      : undefined;
  return (
    <div
      className="watch-page playground min-h-0 flex-1 overflow-y-auto overscroll-contain"
      data-slot="watchlist-page"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-10">
        {id === null ? (
          <ListPage track={search.track === true} />
        ) : (
          <DetailPage
            item={item}
            pending={list.isPending}
            error={list.isError}
            retry={() => {
              void list.refetch();
            }}
          />
        )}
      </div>
    </div>
  );
};
