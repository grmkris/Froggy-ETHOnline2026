import { emptyMonitoringBook, MonitoringBook } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import { Schema } from "effect";

export interface MonitoringStore {
  readonly transact: <T>(
    owner: UserId,
    operation: (book: MonitoringBook) => { book: MonitoringBook; result: T }
  ) => Promise<T>;
  readonly owners: () => Promise<readonly UserId[]>;
  readonly forget: (owner: UserId) => Promise<void>;
}

export const memoryMonitoringStore = (): MonitoringStore => {
  const books = new Map<UserId, MonitoringBook>();
  return {
    transact: async (owner, operation) => {
      const { book, result } = operation(
        structuredClone(books.get(owner) ?? emptyMonitoringBook())
      );
      books.set(
        owner,
        Schema.decodeUnknownSync(MonitoringBook)(structuredClone(book))
      );
      return await Promise.resolve(structuredClone(result));
    },
    owners: async () => await Promise.resolve([...books.keys()]),
    forget: async (owner) => {
      books.delete(owner);
      await Promise.resolve();
    },
  };
};
