import { Update, UpdatesPage, WalletActivity } from "@froggy/domain";
import type { UpdateId } from "@froggy/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useCallback, useEffect, useRef } from "react";

import { useSessionToken } from "./session-token";
import { useWorkspace } from "./workspace-context";

const Updated = Schema.Struct({
  v: Schema.Literal(1),
  update: Update,
  activity: Schema.NullOr(WalletActivity),
});
const ReadResult = Schema.Struct({ v: Schema.Literal(1), unread: Schema.Int });

const useUpdatesClient = () => {
  const { getToken, canConnect } = useSessionToken();
  const { app } = useWorkspace();
  const queries = useQueryClient();
  const request = useCallback(
    async (path: string, method = "GET") => {
      const token = await getToken();
      if (token === null || token === "") {
        throw new Error("Sign in to read your updates.");
      }
      const init: RequestInit = {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      };
      if (method === "POST") {
        init.body = JSON.stringify({ v: 1 });
      }
      const response = await fetch(`/api/updates${path}`, init);
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = Schema.decodeUnknownResult(
          Schema.Struct({ error: Schema.String })
        )(body);
        throw new Error(
          parsed._tag === "Success"
            ? parsed.success.error
            : "Updates could not be loaded."
        );
      }
      return body;
    },
    [getToken]
  );
  const refresh = useCallback(async () => {
    await queries.invalidateQueries({ queryKey: ["updates", app.sessionId] });
  }, [queries, app.sessionId]);
  const previousUnread = useRef(-1);
  useEffect(() => {
    if (previousUnread.current !== app.updatesUnread) {
      previousUnread.current = app.updatesUnread;
      void refresh();
    }
  }, [app.updatesUnread, refresh]);
  return {
    request,
    refresh,
    owner: app.sessionId,
    enabled: canConnect && app.sessionId !== null,
  };
};

export const useUpdatesPage = (before?: UpdateId) => {
  const client = useUpdatesClient();
  return useQuery({
    queryKey: ["updates", client.owner, "page", before ?? ""],
    queryFn: async () =>
      Schema.decodeUnknownSync(UpdatesPage)(
        await client.request(before ? `?before=${before}` : "")
      ),
    enabled: client.enabled,
    refetchInterval: 30_000,
    retry: false,
  });
};

export const useUpdate = (id: UpdateId) => {
  const client = useUpdatesClient();
  return useQuery({
    queryKey: ["updates", client.owner, "item", id],
    queryFn: async () =>
      Schema.decodeUnknownSync(Updated)(await client.request(`/${id}`)),
    enabled: client.enabled,
    refetchInterval: 30_000,
    retry: false,
  });
};

export const useReadUpdates = () => {
  const client = useUpdatesClient();
  return useMutation({
    mutationFn: async (id: UpdateId | "all") =>
      Schema.decodeUnknownSync(ReadResult)(
        await client.request(id === "all" ? "/read-all" : `/${id}/read`, "POST")
      ),
    onSuccess: client.refresh,
    retry: false,
  });
};
