import type { WatchlistItem } from "@froggy/domain";
import { WatchlistDetails } from "@froggy/protocol";
import type { TokenSnapshotResult } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { useQueries } from "@tanstack/react-query";
import { Schema } from "effect";
import type { ReactElement } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useWatchlist } from "../../lib/watchlist-client";
import { useWorkspace } from "../../lib/workspace-context";

const ComparedHistory = ({
  snapshots,
  titles,
}: {
  readonly snapshots: readonly TokenSnapshotResult[];
  readonly titles: readonly string[];
}): ReactElement | null => {
  const series = snapshots.map(
    (snapshot) =>
      snapshot.series.find((entry) => entry.window === "7d")?.points ?? []
  );
  const [first] = series;
  if (
    !first ||
    series.length < 2 ||
    new Set(snapshots.map((snapshot) => snapshot.stubbed)).size > 1
  ) {
    return null;
  }
  const shared = first.filter((point) =>
    series.every((points) => points.some((entry) => entry.at === point.at))
  );
  const [baseline] = shared;
  if (!baseline || shared.length < 2) {
    return (
      <p className="text-muted-foreground text-xs">
        These snapshots do not have enough overlapping history to compare.
      </p>
    );
  }
  const bases = series.map(
    (points) => points.find((point) => point.at === baseline.at)?.close ?? 0
  );
  if (bases.some((price) => price <= 0)) {
    return null;
  }
  const data = shared.map((point) =>
    Object.fromEntries<number>([
      ["at", point.at] as const,
      ...series.map(
        (points, index) =>
          [
            `series${index}`,
            ((points.find((entry) => entry.at === point.at)?.close ?? 0) /
              (bases[index] ?? 1)) *
              100,
          ] as const
      ),
    ])
  );
  return (
    <section
      aria-label="Token performance comparison"
      className="flex flex-col gap-3"
    >
      <p className="text-muted-foreground text-xs">
        7-day history · Each token starts at 100 at the first shared
        observation. {snapshots[0]?.stubbed === true ? "Simulated data." : ""}
      </p>
      <div className="h-56 min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="at"
              tickFormatter={(value: number) =>
                new Date(value).toLocaleDateString()
              }
              minTickGap={50}
              fontSize={11}
            />
            <YAxis domain={["auto", "auto"]} width={42} fontSize={11} />
            <Tooltip
              isAnimationActive={false}
              labelFormatter={(value) =>
                new Date(Number(value)).toLocaleString()
              }
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((_, index) => (
              <Line
                key={titles[index]}
                name={titles[index] ?? "Token"}
                dataKey={`series${index}`}
                stroke={
                  [
                    "var(--brand)",
                    "var(--foreground)",
                    "var(--muted-foreground)",
                  ][index] ?? "var(--brand)"
                }
                strokeDasharray={["0", "6 3", "2 3"][index] ?? "0"}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

export const CompareItems = ({
  items,
  onClose,
}: {
  readonly items: readonly WatchlistItem[];
  readonly onClose: () => void;
}): ReactElement => {
  const { request } = useWatchlist();
  const { app } = useWorkspace();
  const queries = useQueries({
    queries: items.map((item) => ({
      queryKey: ["watchlist-details", app.sessionId, item.id],
      queryFn: async () =>
        Schema.decodeUnknownSync(WatchlistDetails)(
          await request(`/api/watchlist/${item.id}/details`)
        ),
      retry: false,
    })),
  });
  const snapshots = queries.flatMap((query) =>
    query.data?.snapshot ? [query.data.snapshot] : []
  );
  const labels = [
    ...new Set(
      queries.flatMap(
        (query) =>
          query.data?.data.latest?.facts.map((fact) => fact.label) ?? []
      )
    ),
  ].slice(0, 12);
  return (
    <section
      aria-label="Compare saved items"
      className="bg-card flex min-w-0 flex-col gap-4 rounded-2xl border p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Compare saved facts</h2>
        <Button variant="ghost" onClick={onClose}>
          Close comparison
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Existing snapshots only; no new purchase. Check currencies, variants and
        trip details before comparing prices.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="p-2">
                Details
              </th>
              {items.map((item) => (
                <th scope="col" className="min-w-40 p-2" key={item.id}>
                  {item.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="p-2 font-normal">
                Saved context
              </th>
              {items.map((item) => (
                <td className="p-2 align-top text-xs" key={item.id}>
                  {item.notes || "Not specified"}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="p-2 font-normal">
                Price
              </th>
              {queries.map((query, index) => (
                <td className="p-2 tabular-nums" key={items[index]?.id}>
                  {query.data?.data.latest?.price === null ||
                  query.data?.data.latest?.price === undefined
                    ? "Unavailable"
                    : `${query.data.data.latest.currency ?? ""} ${query.data.data.latest.price.toLocaleString()}`}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="p-2 font-normal">
                Observed
              </th>
              {queries.map((query, index) => (
                <td className="p-2 text-xs" key={items[index]?.id}>
                  {query.data?.data.latest
                    ? `${query.data.data.latest.stubbed ? "Simulated · " : ""}${new Date(query.data.data.latest.at).toLocaleString()}`
                    : "Not available"}
                </td>
              ))}
            </tr>
            {labels.map((label) => (
              <tr key={label}>
                <th scope="row" className="p-2 font-normal">
                  {label}
                </th>
                {queries.map((query, index) => (
                  <td key={items[index]?.id} className="p-2 text-xs">
                    {query.data?.data.latest?.facts.find(
                      (fact) => fact.label === label
                    )?.value ?? "Unknown"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {snapshots.length === items.length ? (
        <ComparedHistory
          snapshots={snapshots}
          titles={items.map((item) => item.title)}
        />
      ) : null}
      {queries.some((query) => query.isError) ? (
        <p role="alert" className="text-destructive text-sm">
          Some saved details could not be loaded.
        </p>
      ) : null}
    </section>
  );
};
