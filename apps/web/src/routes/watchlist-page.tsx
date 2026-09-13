import { WatchlistItemId } from "@froggy/domain";
import type { WatchlistItem } from "@froggy/domain";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { cn } from "@froggy/ui/lib/utils";
import {
  Link,
  useLocation,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  MessageCircleIcon,
} from "lucide-react";
import type { ReactElement } from "react";

import { ScheduleList } from "../components/settings/schedule-list";
import { SaveItem } from "../components/watchlist/item-form";
import { ItemIcon, sourceWords } from "../components/watchlist/item-identity";
import { ItemImage } from "../components/watchlist/item-image";
import { marketPrice } from "../components/watchlist/market-results";
import {
  MonitoringBudget,
  ExistingMonitoring,
  ItemMonitoring,
} from "../components/watchlist/monitoring-panel";
import { PasteItem } from "../components/watchlist/paste-item";
import { PriceHistory } from "../components/watchlist/price-history";
import { RecentUpdates } from "../components/watchlist/recent-updates";
import { RefreshItem } from "../components/watchlist/refresh-item";
import { ReminderForm } from "../components/watchlist/reminder-form";
import { TokenDiscovery } from "../components/watchlist/token-discovery";
import { WalletMonitorPanel } from "../components/watchlist/wallet-monitor-panel";
import { WatchlistItems } from "../components/watchlist/watchlist-items";
import { useServiceApi } from "../hooks/use-service-api";
import { useChatSurface } from "../lib/chat-context";
import { snapshotForItem } from "../lib/market-snapshots";
import { useWatchlistDetails, useWatchlist } from "../lib/watchlist-client";

