import type { MonitorConfig, MonitorId } from "@froggy/domain";
import { MonitoringState } from "@froggy/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";

import { useSessionToken } from "./session-token";
import { useWorkspace } from "./workspace-context";

export const useMonitoring = () => {
  const { getToken, canConnect } = useSessionToken();
  const { app } = useWorkspace();
  const queries = useQueryClient();
  const key = ["monitoring", app.sessionId];
  const request = async (path: string, method = "GET", input?: Schema.Json) => {
    const token = await getToken();
    if (token === null || token.length === 0) {
      throw new Error("Sign in to manage monitoring.");
    }
    const init: RequestInit = {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    };
    if (input !== undefined) {
      init.body = JSON.stringify(input);
    }
    const response = await fetch(`/api/monitoring${path}`, init);
    const body: unknown = await response.json();
    if (!response.ok) {
      const error = Schema.decodeUnknownResult(
        Schema.Struct({ error: Schema.String })
      )(body);
      throw new Error(
        error._tag === "Success"
          ? error.success.error
          : "Monitoring could not be updated."
      );
    }
    return body;
  };
  const refresh = async () => {
    await queries.invalidateQueries({ queryKey: key });
  };
  const state = useQuery({
    queryKey: key,
    enabled: canConnect && app.sessionId !== null,
    queryFn: async () =>
      Schema.decodeUnknownSync(MonitoringState)(await request("")),
    refetchInterval: 10_000,
    retry: false,
  });
  const configure = useMutation({
    mutationFn: async (input: MonitorConfig) =>
      await request("", "POST", { ...input, v: 1 }),
    onSuccess: refresh,
    retry: false,
  });
  const budget = useMutation({
    mutationFn: async (input: { monthlyUsdMicros: number; timezone: string }) =>
      await request("/budget", "PUT", { ...input, v: 1 }),
    onSuccess: refresh,
    retry: false,
  });
  const action = useMutation({
    mutationFn: async (input: {
      id: MonitorId;
      action: "pause" | "resume" | "check";
    }) => await request("/action", "POST", { ...input, v: 1 }),
    onSuccess: refresh,
    retry: false,
  });
  return { state, configure, budget, action };
};
