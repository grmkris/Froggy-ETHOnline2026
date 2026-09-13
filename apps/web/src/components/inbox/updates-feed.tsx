import type { Update, UpdateId, WatchlistItemId } from "@froggy/domain";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { cn } from "@froggy/ui/lib/utils";
import { Link, useSearch } from "@tanstack/react-router";
import { ArrowLeftIcon, BellIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";

import {
  useReadUpdates,
  useUpdate,
  useUpdatesPage,
} from "../../lib/updates-client";
import { useWatchlistDetails } from "../../lib/watchlist-client";
import { MotionItem, useArrivalDelays } from "../motion-item";
import { SavedItemCard } from "../watchlist/saved-item-card";
import { ActivityCard } from "../watchlist/wallet-monitor-panel";

const UpdateItem = ({ id }: { readonly id: WatchlistItemId }) => {
  const details = useWatchlistDetails(id);
  return details.data ? (
    <div className="rounded-2xl border">
      <SavedItemCard item={details.data.item} data={details.data.data} />
    </div>
  ) : null;
};

const date = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const UpdateRow = ({
  update,
  selected,
}: {
  readonly update: Update;
  readonly selected: boolean;
}) => (
  <div>
    <Link
      to="/inbox"
      search={{ feed: "updates", update: update.id }}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "focus-visible:ring-ring flex min-h-11 flex-col gap-2 rounded-xl p-3 outline-none focus-visible:ring-2",
        selected ? "bg-brand-soft" : "hover:bg-muted"
      )}
    >
      <span className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>{update.readAt === null ? "Unread" : "Read"}</span>
        <time dateTime={new Date(update.at).toISOString()}>
          {date(update.at)}
        </time>
      </span>
      <span
        className={cn(
          "line-clamp-2 text-sm",
          update.readAt === null ? "font-bold" : "font-medium"
        )}
      >
        {update.title}
      </span>
      <span className="text-muted-foreground line-clamp-2 text-xs">
        {update.body}
      </span>
      {update.stubbed ? (
        <Badge variant="outline" className="self-start">
          Simulated
        </Badge>
      ) : null}
    </Link>
  </div>
);

const UpdateReader = ({ id }: { readonly id: UpdateId }) => {
  const entry = useUpdate(id);
  const read = useReadUpdates();
  const attempted = useRef(false);
  const reader = useRef<HTMLElement>(null);
  const { mutate } = read;
  useEffect(() => {
    if (entry.data?.update.readAt === null && !attempted.current) {
      attempted.current = true;
      mutate(id);
    }
  }, [entry.data?.update.readAt, id, mutate]);
  useEffect(() => {
    if (entry.isSuccess && window.innerWidth < 1024) {
      reader.current?.focus({ preventScroll: true });
    }
  }, [entry.isSuccess]);
  if (entry.isPending) {
    return <output className="p-6">Loading update…</output>;
  }
  if (entry.isError) {
    return (
      <div className="p-6" role="alert">
        <p>{entry.error.message}</p>
        <Button
          variant="outline"
          onClick={() => {
            void entry.refetch();
          }}
        >
          Retry update
        </Button>
      </div>
    );
  }
  const { update, activity } = entry.data;
  return (
    <article
      ref={reader}
      tabIndex={-1}
      className="mx-auto flex max-w-3xl flex-col gap-5 p-4 outline-none sm:p-8"
    >
      <Link
        to="/inbox"
        search={{ feed: "updates" }}
        className="text-muted-foreground inline-flex min-h-11 items-center gap-2 self-start text-sm lg:hidden"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        Updates
      </Link>
      <header className="flex flex-col gap-3">
        {update.stubbed ? (
          <Badge variant="outline" className="self-start">
            Simulated
          </Badge>
        ) : null}
        <h2 className="text-section text-[24px] leading-7">{update.title}</h2>
        <time
          className="text-muted-foreground text-sm"
          dateTime={new Date(update.at).toISOString()}
        >
          {date(update.at)}
        </time>
      </header>
      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
        {update.body}
      </p>
      {update.itemId ? <UpdateItem id={update.itemId} /> : null}
      {activity ? <ActivityCard activity={activity} /> : null}
      {update.activityId && !activity ? (
        <p className="text-muted-foreground text-sm">
          The onchain record has expired; this is what Froggy filed.
        </p>
      ) : null}
      {update.itemId ? (
        <Link
          to="/watchlist/$itemId"
          params={{ itemId: update.itemId }}
          className="text-brand inline-flex min-h-11 items-center self-start text-sm font-medium underline underline-offset-4"
        >
          Open in Watchlist
        </Link>
      ) : null}
      {read.isError ? (
        <div role="alert">
          <p>{read.error.message}</p>
          <Button
            variant="ghost"
            onClick={() => {
              read.mutate(id);
            }}
          >
            Mark read
          </Button>
        </div>
      ) : null}
    </article>
  );
};

