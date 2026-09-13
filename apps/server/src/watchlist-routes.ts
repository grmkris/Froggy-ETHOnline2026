import { WatchlistItemId, watchlistSourceKey } from "@froggy/domain";
import type { UserId, WatchlistInput, WatchlistItem } from "@froggy/domain";
import { WatchlistCreate, WatchlistPatch } from "@froggy/protocol";
import type { Store } from "@froggy/wallet";
import { Schema } from "effect";

import { invalidateItemMonitor } from "./monitoring";

type WatchlistResponse =
  | WatchlistItem
  | { readonly v: 1; readonly items: readonly WatchlistItem[] }
  | { readonly v: 1; readonly error: string }
  | { readonly v: 1; readonly removed: boolean };
const reply = (body: WatchlistResponse, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

class WatchlistFullError extends Error {
  constructor() {
    super("Your watchlist is full. Remove an archived item first.");
    this.name = "WatchlistFullError";
  }
}

export const saveWatchlistItem = async (
  store: Pick<Store, "watchlist">,
  owner: UserId,
  input: WatchlistInput
): Promise<WatchlistItem> =>
  await store.watchlist.transact(owner, (book) => {
    const existing = [...book.values()].find(
      (item) =>
        watchlistSourceKey(item.source) === watchlistSourceKey(input.source) &&
        item.notes === input.notes
    );
    if (existing !== undefined && !existing.archived) {
      return existing;
    }
    if (existing === undefined && book.size >= 200) {
      throw new WatchlistFullError();
    }
    const now = Date.now();
    const item: WatchlistItem = {
      ...input,
      v: 1,
      id: existing?.id ?? WatchlistItemId.generate(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      revision: (existing?.revision ?? 0) + 1,
      archived: false,
    };
    book.set(item.id, item);
    return item;
  });

export const handleWatchlist = async (
  store: Store,
  request: Request,
  owner: UserId,
  pathname: string
): Promise<Response | null> => {
  if (
    pathname !== "/api/watchlist" &&
    !pathname.startsWith("/api/watchlist/")
  ) {
    return null;
  }
  if (pathname === "/api/watchlist") {
    if (request.method === "GET") {
      return reply({
        v: 1,
        items: await store.watchlist.transact(owner, (book) =>
          [...book.values()].toSorted((a, b) => b.updatedAt - a.updatedAt)
        ),
      });
    }
    if (request.method === "POST") {
      const decoded = Schema.decodeUnknownResult(WatchlistCreate)(
        await request.json().catch(() => null)
      );
      if (decoded._tag === "Failure") {
        return reply(
          {
            v: 1,
            error:
              "Use a title and a valid public URL or token address with its chain.",
          },
          400
        );
      }
      try {
        return reply(
          await saveWatchlistItem(store, owner, decoded.success),
          201
        );
      } catch (error) {
        if (error instanceof WatchlistFullError) {
          return reply({ v: 1, error: error.message }, 409);
        }
        throw error;
      }
    }
    return reply({ v: 1, error: "Method not allowed." }, 405);
  }
  const id = pathname.slice("/api/watchlist/".length);
  if (!WatchlistItemId.is(id)) {
    return reply({ v: 1, error: "Item not found." }, 404);
  }
  if (request.method === "PATCH") {
    const decoded = Schema.decodeUnknownResult(WatchlistPatch)(
      await request.json().catch(() => null)
    );
    if (decoded._tag === "Failure") {
      return reply({ v: 1, error: "Malformed item edit." }, 400);
    }
    const result = await store.watchlist.transact(owner, (book) => {
      const item = book.get(id);
      if (item === undefined) {
        return "missing";
      }
      if (item.revision !== decoded.success.revision) {
        return "conflict";
      }
      const updated = {
        ...item,
        title: decoded.success.title ?? item.title,
        notes: decoded.success.notes ?? item.notes,
        archived: decoded.success.archived ?? item.archived,
        updatedAt: Date.now(),
        revision: item.revision + 1,
      };
      book.set(id, updated);
      return updated;
    });
    if (result === "missing") {
      return reply({ v: 1, error: "Item not found." }, 404);
    }
    if (result === "conflict") {
      return reply(
        { v: 1, error: "This item changed. Reload it before editing." },
        409
      );
    }
    if (result.archived || decoded.success.notes !== undefined) {
      await invalidateItemMonitor(store, owner, result);
    }
    return reply(result);
  }
  if (request.method === "DELETE") {
    const removed = await store.watchlist.transact(
      owner,
      (book) => book.get(id)?.archived === true && book.delete(id)
    );
    return reply({ v: 1, removed }, removed ? 200 : 409);
  }
  if (request.method === "GET") {
    const item = await store.watchlist.transact(
      owner,
      (book) => book.get(id) ?? null
    );
    return item === null
      ? reply({ v: 1, error: "Item not found." }, 404)
      : reply(item);
  }
  return reply({ v: 1, error: "Method not allowed." }, 405);
};
