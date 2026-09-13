import { WatchlistItem } from "@froggy/domain";
import type { UserId, WatchlistItemId } from "@froggy/domain";
import { Schema } from "effect";

export type WatchlistBook = Map<WatchlistItemId, WatchlistItem>;
export interface WatchlistStore {
  readonly transact: <T>(
    owner: UserId,
    operation: (book: WatchlistBook) => T
  ) => Promise<T>;
  /** Everyone with at least one saved item, for the background checks. */
  readonly owners: () => Promise<readonly UserId[]>;
  readonly forget: (owner: UserId) => Promise<void>;
}

export const validateWatchlistBook = (book: WatchlistBook): void => {
  if (book.size > 200) {
    throw new Error(
      "Your watchlist is full. Remove an archived item before saving another."
    );
  }
  for (const [id, value] of book) {
    const item = Schema.decodeUnknownSync(WatchlistItem)(value);
    if (item.id !== id) {
      throw new Error("Saved item identity mismatch.");
    }
  }
};
