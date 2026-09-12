/**
 * Whether this person has been through the welcome flow.
 *
 * Home reads it before deciding what to show; the flow writes it on the way
 * out, whichever exit was taken. One cache key, so the flow's write is what
 * Home sees next — and written into the cache before the request is sent,
 * because a person who just pressed Finish should land on Home even when the
 * request fails, and be asked again another day rather than now.
 */

import { SetupState } from "@froggy/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useCallback, useMemo } from "react";

import { useSessionToken } from "../lib/session-token";
import { useWorkspace } from "../lib/workspace-context";

const decodeState = Schema.decodeUnknownSync(SetupState);

export interface Setup {
  /** Undefined while unknown, null while never seen. */
  readonly seenAt: number | null | undefined;
  /** The question could not be answered; Home shows itself rather than nothing. */
  readonly failed: boolean;
  readonly markSeen: () => void;
}

export const useSetup = (): Setup => {
  const { getToken, canConnect } = useSessionToken();
  const { app } = useWorkspace();
  const key = useMemo(() => ["setup", app.sessionId] as const, [app.sessionId]);
  const queries = useQueryClient();
  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token === null ? {} : { authorization: `Bearer ${token}` };
  }, [getToken]);

  const state = useQuery({
    enabled: canConnect && app.sessionId !== null,
    queryFn: async () => {
      const response = await fetch("/api/setup", { headers: await headers() });
      if (!response.ok) {
        throw new Error(`setup: ${response.status}`);
      }
      return decodeState(await response.json());
    },
    queryKey: key,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const save = useMutation({
    onMutate: () => ({ key }),
    mutationFn: async () => {
      const response = await fetch("/api/setup", {
        body: JSON.stringify({ seen: true, v: 1 }),
        headers: { ...(await headers()), "content-type": "application/json" },
        method: "PUT",
      });
      if (!response.ok) {
        throw new Error(`setup: ${response.status}`);
      }
      return decodeState(await response.json());
    },
    onSuccess: (next, _input, context) => {
      queries.setQueryData(context.key, next);
    },
  });

  const { mutate } = save;
  const markSeen = useCallback((): void => {
    queries.setQueryData<SetupState>(key, { seenAt: Date.now(), v: 1 });
    mutate();
  }, [key, mutate, queries]);

  return {
    failed: state.isError,
    markSeen,
    seenAt: state.data?.seenAt,
  };
};
