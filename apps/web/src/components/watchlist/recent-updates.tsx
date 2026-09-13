import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { useWatchlist } from "../../lib/watchlist-client";

export const RecentUpdates = ({
  limit = 6,
}: {
  readonly limit?: number;
}): ReactElement | null => {
  const { list, details } = useWatchlist();
  const updates = (details.data?.items ?? [])
    .flatMap((data) => {
      const item = list.data?.items.find(
        (entry) => entry.id === data.itemId && !entry.archived
      );
      return item && data.latest ? [{ item, observation: data.latest }] : [];
    })
    .toSorted((a, b) => b.observation.at - a.observation.at)
    .slice(0, limit);
  if (updates.length === 0) {
    return null;
  }
  return (
    <section
      aria-label="Recent Watchlist updates"
      className="flex min-w-0 flex-col gap-3"
    >
      <h2 className="text-sm font-semibold">Recent updates</h2>
      <ul className="flex flex-col gap-3">
        {updates.map(({ item, observation }) => (
          <li
            key={item.id}
            className="flex min-w-0 items-baseline justify-between gap-3 text-sm"
          >
            <div className="min-w-0">
              <Link
                className="block truncate font-medium hover:underline"
                to="/watchlist/$itemId"
                params={{ itemId: item.id }}
              >
                {item.title}
              </Link>
              <p className="text-muted-foreground truncate text-xs">
                {observation.stubbed ? "Simulated · " : ""}
                {observation.price === null
                  ? (observation.facts[0]?.value ?? observation.source)
                  : `${observation.currency ?? ""} ${observation.price.toLocaleString()}`}
              </p>
            </div>
            <time
              className="text-muted-foreground shrink-0 text-xs"
              dateTime={new Date(observation.at).toISOString()}
            >
              {new Date(observation.at).toLocaleDateString()}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
};
