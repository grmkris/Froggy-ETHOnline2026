import { WatchlistData } from "@froggy/domain";
import type { UserId, WatchlistItemId } from "@froggy/domain";
import { Schema } from "effect";

export type WatchlistDataBook = Map<WatchlistItemId, WatchlistData>;
export interface WatchlistDataStore {
  readonly transact: <T>(
    owner: UserId,
    operation: (book: WatchlistDataBook) => T
  ) => Promise<T>;
  readonly owners: () => Promise<readonly UserId[]>;
  readonly forget: (owner: UserId) => Promise<void>;
}
export const validateWatchlistData = (book: WatchlistDataBook): void => {
  if (book.size > 200) {
    throw new Error("Too many saved item details.");
  }
  for (const [id, value] of book) {
    if (Schema.decodeUnknownSync(WatchlistData)(value).itemId !== id) {
      throw new Error("Saved detail identity mismatch.");
    }
  }
};
export const memoryWatchlistDataStore = (): WatchlistDataStore => {
  const owners = new Map<UserId, WatchlistDataBook>();
  return {
    transact: async (owner, operation) => {
      await Promise.resolve();
      const book = structuredClone(owners.get(owner) ?? new Map());
      const result = structuredClone(operation(book));
      validateWatchlistData(book);
      owners.set(owner, structuredClone(book));
      return result;
    },
    owners: async () => {
      await Promise.resolve();
      return [...owners.keys()];
    },
    forget: async (owner) => {
      owners.delete(owner);
      await Promise.resolve();
    },
  };
};
