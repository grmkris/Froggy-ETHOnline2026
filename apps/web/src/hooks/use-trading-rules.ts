import { TradeRule } from "@froggy/domain";
import type { TradeRuleId } from "@froggy/domain";
import { LaunchWatchTicket, TradeRuleList } from "@froggy/protocol";
import type { TradeRuleRequest } from "@froggy/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useCallback } from "react";

import { useSessionToken } from "../lib/session-token";

const Watches = Schema.Struct({
  v: Schema.Literal(1),
  watches: Schema.Array(LaunchWatchTicket).check(Schema.isMaxLength(20)),
});
const Failure = Schema.Struct({ error: Schema.String });

export const useTradingRules = (sessionId: string | null) => {
  const { canConnect, getToken } = useSessionToken();
  const queries = useQueryClient();
  const enabled = canConnect && sessionId !== null;
  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token ?? ""}`);
      headers.set("content-type", "application/json");
      const response = await fetch(path, { ...init, headers });
      if (!response.ok) {
        const error = Schema.decodeUnknownResult(Failure)(
          await response.json().catch(() => null)
        );
        throw new Error(
          error._tag === "Success"
            ? error.success.error
            : "Trading rule request failed."
        );
      }
      return response;
    },
    [getToken]
  );
  const refresh = (): void => {
    void queries.invalidateQueries({ queryKey: ["trade-rules", sessionId] });
    void queries.invalidateQueries({ queryKey: ["rule-watches", sessionId] });
    void queries.invalidateQueries({ queryKey: ["launch-watches"] });
  };
  const rules = useQuery({
    enabled,
    queryKey: ["trade-rules", sessionId],
    retry: false,
    refetchInterval: 5000,
    queryFn: async ({ signal }) => {
      const response = await api("/api/trades/rules", { signal });
      return Schema.decodeUnknownSync(TradeRuleList)(await response.json());
    },
  });
  const watches = useQuery({
    enabled,
    queryKey: ["rule-watches", sessionId],
    retry: false,
    refetchInterval: 5000,
    queryFn: async ({ signal }) => {
      const response = await api("/api/services/watches", { signal });
      return Schema.decodeUnknownSync(Watches)(await response.json());
    },
  });
  const create = useMutation({
    retry: false,
    mutationFn: async (input: TradeRuleRequest) => {
      const response = await api("/api/trades/rules", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return Schema.decodeUnknownSync(TradeRule)(await response.json());
    },
    onSuccess: refresh,
  });
  const revoke = useMutation({
    retry: false,
    mutationFn: async (id: TradeRuleId) => {
      await api(`/api/trades/rules/${id}`, { method: "DELETE" });
    },
    onSuccess: refresh,
  });
  return { rules, watches, create, revoke, enabled };
};
export type TradingRulesApi = ReturnType<typeof useTradingRules>;
