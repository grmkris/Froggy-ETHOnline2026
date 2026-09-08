/**
 * The services API, once, so the catalog, the form and the task list share
 * one cache and one way of failing.
 */

import type { TaskId } from "@froggy/domain";
import { ServiceCatalog, ServiceTicket, TaskDetail } from "@froggy/protocol";
import type { ServiceName } from "@froggy/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useCallback } from "react";

import { isSettling } from "../lib/services-view";
import { useSessionToken } from "../lib/session-token";

const Tickets = Schema.Struct({
  v: Schema.Literals([1]),
  tasks: Schema.Array(ServiceTicket),
});
const ErrorBody = Schema.Struct({ error: Schema.String });
const decodeError = Schema.decodeUnknownResult(ErrorBody);
const decodeCatalog = Schema.decodeUnknownSync(ServiceCatalog);
const decodeTickets = Schema.decodeUnknownSync(Tickets);
const decodeTicket = Schema.decodeUnknownSync(ServiceTicket);

const SETTLING_POLL_MS = 3000;
const IDLE_POLL_MS = 15_000;

export interface RunInput {
  readonly idempotencyKey: string;
  readonly prompt: string;
  readonly service: ServiceName;
}

export const useServiceApi = (taskId?: TaskId) => {
  const { getToken } = useSessionToken();
  const queries = useQueryClient();

  const api = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      headers.set("content-type", "application/json");
      headers.set("authorization", `Bearer ${token ?? ""}`);
      const response = await fetch(path, { ...init, headers });
      if (!response.ok) {
        const decoded = decodeError(await response.json().catch(() => null));
        throw new Error(
          decoded._tag === "Success"
            ? decoded.success.error
            : `Request failed (${response.status}).`
        );
      }
      return response;
    },
    [getToken]
  );

  const catalog = useQuery({
    queryFn: async () => {
      const response = await api("/api/services");
      return decodeCatalog(await response.json());
    },
    queryKey: ["service-catalog"],
    retry: false,
    staleTime: 60_000,
  });

  const tasks = useQuery({
    queryFn: async () => {
      const response = await api("/api/services/tasks");
      return decodeTickets(await response.json());
    },
    queryKey: ["service-tasks"],
    refetchInterval: (query) =>
      query.state.data?.tasks.some((task) => isSettling(task.status)) === true
        ? SETTLING_POLL_MS
        : IDLE_POLL_MS,
    retry: false,
  });

  const selectedTask = useQuery({
    enabled: taskId !== undefined,
    queryKey: ["service-task", taskId],
    queryFn: async () => {
      const response = await api(`/api/tasks/${taskId}`);
      return Schema.decodeUnknownSync(TaskDetail)(await response.json());
    },
    refetchInterval: (query) =>
      query.state.data !== undefined && isSettling(query.state.data.task.status)
        ? SETTLING_POLL_MS
        : false,
    retry: false,
  });

  const run = useMutation({
    mutationFn: async (input: RunInput) => {
      const response = await api("/api/services/run", {
        body: JSON.stringify({ v: 1, ...input }),
        method: "POST",
      });
      return decodeTicket(await response.json());
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: ["service-tasks"] });
    },
    retry: false,
  });

  const download = useCallback(
    async (url: string, filename: string): Promise<void> => {
      const response = await api(url);
      const blob = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = blob;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => {
        URL.revokeObjectURL(blob);
      }, 1000);
    },
    [api]
  );

  return { api, catalog, download, run, tasks, selectedTask };
};

export type ServiceApi = ReturnType<typeof useServiceApi>;
