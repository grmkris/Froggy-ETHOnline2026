import type { WalletActivityId, WatchlistItemId } from "@froggy/domain";
import { WalletMonitorView } from "@froggy/protocol";
import type { OnchainMonitorConfigure } from "@froggy/protocol";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { Schema } from "effect";
import { useEffect } from "react";

import { useSessionToken } from "./session-token";
import { useWorkspace } from "./workspace-context";

type MonitorView = typeof WalletMonitorView.Type;
export const useWalletMonitor = (itemId: WatchlistItemId, enabled = true) => {
  const { app } = useWorkspace();
  const { canConnect, getToken } = useSessionToken();
  const queries = useQueryClient();
  const key = ["wallet-monitor", app.sessionId, itemId] as const;
  const request = async (
    init?: RequestInit,
    before?: WalletActivityId | null
  ) => {
    const token = await getToken();
    if (token === null || token.length === 0) {
      throw new Error("Sign in to manage this alert.");
    }
    const response = await fetch(
      `/api/watchlist/${itemId}/alerts${before ? `?before=${before}` : ""}`,
      {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      }
    );
    const body: unknown = await response.json();
    if (!response.ok) {
      const error = Schema.decodeUnknownResult(
        Schema.Struct({ error: Schema.String })
      )(body);
      throw new Error(
        error._tag === "Success"
          ? error.success.error
          : "Could not update this alert."
      );
    }
    return Schema.decodeUnknownSync(WalletMonitorView)(body);
  };
  useEffect(() => {
    if (app.watchlistSequence === 0) {
      return;
    }
    void queries.invalidateQueries({
      queryKey: ["wallet-monitor", app.sessionId, itemId],
    });
  }, [app.watchlistSequence, app.sessionId, itemId, queries]);
  const view = useInfiniteQuery<
    MonitorView,
    Error,
    MonitorView,
    typeof key,
    WalletActivityId | null
  >({
    queryKey: key,
    queryFn: async ({ pageParam }) => await request(undefined, pageParam),
    initialPageParam: null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: ({ pages }) => {
      const [first] = pages;
      if (!first) {
        throw new Error("Alert status is missing.");
      }
      const activities = new Map(
        pages
          .flatMap((page) => page.activities)
          .map((activity) => [activity.id, activity])
      );
      return { ...first, activities: [...activities.values()] };
    },
    enabled: enabled && canConnect && app.sessionId !== null,
    refetchInterval: enabled ? 5000 : false,
    retry: false,
  });
  const saved = async (data: MonitorView): Promise<void> => {
    queries.setQueryData<InfiniteData<MonitorView, WalletActivityId | null>>(
      key,
      { pages: [data], pageParams: [null] }
    );
    await queries.invalidateQueries({ queryKey: ["watchlist", app.sessionId] });
  };
  const change = useMutation({
    mutationFn: async (action: "pause" | "resume" | "extend" | "rearm") =>
      await request({
        method: "PATCH",
        body: JSON.stringify({ v: 1, itemId, action }),
      }),
    onSuccess: saved,
    retry: false,
  });
  const configure = useMutation({
    mutationFn: async (input: OnchainMonitorConfigure) =>
      await request({ method: "POST", body: JSON.stringify(input) }),
    onSuccess: saved,
    retry: false,
  });
  return { view, change, configure };
};
