import { WatchlistItem } from "@froggy/domain";
import type { WatchlistInput, WatchlistItemId } from "@froggy/domain";
import {
  WatchlistList,
  WatchlistPreview,
  WatchlistCaptured,
  WatchlistDetails,
  WatchlistDetailsList,
} from "@froggy/protocol";
import type {
  WatchlistPatch,
  WatchlistResolve,
  WatchlistCapture,
} from "@froggy/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useCallback, useEffect } from "react";

import { useSessionToken } from "./session-token";
import { useWorkspace } from "./workspace-context";

export const useWatchlist = () => {
  const { app } = useWorkspace();
  const { canConnect, getToken } = useSessionToken();
  const queries = useQueryClient();
  const key = ["watchlist", app.sessionId];
  useEffect(() => {
    if (app.watchlistSequence === 0) {
      return;
    }
    void queries.invalidateQueries({ queryKey: ["watchlist", app.sessionId] });
  }, [app.watchlistSequence, app.sessionId, queries]);
  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const token = await getToken();
      if (token === null) {
        throw new Error("Sign in to open your watchlist.");
      }
      const response = await fetch(path, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const decoded = Schema.decodeUnknownResult(
          Schema.Struct({ error: Schema.String })
        )(body);
        throw new Error(
          decoded._tag === "Success"
            ? decoded.success.error
            : "Your watchlist could not be updated."
        );
      }
      return body;
    },
    [getToken]
  );
  const list = useQuery({
    queryKey: key,
    enabled: canConnect && app.sessionId !== null,
    queryFn: async () =>
      Schema.decodeUnknownSync(WatchlistList)(await request("/api/watchlist")),
    refetchInterval: 30_000,
    retry: false,
  });
  const refresh = async () => {
    await queries.invalidateQueries({ queryKey: key });
    await queries.invalidateQueries({
      queryKey: ["watchlist-details", app.sessionId],
    });
  };
  const details = useQuery({
    queryKey: ["watchlist-details", app.sessionId],
    enabled: canConnect && app.sessionId !== null,
    queryFn: async () =>
      Schema.decodeUnknownSync(WatchlistDetailsList)(
        await request("/api/watchlist/details")
      ),
    refetchInterval: 10_000,
    retry: false,
  });
  const capture = useMutation({
    mutationFn: async (input: typeof WatchlistCapture.Type) =>
      Schema.decodeUnknownSync(WatchlistCaptured)(
        await request("/api/watchlist/capture", {
          method: "POST",
          body: JSON.stringify(input),
        })
      ),
    onSuccess: refresh,
    retry: false,
  });
  const save = useMutation({
    mutationFn: async (input: WatchlistInput) =>
      Schema.decodeUnknownSync(WatchlistItem)(
        await request("/api/watchlist", {
          method: "POST",
          body: JSON.stringify({ ...input, v: 1 }),
        })
      ),
    onSuccess: refresh,
    retry: false,
  });
  const patch = useMutation({
    mutationFn: async ({
      id,
      ...input
    }: WatchlistPatch & { readonly id: WatchlistItemId }) =>
      Schema.decodeUnknownSync(WatchlistItem)(
        await request(`/api/watchlist/${id}`, {
          method: "PATCH",
          body: JSON.stringify(input),
        })
      ),
    onSuccess: refresh,
    onError: refresh,
    retry: false,
  });
  const remove = useMutation({
    mutationFn: async (id: WatchlistItemId) => {
      const result = await request(`/api/watchlist/${id}`, {
        method: "DELETE",
      });
      return Schema.decodeUnknownSync(
        Schema.Struct({ v: Schema.Literal(1), removed: Schema.Boolean })
      )(result);
    },
    onSuccess: refresh,
    retry: false,
  });
  const resolve = useCallback(
    async (input: typeof WatchlistResolve.Type, signal?: AbortSignal) =>
      Schema.decodeUnknownSync(WatchlistPreview)(
        await request("/api/watchlist/resolve", {
          method: "POST",
          body: JSON.stringify(input),
          signal: signal ?? null,
        })
      ),
    [request]
  );
  return { list, save, patch, remove, resolve, capture, details, request };
};

export const useWatchlistDetails = (id: WatchlistItemId) => {
  const { request } = useWatchlist();
  const { app } = useWorkspace();
  return useQuery({
    queryKey: ["watchlist-details", app.sessionId, id],
    queryFn: async () =>
      Schema.decodeUnknownSync(WatchlistDetails)(
        await request(`/api/watchlist/${id}/details`)
      ),
    enabled: app.sessionId !== null,
    refetchInterval: (query) =>
      ["queued", "running"].includes(
        query.state.data?.data.enrichment?.status ?? ""
      )
        ? 3000
        : 30_000,
    retry: false,
  });
};

interface WatchlistView {
  readonly query: string;
  readonly category: string;
  readonly sort: string;
  readonly archived: boolean;
  readonly attention: boolean;
}
const INITIAL_VIEW: WatchlistView = {
  query: "",
  category: "all",
  sort: "newest",
  archived: false,
  attention: false,
};
/** Keep navigation preferences in this owner's query cache, without persisting personal searches. */
export const useWatchlistView = () => {
  const { app } = useWorkspace();
  const client = useQueryClient();
  const key = ["watchlist-view", app.sessionId];
  const view = useQuery({
    queryKey: key,
    queryFn: () => INITIAL_VIEW,
    initialData: INITIAL_VIEW,
    enabled: false,
    gcTime: 30 * 60_000,
  });
  const update = (patch: Partial<WatchlistView>): void => {
    client.setQueryData<WatchlistView>(key, (current) => ({
      ...INITIAL_VIEW,
      ...current,
      ...patch,
    }));
  };
  return { ...view.data, update };
};
