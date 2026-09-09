import type { LaunchWatchId } from "@froggy/domain";
import { LaunchWatchTicket } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import type { ReactElement } from "react";

import type { ServiceApi } from "../../hooks/use-service-api";

const Watches = Schema.Struct({
  v: Schema.Literal(1),
  watches: Schema.Array(LaunchWatchTicket).check(Schema.isMaxLength(20)),
});

export const LaunchWatchList = ({
  api,
}: {
  readonly api: ServiceApi["api"];
}): ReactElement | null => {
  const queries = useQueryClient();
  const watches = useQuery({
    queryKey: ["launch-watches"],
    queryFn: async () => {
      const response = await api("/api/services/watches");
      return Schema.decodeUnknownSync(Watches)(await response.json());
    },
    refetchInterval: 5000,
    retry: false,
  });
  const cancel = useMutation({
    mutationFn: async (id: LaunchWatchId) => {
      const response = await api(`/api/services/watches/${id}`, {
        method: "DELETE",
      });
      return Schema.decodeUnknownSync(LaunchWatchTicket)(await response.json());
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: ["launch-watches"] });
    },
    retry: false,
  });
  if (watches.isError) {
    return <p role="alert">Listing watches could not be loaded.</p>;
  }
  if (watches.data === undefined || watches.data.watches.length === 0) {
    return null;
  }
  return (
    <section
      aria-label="Listing watches"
      className="flex min-w-0 flex-col gap-3"
    >
      <h2 className="text-section">Listing watches</h2>
      {cancel.isError ? <p role="alert">{cancel.error.message}</p> : null}
      {watches.data.watches.map((watch) => (
        <article
          className="bg-card shadow-card flex min-w-0 flex-col gap-3 rounded-2xl p-4 sm:p-5"
          key={watch.id}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">
              {watch.input.durationMinutes}-minute listing watch
            </h3>
            <Badge variant="secondary">{watch.status}</Badge>
            {watch.stubbed ? <Badge variant="outline">Simulated</Badge> : null}
          </div>
          <p className="text-muted-foreground text-sm break-all">
            {watch.input.network}
          </p>
          <p className="text-sm">
            {watch.pollsUsed} / {watch.maxPolls} polls used ·{" "}
            {watch.events.length} / 100 matches saved
          </p>
          <p className="text-muted-foreground text-xs">
            Expires {new Date(watch.expiresAt).toLocaleString()}. No automatic
            renewal.
          </p>
          <p className="text-muted-foreground text-xs">
            Coverage gaps: {watch.gapCount}. {watch.lastGap}
          </p>
          {watch.reaction === undefined ? null : (
            <div className="flex min-w-0 flex-col gap-1 text-sm">
              <p>
                Human-authorized reactions: {watch.reaction.checksUsed} /{" "}
                {watch.reaction.maxChecks} checks used.
              </p>
              <p className="text-machine break-all">
                Rule {watch.reaction.ruleId}
              </p>
              {watch.reaction.pendingTradeId === null ? null : (
                <p className="break-all">
                  Pending trade: {watch.reaction.pendingTradeId}
                </p>
              )}
              {watch.reaction.error === null ? null : (
                <p className="text-destructive" role="alert">
                  {watch.reaction.error}
                </p>
              )}
            </div>
          )}
          {watch.error === null ? null : (
            <p className="text-destructive text-sm" role="alert">
              {watch.error}
            </p>
          )}
          {watch.events.length === 0 ? (
            <p className="text-sm">
              No matching listings observed. Coverage is incomplete.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {watch.events.slice(-10).map((event) => (
                <li className="border-border border-t pt-2" key={event.id}>
                  <p className="font-medium">
                    {event.symbol ?? event.name ?? "Unnamed token"}
                  </p>
                  <p className="text-machine break-all">{event.address}</p>
                  {(watch.orphanedEvents?.includes(event.id) ?? false) ? (
                    <p className="text-destructive text-xs">
                      Uncertain after chain reorganization; excluded from
                      automatic entries.
                    </p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    Source: {event.source ?? "unknown"} · Launch membership:
                    {event.membership === "factory_log"
                      ? "factory log (rechecked before signing)"
                      : "unverified"}{" "}
                    · Observed {new Date(event.observedAt).toLocaleTimeString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {watch.status === "active" ? (
            <Button
              className="min-h-11 self-start"
              disabled={cancel.isPending}
              onClick={() => {
                cancel.mutate(watch.id);
              }}
              variant="outline"
            >
              Stop watch
            </Button>
          ) : null}
        </article>
      ))}
    </section>
  );
};
