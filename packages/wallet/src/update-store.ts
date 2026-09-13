import { Update } from "@froggy/domain";
import type {
  UpdateId,
  UpdatesPage,
  UserId,
  WatchlistItemId,
} from "@froggy/domain";
import { Schema } from "effect";

export interface UpdateStore {
  readonly save: (owner: UserId, update: Update) => Promise<Update>;
  readonly byId: (owner: UserId, id: UpdateId) => Promise<Update | null>;
  readonly byKey: (owner: UserId, key: string) => Promise<Update | null>;
  readonly list: (owner: UserId, before?: UpdateId) => Promise<UpdatesPage>;
  readonly unread: (owner: UserId) => Promise<number>;
  readonly markRead: (
    owner: UserId,
    id: UpdateId,
    at: number
  ) => Promise<boolean>;
  readonly markAllRead: (owner: UserId, at: number) => Promise<void>;
  readonly forget: (owner: UserId) => Promise<void>;
}
export type UpdateBook = Map<UserId, Map<string, Update>>;
export const saveUpdate = (
  book: UpdateBook,
  owner: UserId,
  input: Update
): Update => {
  const rows = book.get(owner) ?? new Map<string, Update>();
  const previous = rows.get(input.key);
  const update = Schema.decodeUnknownSync(Update)({
    ...input,
    id: previous?.id ?? input.id,
    at: previous?.at ?? input.at,
    readAt: previous ? previous.readAt : input.readAt,
  });
  rows.set(update.key, structuredClone(update));
  book.set(owner, rows);
  return structuredClone(update);
};
export const removeItemUpdates = (
  book: UpdateBook,
  owner: UserId,
  itemId: WatchlistItemId
): void => {
  for (const [key, update] of book.get(owner) ?? []) {
    if (update.itemId === itemId) {
      book.get(owner)?.delete(key);
    }
  }
};
export const memoryUpdateStore = (
  book: () => UpdateBook,
  lock: <T>(operation: () => Promise<T>) => Promise<T>,
  ownsItem: (owner: UserId, id: WatchlistItemId) => boolean
): UpdateStore => {
  const rows = (owner: UserId): readonly Update[] => [
    ...(book().get(owner)?.values() ?? []),
  ];
  return {
    save: async (owner, update) =>
      await lock(async () => {
        if (update.itemId && !ownsItem(owner, update.itemId)) {
          throw new Error("Saved item not found.");
        }
        return await Promise.resolve(saveUpdate(book(), owner, update));
      }),
    byId: async (owner, id) =>
      await lock(
        async () =>
          await Promise.resolve(
            structuredClone(rows(owner).find((row) => row.id === id) ?? null)
          )
      ),
    byKey: async (owner, key) =>
      await lock(
        async () =>
          await Promise.resolve(
            structuredClone(book().get(owner)?.get(key) ?? null)
          )
      ),
    list: async (owner, before) =>
      await lock(async () => {
        const all = rows(owner);
        const page = all
          .filter((row) => !before || row.id < before)
          .toSorted((a, b) => b.id.localeCompare(a.id))
          .slice(0, 31);
        return await Promise.resolve({
          v: 1,
          updates: structuredClone(page.slice(0, 30)),
          next: page.length > 30 ? (page[29]?.id ?? null) : null,
          unread: all.filter((row) => row.readAt === null).length,
        });
      }),
    unread: async (owner) =>
      await lock(
        async () =>
          await Promise.resolve(
            rows(owner).filter((row) => row.readAt === null).length
          )
      ),
    markRead: async (owner, id, at) =>
      await lock(async () => {
        const row = rows(owner).find((value) => value.id === id);
        if (row) {
          book()
            .get(owner)
            ?.set(row.key, { ...row, readAt: row.readAt ?? at });
        }
        return await Promise.resolve(!!row);
      }),
    markAllRead: async (owner, at) => {
      await lock(async () => {
        for (const row of rows(owner)) {
          if (row.readAt === null) {
            book()
              .get(owner)
              ?.set(row.key, { ...row, readAt: at });
          }
        }
        await Promise.resolve();
      });
    },
    forget: async (owner) => {
      await lock(async () => {
        book().delete(owner);
        await Promise.resolve();
      });
    },
  };
};
