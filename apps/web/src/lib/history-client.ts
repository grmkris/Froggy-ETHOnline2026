import { HistoryChanges, HistoryPage } from "@froggy/domain";
import type { HistoryId, HistoryRecord } from "@froggy/domain";
import { HistoryDetail } from "@froggy/protocol";
import { createCollection } from "@tanstack/db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { useLiveQuery } from "@tanstack/react-db";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import type { AppStream } from "../hooks/use-app-socket";
import { useSessionToken } from "./session-token";

const pageDecoder = Schema.decodeUnknownSync(HistoryPage);
const detailDecoder = Schema.decodeUnknownSync(HistoryDetail);
const changesDecoder = Schema.decodeUnknownSync(HistoryChanges);
const errorDecoder = Schema.decodeUnknownResult(
  Schema.Struct({ error: Schema.String })
);
type TokenReader = () => Promise<string | null>;
const historyFetch = async (
  token: TokenReader,
  path: string,
  init: RequestInit = {}
): Promise<Response> => {
  const access = await token();
  if (access === null) {
    throw new Error("Sign in again to read your history.");
  }
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${access}`);
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const decoded = errorDecoder(await response.json());
    throw new Error(
      decoded._tag === "Success"
        ? decoded.success.error
        : "History could not be loaded."
    );
  }
  return response;
};
const pageOptions = (
  owner: string | null,
  path: string,
  queries: QueryClient,
  token: TokenReader
) => {
  const key = ["history", owner, path] as const;
  const read = async ({ signal }: { readonly signal: AbortSignal }) => {
    const response = await historyFetch(token, path, { signal });
    return pageDecoder(await response.json());
  };
  const options = queryOptions({
    queryKey: key,
    queryFn: read,
    enabled: owner !== null,
    staleTime: 10_000,
    gcTime: 60_000,
    retry: 1,
  });
  const collection = createCollection(
    queryCollectionOptions<
      HistoryRecord,
      typeof read,
      Error,
      typeof key,
      HistoryId
    >({
      queryKey: key,
      queryFn: read,
      queryClient: queries,
      enabled: owner !== null,
      staleTime: 10_000,
      gcTime: 60_000,
      retry: 1,
      select: (snapshot) => [...snapshot.records],
      getKey: (record) => record.id,
    })
  );
  return { options, collection, path, readers: 0 };
};
type HistoryCollection = ReturnType<typeof pageOptions>;
export const createHistoryClient = (
  owner: string | null,
  queries: QueryClient,
  token: TokenReader
) => {
  const pages = new Map<string, HistoryCollection>();
  let cursor: number | null = null;
  let recovering = false;
  let leases = 0;
  let disposed = false;
  let stale = false;
  const listeners = new Set<() => void>();
  const setStale = (value: boolean): void => {
    if (stale === value) {
      return;
    }
    stale = value;
    for (const listener of listeners) {
      listener();
    }
  };
  const detailOptions = (id: HistoryId | null) =>
    queryOptions({
      queryKey: ["history", owner, "detail", id],
      queryFn: async ({ signal }) => {
        const response = await historyFetch(token, `/api/history/${id}`, {
          signal,
        });
        return detailDecoder(await response.json());
      },
      enabled: owner !== null && id !== null,
      staleTime: 10_000,
      retry: 1,
    });
  const client = {
    owner,
    status: () => stale,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    retain: (entry: HistoryCollection): (() => void) => {
      entry.readers += 1;
      return () => {
        entry.readers -= 1;
        queueMicrotask(() => {
          if (entry.readers !== 0 || pages.get(entry.path) !== entry) {
            return;
          }
          pages.delete(entry.path);
          void entry.collection.cleanup();
          void queries.cancelQueries({ queryKey: entry.options.queryKey });
          queries.removeQueries({ queryKey: entry.options.queryKey });
        });
      };
    },
    page: (path: string): HistoryCollection => {
      let entry = pages.get(path);
      if (entry === undefined) {
        entry = pageOptions(owner, path, queries, token);
        pages.set(path, entry);
      }
      return entry;
    },
    detailOptions,
    request: async (path: string, init?: RequestInit) =>
      await historyFetch(token, path, init),
    observeSnapshot: (sequence: number): void => {
      cursor ??= sequence;
    },
    refresh: async (): Promise<void> => {
      await queries.invalidateQueries({ queryKey: ["history", owner] });
    },
    recover: async (): Promise<void> => {
      if (disposed || recovering || owner === null || cursor === null) {
        return;
      }
      recovering = true;
      try {
        const response = await historyFetch(
          token,
          `/api/activity/changes?after=${cursor}`
        );
        const changes = changesDecoder(await response.json());
        if (disposed) {
          return;
        }
        setStale(false);
        const expected = cursor + 1;
        if (
          changes.events.length > 0 &&
          changes.events[0]?.sequence !== expected
        ) {
          await client.refresh();
          ({ cursor } = changes);
          return;
        }
        const latest = new Map(
          changes.events.map((event) => [event.entityId, event])
        );
        // Existing scoped pages receive only records they already contain.
        // New rows enter through a full refresh of that page, never by treating
        // one cursor page as a replacement for every previously loaded page.
        await Promise.all(
          [...latest.values()].map(async (event) => {
            const targets = [...pages.values()].filter((entry) =>
              entry.collection.has(event.entityId)
            );
            if (targets.length === 0) {
              return;
            }
            if (event.deleted) {
              for (const target of targets) {
                target.collection.utils.writeDelete(event.entityId);
              }
              return;
            }
            const detail = await queries.query({
              ...detailOptions(event.entityId),
              staleTime: 0,
            });
            if (disposed) {
              return;
            }
            for (const target of targets) {
              const old = target.collection.get(event.entityId);
              if (old !== undefined && detail.record.revision > old.revision) {
                target.collection.utils.writeBatch(() => {
                  target.collection.utils.writeUpsert(detail.record);
                });
              }
            }
          })
        );
        ({ cursor } = changes);
        if (changes.events.length > 0) {
          await client.refresh();
        }
        if (changes.hasMore) {
          queueMicrotask(() => {
            void client.recover();
          });
        }
      } catch {
        setStale(true);
      } finally {
        recovering = false;
      }
    },
    attach: (): (() => void) => {
      leases += 1;
      disposed = false;
      return () => {
        leases -= 1;
        queueMicrotask(() => {
          if (leases > 0) {
            return;
          }
          disposed = true;
          for (const entry of pages.values()) {
            void entry.collection.cleanup();
          }
          pages.clear();
          void queries.cancelQueries({ queryKey: ["history", owner] });
          queries.removeQueries({ queryKey: ["history", owner] });
        });
      };
    },
  };
  return client;
};
export type HistoryClient = ReturnType<typeof createHistoryClient>;
export const HistoryContext = createContext<HistoryClient | null>(null);
const useHistoryClient = (): HistoryClient => {
  const client = useContext(HistoryContext);
  if (client === null) {
    throw new Error("History is available inside the workspace.");
  }
  return client;
};
export const useWorkspaceHistory = (app: AppStream): HistoryClient => {
  const queries = useQueryClient();
  const { getToken } = useSessionToken();
  const client = useMemo(
    () => createHistoryClient(app.sessionId, queries, getToken),
    [app.sessionId, queries, getToken]
  );
  useEffect(() => client.attach(), [client]);
  useEffect(() => {
    const recover = async (): Promise<void> => {
      if (!app.connected || app.historySequence < 0) {
        return;
      }
      await client.recover();
    };
    void recover();
    const interval = setInterval(() => {
      void recover();
    }, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [client, app.connected, app.historySequence]);
  return client;
};
export const useHistoryPage = (path: string) => {
  const client = useHistoryClient();
  const entry = useMemo(() => client.page(path), [client, path]);
  useEffect(() => client.retain(entry), [client, entry]);
  const snapshot = useQuery(entry.options);
  const live = useLiveQuery(entry.collection);
  useEffect(() => {
    if (snapshot.data !== undefined) {
      client.observeSnapshot(snapshot.data.sequence);
    }
  }, [client, snapshot.data]);
  const rows = useMemo(
    () =>
      [...live.data].toSorted(
        (a, b) =>
          (b.kind === "conversation" ? b.updatedAt : b.createdAt) -
            (a.kind === "conversation" ? a.updatedAt : a.createdAt) ||
          b.id.localeCompare(a.id)
      ),
    [live.data]
  );
  return { ...snapshot, records: rows, cursor: snapshot.data?.cursor ?? null };
};
export const useHistoryDetail = (id: HistoryId | null) => {
  const client = useHistoryClient();
  return useQuery(client.detailOptions(id));
};

export const useHistoryStale = (): boolean => {
  const client = useHistoryClient();
  return useSyncExternalStore(client.subscribe, client.status, client.status);
};
