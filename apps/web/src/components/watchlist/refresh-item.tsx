import type { WatchlistItem } from "@froggy/domain";
import { WatchlistCaptured } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import type { ReactElement } from "react";

import { useServiceApi } from "../../hooks/use-service-api";
import { formatCredits } from "../../lib/credit-view";
import { useWatchlist, useWatchlistDetails } from "../../lib/watchlist-client";

export const RefreshItem = ({
  item,
}: {
  readonly item: WatchlistItem;
}): ReactElement | null => {
  const { request } = useWatchlist();
  const details = useWatchlistDetails(item.id);
  const pending = ["queued", "running", "uncertain", "needs_help"].includes(
    details.data?.data.enrichment?.status ?? ""
  );
  const { catalog } = useServiceApi();
  const queries = useQueryClient();
  const refresh = useMutation({
    mutationFn: async (price: number) =>
      Schema.decodeUnknownSync(WatchlistCaptured)(
        await request(`/api/watchlist/${item.id}/enrich`, {
          method: "POST",
          body: JSON.stringify({
            v: 1,
            revision: item.revision,
            acceptedPrice: price,
            idempotencyKey: crypto.randomUUID(),
          }),
        })
      ),
    onSuccess: async () => {
      await queries.invalidateQueries({ queryKey: ["watchlist-details"] });
    },
    retry: false,
  });
  if (
    item.archived ||
    item.source._tag === "wallet" ||
    item.source._tag === "email"
  ) {
    return null;
  }
  const card = catalog.data?.services.find(
    (entry) => entry.name === "token_snapshot"
  );
  const price = item.source._tag === "token" ? card?.priceUsdMicros : 1_000_000;
  const unavailable =
    price === undefined ||
    price > 1_000_000 ||
    (item.source._tag === "token" && card?.status === "unavailable");
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        className="min-h-11 self-start"
        disabled={unavailable || pending || refresh.isPending}
        onClick={() => {
          if (price !== undefined) {
            refresh.mutate(price);
          }
        }}
      >
        {refresh.isPending
          ? "Requesting refresh…"
          : `Refresh details${price === undefined ? "" : ` · ${formatCredits(price)}`}`}
      </Button>
      {unavailable ? (
        <p className="text-muted-foreground text-xs">
          This data source is currently unavailable.
        </p>
      ) : null}
      {refresh.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {refresh.error.message}
        </p>
      ) : null}
    </div>
  );
};
