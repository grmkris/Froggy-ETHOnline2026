import type { WatchlistItem } from "@froggy/domain";
import {
  MailIcon,
  CoinsIcon,
  GlobeIcon,
  PlaneIcon,
  ShoppingBagIcon,
  WalletIcon,
} from "lucide-react";
import type { ReactElement } from "react";

import { networkWords } from "../../lib/mandate-words";

export const sourceWords = (item: WatchlistItem): string => {
  if (item.source._tag === "email") {
    return "Saved from Inbox";
  }
  if (item.source._tag === "token" || item.source._tag === "wallet") {
    return networkWords(item.source.network);
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
