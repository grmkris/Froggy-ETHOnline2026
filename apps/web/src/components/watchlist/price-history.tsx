import type { TokenSnapshotResult } from "@froggy/protocol";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@froggy/ui/components/toggle-group";
import { useState } from "react";
import type { ReactElement } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { marketPrice } from "./market-results";

/** Evil Charts' static line presentation, using only the Recharts primitives needed here. */
export const PriceHistory = ({
  snapshot,
}: {
  readonly snapshot: TokenSnapshotResult;
}): ReactElement => {
  const [window, setWindow] = useState("24h");
  const series = snapshot.series.find((entry) => entry.window === window);
  const points = series?.points ?? [];
  const [first] = points;
  const last = points.at(-1);
  const formatTime = (at: number): string =>
    new Date(at).toLocaleString(
      undefined,
      window === "24h"
        ? { hour: "numeric", minute: "2-digit" }
        : { month: "short", day: "numeric" }
    );
  return (
    <section
      className="bg-card flex min-w-0 flex-col gap-4 rounded-2xl border p-4 sm:p-5"
      aria-label="Price history"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Price history</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            USD closing prices · Birdeye{snapshot.stubbed ? " · Simulated" : ""}
          </p>
        </div>
        <ToggleGroup
          value={[window]}
          onValueChange={(values) => {
            setWindow(values[0] ?? "24h");
          }}
          variant="outline"
          aria-label="History period"
        >
          <ToggleGroupItem value="24h" className="min-h-11">
            24h
          </ToggleGroupItem>
          <ToggleGroupItem value="7d" className="min-h-11">
            7d
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {first && last ? (
        <p className="text-sm tabular-nums">
          {marketPrice(last.close)}
          {first.close > 0 ? (
            <span className="text-muted-foreground ml-2">
              {((last.close / first.close - 1) * 100).toFixed(2)}% over
              available history
            </span>
          ) : null}
        </p>
      ) : null}
      {points.length > 1 ? (
        <div
          className="h-60 min-w-0"
          aria-label={`${window} price history, ${points.length} observations from ${first ? marketPrice(first.close) : "unknown"} to ${last ? marketPrice(last.close) : "unknown"}`}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart
              data={[...points]}
              accessibilityLayer
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="at"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={formatTime}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
                fontSize={11}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(value: number) => marketPrice(value)}
                tickLine={false}
                axisLine={false}
                width={72}
                fontSize={11}
              />
              <Tooltip
                labelFormatter={(value) => formatTime(Number(value))}
                formatter={(value) => [marketPrice(Number(value)), "Close"]}
                isAnimationActive={false}
                contentStyle={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  borderRadius: 12,
                }}
              />
              <Line
                dataKey="close"
                type="linear"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-muted-foreground flex min-h-40 items-center text-sm">
          {series?.status === "unavailable"
            ? "History is unavailable from this source. The other period may still have data."
            : "Not enough historical prices to draw a chart."}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        Saved {new Date(snapshot.observedAt).toLocaleString()}. Changing periods
        is free. Missing intervals are not estimated.
      </p>
    </section>
  );
};
