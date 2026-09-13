import { describe, expect, test } from "bun:test";

import { userId, WatchlistItem, WalletMonitorId } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import { WatchlistList } from "@froggy/protocol";
import { memoryStore } from "@froggy/wallet";
import type { Store } from "@froggy/wallet";
import { Schema } from "effect";

import { handleWatchlist } from "./watchlist-routes";

const ALICE = userId("did:privy:watchlist-alice");
const BOB = userId("did:privy:watchlist-bob");
const input = {
  v: 1,
  title: "A weekend away",
  notes: "Berlin to Lisbon · two adults · October",
  source: { _tag: "flight", url: "https://example.com/flights" },
};
const post = async (store: Store, body: Schema.Json, owner: UserId = ALICE) =>
  await handleWatchlist(
    store,
    new Request("https://froggy.test/api/watchlist", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    owner,
    "/api/watchlist"
  );
const save = async (store: Store, body: Schema.Json) => {
  const response = await post(store, body);
  expect(response?.status).toBe(201);
  return Schema.decodeUnknownSync(WatchlistItem)(await response?.json());
};

describe("saved items", () => {
  test("onchain saves preserve notes and restore an archived watch inactive", async () => {
    const store = memoryStore();
    const tokenInput = {
      ...input,
      title: "Saved token",
      notes: "Keep my research",
      source: {
        _tag: "token",
        network: "eip155:8453",
        address: "0x1111111111111111111111111111111111111111",
      },
    };
    const item = await save(store, tokenInput);
    const expiresAt = Date.now() + 86_400_000;
    await store.watchlist.transact(ALICE, (book) => {
      book.set(item.id, {
        ...item,
        walletMonitor: {
          v: 1,
          id: WalletMonitorId.generate(),
          revision: 1,
          enabled: true,
          startedAt: Date.now(),
          expiresAt,
          startBlock: 1,
          telegram: false,
          swaps: false,
          transfers: true,
        },
      });
    });
    const retry = await save(store, {
      ...tokenInput,
      title: "Replacement",
      notes: "Replacement",
    });
    expect(retry.id).toBe(item.id);
    expect(retry.title).toBe("Saved token");
    expect(retry.notes).toBe("Keep my research");
    const path = `/api/watchlist/${item.id}`;
    const archived = await handleWatchlist(
      store,
      new Request(`https://froggy.test${path}`, {
        method: "PATCH",
        body: JSON.stringify({
          v: 1,
          revision: retry.revision,
          archived: true,
        }),
      }),
      ALICE,
      path
    );
    expect(archived?.status).toBe(200);
    const restored = await save(store, {
      ...tokenInput,
      notes: "Still preserve",
    });
    expect(restored.id).toBe(item.id);
    expect(restored.notes).toBe("Keep my research");
    expect(restored.archived).toBe(false);
    expect(restored.walletMonitor?.enabled).toBe(false);
    expect(restored.walletMonitor?.expiresAt).toBe(expiresAt);
  });
  test("persists all four kinds, preserves variants, deduplicates retries, and isolates owners", async () => {
    const store = memoryStore();
    const flight = await save(store, input);
    const retry = await save(store, input);
    const variant = await save(store, { ...input, notes: "One adult" });
    expect(retry.id).toBe(flight.id);
    expect(variant.id).not.toBe(flight.id);
    await Promise.all(
      ["link", "product"].map(
        async (kind) =>
          await save(store, {
            ...input,
            source: { ...input.source, _tag: kind },
          })
      )
    );
    // Synthetic address, shared deliberately to exercise CAIP-2 identity.
    const address = "0x1111111111111111111111111111111111111111";
    const tokens = await Promise.all(
      ["eip155:4663", "eip155:8453", "eip155:1"].map(
        async (network) =>
          await save(store, {
            ...input,
            source: { _tag: "token", network, address },
          })
      )
    );
    expect(new Set(tokens.map((token) => token.id)).size).toBe(3);
    const foreign = await handleWatchlist(
      store,
      new Request(`https://froggy.test/api/watchlist/${flight.id}`),
      BOB,
      `/api/watchlist/${flight.id}`
    );
    expect(foreign?.status).toBe(404);
    const list = await handleWatchlist(
      store,
      new Request("https://froggy.test/api/watchlist"),
      ALICE,
      "/api/watchlist"
    );
    expect(
      Schema.decodeUnknownSync(WatchlistList)(await list?.json()).items
    ).toHaveLength(7);
    await store.forget(ALICE);
    expect(await store.watchlist.transact(ALICE, (book) => book.size)).toBe(0);
  });

  test("rejects unsafe URLs, missing chain identity and invalid versions", async () => {
    const store = memoryStore();
    const unsafe = ["javascript", "alert(1)"].join(":");
    const urls = [
      unsafe,
      "http://127.0.0.1/private",
      "https://person:secret@example.com",
      "http://localhost",
    ];
    const bodies = [
      ...urls.map((url) => ({ ...input, source: { _tag: "link", url } })),
      { ...input, v: 2 },
      {
        ...input,
        source: {
          _tag: "token",
          address: "0x1111111111111111111111111111111111111111",
        },
      },
    ];
    const responses = await Promise.all(
      bodies.map(async (body) => await post(store, body))
    );
    expect(responses.map((response) => response?.status)).toEqual(
      bodies.map(() => 400)
    );
  });

  test("only one concurrent edit wins and other owners cannot edit or delete", async () => {
    const store = memoryStore();
    const item = await save(store, input);
    const path = `/api/watchlist/${item.id}`;
    const patch = () =>
      new Request(`https://froggy.test${path}`, {
        method: "PATCH",
        body: JSON.stringify({
          v: 1,
          revision: 1,
          title: "Updated",
          archived: true,
        }),
      });
    const foreign = await handleWatchlist(store, patch(), BOB, path);
    expect(foreign?.status).toBe(404);
    const concurrent = await Promise.all([
      handleWatchlist(store, patch(), ALICE, path),
      handleWatchlist(store, patch(), ALICE, path),
    ]);
    expect(
      concurrent
        .map((result) => result?.status)
        .toSorted((a, b) => (a ?? 0) - (b ?? 0))
    ).toEqual([200, 409]);
    const foreignDelete = await handleWatchlist(
      store,
      new Request(`https://froggy.test${path}`, { method: "DELETE" }),
      BOB,
      path
    );
    expect(foreignDelete?.status).toBe(409);
    const removed = await handleWatchlist(
      store,
      new Request(`https://froggy.test${path}`, { method: "DELETE" }),
      ALICE,
      path
    );
    expect(removed?.status).toBe(200);
  });
});