export const UpdatesFeed = () => {
  const search = useSearch({ from: "/workspace/inbox" });
  const [cursors, setCursors] = useState<readonly UpdateId[]>([]);
  const page = useUpdatesPage(cursors.at(-1));
  const read = useReadUpdates();
  const delays = useArrivalDelays(
    page.data?.updates.map((entry) => entry.id) ?? []
  );
  return (
    <div className="flex min-h-0 flex-1" data-slot="updates-feed">
      <section
        aria-label="Updates list"
        className={cn(
          "bg-card flex min-h-0 w-full flex-col border-r lg:w-80 lg:shrink-0",
          search.update && "hidden lg:flex"
        )}
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b p-4">
          <h2 className="text-section">Updates</h2>
          <Button
            variant="ghost"
            disabled={(page.data?.unread ?? 0) === 0 || read.isPending}
            onClick={() => {
              read.mutate("all");
            }}
          >
            Mark all read
          </Button>
          {read.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {read.error.message}
            </p>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {page.isPending ? (
            <output className="p-4 text-sm">Loading updates…</output>
          ) : null}
          {page.isError ? (
            <div role="alert" className="p-4">
              <p>{page.error.message}</p>
              <Button
                variant="outline"
                onClick={() => {
                  void page.refetch();
                }}
              >
                Retry updates
              </Button>
            </div>
          ) : null}
          {page.data?.updates.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <BellIcon aria-hidden className="text-brand mx-auto size-8" />
                <EmptyTitle>All quiet for now</EmptyTitle>
                <EmptyDescription>
                  Watch an address or save an item. What Froggy finds will
                  appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          <ul className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {page.data?.updates.map((update) => (
                <li key={update.id}>
                  <MotionItem delay={delays.get(update.id) ?? 0}>
                    <UpdateRow
                      update={update}
                      selected={search.update === update.id}
                    />
                  </MotionItem>
                </li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
        <footer className="flex shrink-0 justify-between gap-2 border-t p-3">
          <Button
            variant="ghost"
            disabled={cursors.length === 0}
            onClick={() => {
              setCursors((current) => current.slice(0, -1));
            }}
          >
            Newer updates
          </Button>
          <Button
            variant="ghost"
            disabled={!page.data?.next}
            onClick={() => {
              const next = page.data?.next;
              if (next) {
                setCursors((current) => [...current, next]);
              }
            }}
          >
            Older updates
          </Button>
        </footer>
      </section>
      <section
        aria-label="Update reader"
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain",
          !search.update && "hidden lg:block"
        )}
      >
        {search.update ? (
          <UpdateReader key={search.update} id={search.update} />
        ) : (
          <Empty className="py-24">
            <EmptyHeader>
              <EmptyTitle>Your updates, in one place</EmptyTitle>
              <EmptyDescription>
                Select an update to read what happened.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </div>
  );
};
