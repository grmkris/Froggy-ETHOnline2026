import { afterEach, expect, spyOn, test } from "bun:test";

import { ActivityEventId, ConversationId } from "@froggy/domain";
import type { Conversation } from "@froggy/domain";
import { QueryClient } from "@tanstack/react-query";

import { createHistoryClient } from "./history-client";

const originalFetch = globalThis.fetch;
const mockFetch = (
  implementation: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => Promise<Response>
): void => {
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(implementation, originalFetch)
  );
};
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const conversation = (title: string): Conversation => ({
  v: 1,
  kind: "conversation",
  id: ConversationId.generate(),
  source: "web",
  title,
  preview: title,
  externalKey: null,
  archived: false,
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
});
const tick = async (): Promise<void> => {
  await Promise.resolve();
};

test("cursor pages remain independent, refresh uses fresh auth, and disposal clears owner data", async () => {
  const newest = conversation("Newest");
  const older = conversation("Older");
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let token = "first";
  const seen: string[] = [];
  const client = createHistoryClient(
    "alice",
    queries,
    async () => await Promise.resolve(token)
  );
  const release = client.attach();
  const first = client.page("/api/conversations?limit=20");
  const second = client.page("/api/conversations?before=old&limit=20");
  const keepFirst = client.retain(first);
  const keepSecond = client.retain(second);
  let latest = newest;
  mockFetch(async (input, init) => {
    await Promise.resolve();
    seen.push(new Headers(init?.headers).get("authorization") ?? "missing");
    const path = input instanceof Request ? input.url : input.toString();
    if (path.includes("/changes")) {
      return Response.json({ v: 1, events: [], cursor: 0, hasMore: false });
    }
    return Response.json({
      v: 1,
      records: [path.includes("before=") ? older : latest],
      cursor: null,
      sequence: 0,
    });
  });
  await Promise.all([first.collection.preload(), second.collection.preload()]);
  expect(first.collection.has(newest.id)).toBe(true);
  expect(first.collection.has(older.id)).toBe(false);
  expect(second.collection.has(older.id)).toBe(true);
  token = "rotated";
  latest = { ...newest, revision: 2, title: "Updated" };
  await client.refresh();
  expect(first.collection.get(newest.id)?.revision).toBe(2);
  expect(second.collection.get(older.id)?.revision).toBe(1);
  expect(seen).toContain("Bearer rotated");
  keepFirst();
  await tick();
  expect(
    queries.getQueryCache().find({ queryKey: first.options.queryKey })
  ).toBeUndefined();
  expect(second.collection.has(older.id)).toBe(true);
  keepSecond();
  release();
  await tick();
  expect(
    queries.getQueryCache().findAll({ queryKey: ["history", "alice"] })
  ).toHaveLength(0);
  queries.clear();
});

test("failed reconnect preserves committed rows and exposes stale status until recovery succeeds", async () => {
  const saved = conversation("Committed snapshot");
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const client = createHistoryClient(
    "bob",
    queries,
    async () => await Promise.resolve("token")
  );
  const release = client.attach();
  const entry = client.page("/api/conversations");
  const keep = client.retain(entry);
  let failing = false;
  mockFetch(async (input) => {
    await Promise.resolve();
    if (
      (input instanceof Request ? input.url : input.toString()).includes(
        "/changes"
      )
    ) {
      if (failing) {
        return Response.json({ error: "Unavailable" }, { status: 503 });
      }
      return Response.json({ v: 1, events: [], cursor: 7, hasMore: false });
    }
    return Response.json({ v: 1, records: [saved], cursor: null, sequence: 7 });
  });
  await entry.collection.preload();
  client.observeSnapshot(7);
  failing = true;
  await client.recover();
  expect(client.status()).toBe(true);
  const committed = entry.collection.get(saved.id);
  expect(committed?.kind === "conversation" && committed.title).toBe(
    "Committed snapshot"
  );
  failing = false;
  await client.recover();
  expect(client.status()).toBe(false);
  keep();
  release();
  await tick();
  queries.clear();
});

test("committed updates, duplicate delivery, gaps and deletion converge without duplicate rows", async () => {
  const saved = conversation("Initial");
  let current: Conversation | null = saved;
  let sequence = 1;
  let deleted = false;
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const client = createHistoryClient(
    "events",
    queries,
    async () => await Promise.resolve("token")
  );
  const release = client.attach();
  const entry = client.page("/api/conversations");
  const keep = client.retain(entry);
  mockFetch(async (input) => {
    await Promise.resolve();
    const path = input instanceof Request ? input.url : input.toString();
    if (path.includes("/changes")) {
      return Response.json({
        v: 1,
        cursor: sequence,
        hasMore: false,
        events: [
          {
            v: 1,
            id: ActivityEventId.generate(),
            sequence,
            entityId: saved.id,
            kind: "conversation",
            revision: current?.revision ?? 4,
            deleted,
            recordedAt: 1,
          },
        ],
      });
    }
    if (path.includes("/history/")) {
      return Response.json({
        v: 1,
        record: current,
        related: [],
        receipts: [],
        business: [],
      });
    }
    return Response.json({
      v: 1,
      records: current === null ? [] : [current],
      sequence,
      cursor: null,
    });
  });
  await entry.collection.preload();
  client.observeSnapshot(0);
  current = { ...saved, revision: 2, title: "Updated" };
  await client.recover();
  expect(entry.collection.get(saved.id)?.revision).toBe(2);
  await client.recover();
  expect(entry.collection.size).toBe(1);
  sequence = 7;
  current = { ...saved, revision: 3, title: "After a gap" };
  await client.recover();
  expect(entry.collection.get(saved.id)?.revision).toBe(3);
  sequence = 8;
  current = null;
  deleted = true;
  await client.recover();
  expect(entry.collection.size).toBe(0);
  keep();
  release();
  await tick();
  queries.clear();
});
