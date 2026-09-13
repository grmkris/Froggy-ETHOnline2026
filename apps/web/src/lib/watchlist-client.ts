import { WatchlistItem } from "@froggy/domain";
import type { WatchlistInput, WatchlistItemId } from "@froggy/domain";
import { WatchlistList } from "@froggy/protocol";
import type { WatchlistPatch } from "@froggy/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useCallback } from "react";

import { useSessionToken } from "./session-token";
import { useWorkspace } from "./workspace-context";

export const useWatchlist = () => {
  const { app } = useWorkspace();
  const { canConnect, getToken } = useSessionToken();
  const queries = useQueryClient();
  const key = ["watchlist", app.sessionId];
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
  };
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
  return { list, save, patch, remove };
};
