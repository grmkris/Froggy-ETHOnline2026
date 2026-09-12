import { WatchlistItemId } from "@froggy/domain";
import type { WatchlistItem } from "@froggy/domain";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import { Skeleton } from "@froggy/ui/components/skeleton";
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
import { marketPrice } from "../components/watchlist/market-results";
import { ReminderForm } from "../components/watchlist/reminder-form";
import { TokenDiscovery } from "../components/watchlist/token-discovery";
import {
  ItemIcon,
  sourceWords,
  WatchlistItems,
} from "../components/watchlist/watchlist-items";
import { useServiceApi } from "../hooks/use-service-api";
import { useChatSurface } from "../lib/chat-context";
import { snapshotForItem } from "../lib/market-snapshots";
import { useWatchlist } from "../lib/watchlist-client";

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
      <div className="bg-brand-soft/50 border-border flex flex-col gap-5 rounded-3xl border p-6 sm:p-8">
        <ItemIcon item={item} />
        <div>
          <p className="text-muted-foreground mb-2 text-sm">
            {sourceWords(item)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {item.title}
          </h1>
        </div>
        <div>
          <Badge variant="outline">
            {item.archived ? "Archived" : "Saved for later"}
          </Badge>
        </div>
      </div>
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
          {item.source._tag === "token" ? item.source.address : item.source.url}
        </p>
        <p className="text-muted-foreground text-xs">
          Saved {new Date(item.createdAt).toLocaleDateString()}. No automatic
          price checks.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <SaveItem item={item} />
        {item.source._tag === "token" ? null : (
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
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-4 py-6 sm:px-8 sm:py-9">
        {id === null ? (
          <>
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-brand mb-1 text-xs font-medium tracking-wider uppercase">
                  Your corner of the internet
                </p>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Watchlist
                </h1>
                <p className="text-muted-foreground mt-2 text-sm">
                  A token. A trip. Something you’ve had your eye on.
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
            {discoveryOpen ? <TokenDiscovery /> : null}
            <WatchlistItems />
            <section
              className="border-border flex flex-col gap-3 border-t pt-6"
              aria-label="Reminders and scheduled tasks"
            >
              <h2 className="text-lg font-semibold">Coming up</h2>
              <ScheduleList compact />
            </section>
          </>
        ) : (
          <>
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
                  {list.isError ? "Could not load this item" : "Item not found"}
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
              <ItemDetail item={item} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};
