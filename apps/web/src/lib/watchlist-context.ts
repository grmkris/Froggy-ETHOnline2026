import { WatchlistItemId } from "@froggy/domain";
import type { WatchlistItem } from "@froggy/domain";

/** Only an opaque reference enters user text; addresses arrive through the read tool as data. */
export const withWatchlistContext = (
  item: WatchlistItem,
  text: string
): string =>
  `[Saved item ${item.id}, revision ${item.revision}. Read it with watchlist_get before answering.]\n\n${text}`;

export const readWatchlistContext = (
  text: string
): { readonly id: WatchlistItemId; readonly text: string } | null => {
  const match =
    /^\[Saved item (?<id>wli_[0-9a-z]{26}), revision [1-9]\d*\. Read it with watchlist_get before answering\.\]\n\n/u.exec(
      text
    );
  const id = match?.groups?.["id"];
  if (match === null || id === undefined || !WatchlistItemId.is(id)) {
    return null;
  }
  return { id, text: text.slice(match[0].length) };
};