const ItemFacts = ({
  item,
}: {
  readonly item: WatchlistItem;
}): ReactElement => {
  const details = useWatchlistDetails(item.id);
  return (
    <>
      {" "}
      {details.data?.data.enrichment ? (
        <output className="text-muted-foreground text-sm">
          {details.data.data.enrichment.status.replaceAll("_", " ")} ·{" "}
          {details.data.data.enrichment.note}
        </output>
      ) : null}
      {details.data?.data.enrichment?.taskId ? (
        <Link
          className="text-brand min-h-11 w-fit content-center text-sm underline"
          to="/services"
          search={{ task: details.data.data.enrichment.taskId }}
        >
          View enrichment task
        </Link>
      ) : null}
      {(details.data?.data.imageUrl ?? "") === "" ? null : (
        <ItemImage key={item.id} id={item.id} title={item.title} />
      )}
      {details.data?.snapshot ? (
        <PriceHistory snapshot={details.data.snapshot} />
      ) : null}
      {details.data?.data.latest ? (
        <section
          className="bg-card flex flex-col gap-3 rounded-2xl border p-5"
          aria-label="Saved facts"
        >
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="font-semibold">Latest details</h2>
            <p className="text-muted-foreground text-xs">
              {details.data.data.latest.stubbed ? "Simulated · " : ""}
              {new Date(details.data.data.latest.at).toLocaleString()}
            </p>
          </div>
          {details.data.data.latest.price === null ? null : (
            <p className="text-2xl font-semibold tabular-nums">
              {details.data.data.latest.currency}{" "}
              {details.data.data.latest.price.toLocaleString()}
            </p>
          )}
          <p className="text-muted-foreground text-xs break-words">
            {details.data.data.latest.basis}
          </p>
          <p className="text-muted-foreground text-xs">
            Source:{" "}
            {details.data.data.latest.sourceUrl === null ? (
              details.data.data.latest.source
            ) : (
              <a
                className="underline"
                href={details.data.data.latest.sourceUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {details.data.data.latest.source}
              </a>
            )}
          </p>
          {details.data.data.observations.length > 1 ? (
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm">
                Earlier observations
              </summary>
              <ol className="flex flex-col gap-3">
                {details.data.data.observations
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
          <dl className="grid gap-3 sm:grid-cols-2">
            {details.data.data.latest.facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-muted-foreground text-xs">{fact.label}</dt>
                <dd className="mt-1 text-sm break-words">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </>
  );
};

const ItemDetail = ({
  item,
}: {
  readonly item: WatchlistItem;
}): ReactElement => {
  const { patch, remove } = useWatchlist();
  const { tasks } = useServiceApi();
  const snapshot = snapshotForItem(item, tasks.data?.tasks ?? []);
  const { attachItem } = useChatSurface();
  const navigate = useNavigate();
  return (
    <article className="flex flex-col gap-6">
      <div className="bg-card border-border flex flex-col gap-3 rounded-2xl border p-5">
        <ItemIcon item={item} />
        <div>
          <p className="text-muted-foreground mb-2 text-sm">
            {sourceWords(item)}
          </p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {item.title}
          </h1>
        </div>
        <div>
          <Badge variant="outline">
            {item.archived ? "Archived" : "Saved for later"}
          </Badge>
        </div>
      </div>
      <ItemFacts item={item} />
      <RefreshItem item={item} />
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Bring this into your conversation to research it, compare options, or
          plan what comes next.
        </p>
        <Button
          className="min-h-11 self-start"
          onClick={() => {
            attachItem(item);
            void navigate({ to: "/" });
          }}
        >
          <MessageCircleIcon data-icon="inline-start" />
          Ask Froggy about this
        </Button>
      </div>
      <WalletMonitorPanel item={item} />
      {snapshot === null ? null : (
        <section
          aria-label="Token snapshot"
          className="bg-muted flex flex-col gap-2 rounded-2xl p-4"
        >
          <p className="text-2xl font-semibold tabular-nums">
            {marketPrice(snapshot.token.priceUsd)}
          </p>
          <p className="text-muted-foreground text-xs">
            {snapshot.stubbed ? "Simulated · " : ""}Snapshot ·{" "}
            {new Date(snapshot.observedAt).toLocaleString()}
          </p>
        </section>
      )}
      <div className="flex flex-col gap-3">
        <h2 className="font-medium">The details</h2>
        {item.notes ? (
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {item.notes}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Add what matters to you: your target price, a size, or your travel
            dates.
          </p>
        )}
        <p className="text-muted-foreground font-mono text-xs break-all">
          {item.source._tag === "token" || item.source._tag === "wallet"
            ? item.source.address
            : sourceWords(item)}
        </p>
        <p className="text-muted-foreground text-xs">
          Saved {new Date(item.createdAt).toLocaleDateString()}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
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
        {item.source._tag === "token" ||
        item.source._tag === "wallet" ||
        item.source._tag === "email" ? null : (
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
        )}
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
    </article>
  );
};

export const WatchlistPage = (): ReactElement => {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const discoveryOpen = search.discover === true;
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
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      data-slot="watchlist-page"
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-7 px-4 py-6 sm:px-8 sm:py-9",
          id === null ? "max-w-4xl" : "max-w-7xl"
        )}
      >
        {id === null ? (
          <>
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Watchlist
                </h1>
                <p className="text-muted-foreground mt-2 text-sm">
                  Good things to come back to.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  aria-expanded={discoveryOpen}
                  onClick={() => {
                    void navigate({
                      to: "/watchlist",
                      search: discoveryOpen ? {} : { discover: true },
                    });
                  }}
                >
                  {discoveryOpen ? "Close discovery" : "Find tokens"}
                </Button>
                <ReminderForm />
                <SaveItem />
              </div>
            </header>
            <PasteItem />
            {discoveryOpen ? <TokenDiscovery /> : null}
            <WatchlistItems />
            <RecentUpdates />
            <details>
              <summary className="text-muted-foreground min-h-11 cursor-pointer py-3 text-sm">
                Manage monitoring
              </summary>
              <div className="flex flex-col gap-5 py-3">
                <MonitoringBudget />
                <ExistingMonitoring />
              </div>
            </details>
            <section
              className="border-border flex flex-col gap-3 border-t pt-6"
              aria-label="Reminders and scheduled tasks"
            >
              <h2 className="text-lg font-semibold">Coming up</h2>
              <ScheduleList compact />
            </section>
          </>
        ) : (
          <div className="grid min-w-0 gap-7 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
            <aside
              aria-label="Your saved items"
              className="hidden min-w-0 xl:sticky xl:top-0 xl:block xl:max-h-[calc(100dvh-10rem)] xl:self-start xl:overflow-y-auto"
            >
              <WatchlistItems compact />
            </aside>
            <div className="flex min-w-0 flex-col gap-6">
              <Link
                to="/watchlist"
                className="text-muted-foreground focus-visible:ring-ring flex min-h-11 w-fit items-center gap-2 rounded-lg text-sm outline-none focus-visible:ring-2"
              >
                <ArrowLeftIcon aria-hidden className="size-4" />
                Watchlist
              </Link>
              {list.isPending ? (
                <Skeleton className="h-80 w-full rounded-3xl" />
              ) : null}
              {!list.isPending && item === undefined ? (
                <div role="alert">
                  <h1 className="text-xl font-semibold">
                    {list.isError
                      ? "Could not load this item"
                      : "Item not found"}
                  </h1>
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
              {!list.isPending && item !== undefined ? (
                <>
                  <ItemDetail item={item} />
                  {item.source._tag === "wallet" ||
                  item.source._tag === "email" ? null : (
                    <>
                      <ItemMonitoring item={item} />
                      <MonitoringBudget />
                    </>
                  )}
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
