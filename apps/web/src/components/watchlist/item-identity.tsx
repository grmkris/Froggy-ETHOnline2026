import {
  chainName,
  isTestnet,
  listChainNames,
  presenceTitle,
  visiblePresence,
} from "@froggy/domain";
import type {
  AddressPresence,
  WatchlistData,
  WatchlistItem,
} from "@froggy/domain";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  MailIcon,
  CoinsIcon,
  GlobeIcon,
  PlaneIcon,
  ShoppingBagIcon,
  WalletIcon,
} from "lucide-react";
import type { ReactElement } from "react";

import { useWatchlist } from "../../lib/watchlist-client";
import { MotionItem, useArrivalDelays } from "../motion-item";

export const sourceWords = (item: WatchlistItem): string => {
  if (item.source._tag === "email") {
    return "Saved from Inbox";
  }
  if (item.source._tag === "token" || item.source._tag === "wallet") {
    return "Onchain address";
  }
  return new URL(item.source.url).hostname.replace(/^www\./u, "");
};
export const sourceSearch = (item: WatchlistItem): string => {
  if (item.source._tag === "email") {
    return "Inbox";
  }
  return "url" in item.source ? item.source.url : item.source.address;
};

export const ItemIcon = ({
  item,
}: {
  readonly item: WatchlistItem;
}): ReactElement => {
  const Icon = {
    email: MailIcon,
    token: CoinsIcon,
    wallet: WalletIcon,
    flight: PlaneIcon,
    product: ShoppingBagIcon,
    link: GlobeIcon,
  }[item.source._tag];
  return (
    <span
      aria-hidden
      className="bg-brand-soft text-brand grid size-11 shrink-0 place-items-center rounded-2xl"
    >
      <Icon className="size-5" />
    </span>
  );
};

export const displayTitle = (
  item: WatchlistItem,
  presence: readonly AddressPresence[] = []
): string => {
  if (
    (item.source._tag === "wallet" || item.source._tag === "token") &&
    item.title.toLowerCase() === item.source.address.toLowerCase()
  ) {
    return (
      presenceTitle(presence) ??
      `${item.source.address.slice(0, 6)}…${item.source.address.slice(-4)}`
    );
  }
  return item.title;
};
export const PresenceChips = ({
  rows,
  finding = false,
}: {
  readonly rows: readonly AddressPresence[];
  readonly finding?: boolean;
}): ReactElement => {
  const visible = visiblePresence(rows)
    .filter((row) => row.status === "observed")
    .toSorted(
      (a, b) =>
        Number(isTestnet(a.network)) - Number(isTestnet(b.network)) ||
        a.network.localeCompare(b.network)
    );
  const delays = useArrivalDelays(visible.map((row) => row.network));
  return (
    <div className="flex flex-wrap gap-1.5" aria-hidden={finding || undefined}>
      {visible.map((row) => {
        const token = row.kind === "contract" && row.token !== null;
        const Icon = token ? CoinsIcon : WalletIcon;
        return (
          <MotionItem
            inline
            key={row.network}
            delay={delays.get(row.network) ?? 0}
          >
            <Badge variant="outline">
              <Icon aria-hidden className="size-3" />
              {chainName(row.network)} · {token ? "token" : "wallet"}
            </Badge>
          </MotionItem>
        );
      })}
      {rows.some((row) => row.stubbed) ? (
        <Badge variant="outline" className="text-drive-agent">
          Simulated
        </Badge>
      ) : null}
    </div>
  );
};
export const ItemPresence = ({
  item,
  data,
}: {
  readonly item: WatchlistItem;
  readonly data?: WatchlistData | undefined;
}): ReactElement => {
  const { discover } = useWatchlist();
  if (item.source._tag !== "token" && item.source._tag !== "wallet") {
    return <p className="text-muted-foreground text-xs">{sourceWords(item)}</p>;
  }
  const rows = visiblePresence(data?.presence ?? []);
  const observed = rows.filter((row) => row.status === "observed");
  const unavailable = rows.filter((row) => row.status === "unavailable");
  const status = data?.discovery?.status;
  const finding =
    status === "queued" || status === "running" || discover.isPending;
  let words = "Not seen on any chain we checked";
  if (finding) {
    words = "Finding where it lives…";
  } else if (status === "failed") {
    words = "Could not check this address";
  } else if (observed.length > 0) {
    words = `Found on ${observed.length} ${observed.length === 1 ? "chain" : "chains"}: ${listChainNames(observed.map((row) => row.network))}`;
  }
  if (!finding && unavailable.length > 0) {
    words += ` · ${listChainNames(unavailable.map((row) => row.network))} could not be checked`;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <PresenceChips rows={rows} finding={finding} />
      <div
        data-slot="presence-state"
        aria-live="polite"
        aria-atomic="true"
        className="text-muted-foreground text-xs"
      >
        <span
          key={words}
          className={
            finding ? "shimmer shimmer-duration-1800" : "presence-text"
          }
        >
          {words}
        </span>
      </div>
      {!finding && (observed.length === 0 || unavailable.length > 0) ? (
        <Button
          variant="ghost"
          className="min-h-11 self-start"
          onClick={() => {
            discover.mutate(item.id);
          }}
        >
          Check again
        </Button>
      ) : null}
      {discover.isError ? (
        <p className="text-destructive text-xs" role="alert">
          {discover.error.message}
        </p>
      ) : null}
    </div>
  );
};
