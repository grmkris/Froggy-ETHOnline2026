import { shortEvmAddress } from "@froggy/domain";
import type { WatchlistData, WatchlistItem } from "@froggy/domain";
import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";

import { stateWords } from "../../lib/watch-words";
import type { WatchState } from "../../lib/watch-words";
import {
  AddressChip,
  ChainChips,
  ItemIcon,
  displayTitle,
} from "./item-identity";
import { ItemImage } from "./item-image";

/**
 * One row: the name is the link and its only text, so the specs that find a
 * row by name keep working; the address, the chains and the state sit beside
 * it. Recorded identity can be reused in chat; live controls never rewrite it.
 */
export const SavedItemCard = ({
  item,
  children,
  hasImage = false,
  data,
  state,
  words,
  time,
}: {
  readonly item: WatchlistItem;
  readonly children?: ReactNode;
  readonly hasImage?: boolean;
  readonly data?: WatchlistData | undefined;
  readonly state?: WatchState;
  /** The row's one sentence, in the person's words. */
  readonly words?: string | null;
  /** When the last thing happened, already in words. */
  readonly time?: string | null;
}): ReactElement => {
  const address = "address" in item.source ? item.source.address : null;
  return (
    <div className="watch-row min-w-0 flex-1">
      {hasImage ? (
        <ItemImage id={item.id} title={item.title} compact />
      ) : (
        <ItemIcon item={item} />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            className="watch-row-name focus-visible:ring-ring min-h-11 min-w-0 content-center truncate rounded-sm outline-none hover:underline focus-visible:ring-2"
            to="/watchlist/$itemId"
            params={{ itemId: item.id }}
          >
            <span
              key={displayTitle(item, data?.presence)}
              className="presence-text"
            >
              {displayTitle(item, data?.presence)}
            </span>
          </Link>
          {address === null ? null : (
            <AddressChip
              address={address}
              named={
                displayTitle(item, data?.presence) === shortEvmAddress(address)
              }
            />
          )}
          <ChainChips rows={data?.presence ?? []} />
        </div>
        {words === undefined || words === null || words === "" ? null : (
          <p className="watch-row-words">{words}</p>
        )}
        {children}
      </div>
      {state === undefined ? null : (
        <div className="watch-row-side">
          {time === undefined || time === null || time === "" ? null : (
            <span className="watch-time">{time}</span>
          )}
          <span className="watch-state" data-state={state}>
            {stateWords[state]}
          </span>
        </div>
      )}
    </div>
  );
};
