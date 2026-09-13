import { WatchlistItem } from "@froggy/domain";
import type { UserId, WatchlistItemId } from "@froggy/domain";
import { Schema } from "effect";

export type WatchlistBook = Map<WatchlistItemId, WatchlistItem>;
export interface WatchlistStore {
  readonly transact: <T>(
    owner: UserId,
    operation: (book: WatchlistBook) => T
  ) => Promise<T>;
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

export const memoryWatchlistStore = (): WatchlistStore => {
  const owners = new Map<UserId, WatchlistBook>();
  return {
    transact: async (owner, operation) => {
      await Promise.resolve();
      const book = structuredClone(owners.get(owner) ?? new Map());
      const result = structuredClone(operation(book));
      validateWatchlistBook(book);
      owners.set(owner, structuredClone(book));
      return result;
    },
    forget: async (owner) => {
      owners.delete(owner);
      await Promise.resolve();
    },
  };
};
