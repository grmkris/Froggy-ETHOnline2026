import type { TradeId } from "@froggy/domain";
import {
  TradeCapabilities,
  TradePositions,
  TradeList,
  TradeStopRequest,
  TradeTicket,
} from "@froggy/protocol";
import type { TradeAnswer, TradePrepare } from "@froggy/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useCallback } from "react";

import { useSessionToken } from "../lib/session-token";

const decodeError = Schema.decodeUnknownResult(
  Schema.Struct({ error: Schema.String })
);
export const useTrades = (sessionId: string | null) => {
  const { canConnect, getToken } = useSessionToken();
  const queries = useQueryClient();
  const enabled = canConnect && sessionId !== null;
  const queryKey = ["trades", sessionId];
  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token ?? ""}`);
      headers.set("content-type", "application/json");
      const response = await fetch(path, { ...init, headers });
      if (!response.ok) {
        const decoded = decodeError(await response.json().catch(() => null));
        throw new Error(
          decoded._tag === "Success"
            ? decoded.success.error
            : `Trade request failed (${response.status}).`
        );
      }
      return response;
    },
    [getToken]
  );
  const refresh = (): void => {
    void queries.invalidateQueries({ queryKey });
  };
  const trades = useQuery({
    enabled,
    queryKey,
    retry: false,
    refetchInterval: 3000,
    queryFn: async ({ signal }) => {
      const response = await api("/api/trades", { signal });
      return Schema.decodeUnknownSync(TradeList)(await response.json());
    },
  });
  const capabilities = useQuery({
    enabled,
    queryKey: ["trade-capabilities", sessionId],
    retry: false,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const response = await api("/api/trades/capabilities", { signal });
      return Schema.decodeUnknownSync(TradeCapabilities)(await response.json());
    },
  });
  const stopped = useQuery({
    enabled,
    queryKey: ["trading-stop", sessionId],
    retry: false,
    refetchInterval: 5000,
    queryFn: async ({ signal }) => {
      const response = await api("/api/trades/stop", { signal });
      return Schema.decodeUnknownSync(TradeStopRequest)(await response.json());
    },
  });
  const remember = async (ticket: TradeTicket) => {
    await queries.cancelQueries({ queryKey });
    queries.setQueryData(
      queryKey,
      (old: typeof TradeList.Type | undefined): typeof TradeList.Type => ({
        v: 1,
        trades: [
          ticket,
          ...(old?.trades.filter((entry) => entry.id !== ticket.id) ?? []),
        ].slice(0, 50),
      })
    );
    refresh();
  };
  const prepare = useMutation({
    retry: false,
    mutationFn: async (input: TradePrepare) => {
      const response = await api("/api/trades", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return Schema.decodeUnknownSync(TradeTicket)(await response.json());
    },
    onSuccess: remember,
  });
  const answer = useMutation({
    retry: false,
    mutationFn: async (input: {
      readonly id: TradeId;
      readonly answer: TradeAnswer;
    }) => {
      const response = await api(`/api/trades/${input.id}/answer`, {
        method: "POST",
        body: JSON.stringify(input.answer),
      });
      return Schema.decodeUnknownSync(TradeTicket)(await response.json());
    },
    onSuccess: remember,
    onError: refresh,
  });
  const inspect = useMutation({
    retry: false,
    mutationFn: async (id: TradeId) => {
      const response = await api(`/api/trades/${id}`);
      return Schema.decodeUnknownSync(TradeTicket)(await response.json());
    },
    onSuccess: remember,
  });
  const cancel = useMutation({
    retry: false,
    mutationFn: async (id: TradeId) => {
      const response = await api(`/api/trades/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ v: 1 }),
      });
      return Schema.decodeUnknownSync(TradeTicket)(await response.json());
    },
    onSuccess: remember,
    onError: refresh,
  });
  const positions = useMutation({
    retry: false,
    mutationFn: async () => {
      const response = await api("/api/trades/positions?network=eip155%3A1");
      return Schema.decodeUnknownSync(TradePositions)(await response.json());
    },
  });
  const stop = useMutation({
    retry: false,
    mutationFn: async (value: boolean) => {
      const response = await api("/api/trades/stop", {
        method: "POST",
        body: JSON.stringify({ v: 1, stopped: value }),
      });
      return Schema.decodeUnknownSync(TradeStopRequest)(await response.json());
    },
    onSuccess: (value) => {
      queries.setQueryData(["trading-stop", sessionId], value);
      refresh();
    },
  });
  return {
    enabled,
    trades,
    capabilities,
    positions,
    stopped,
    prepare,
    answer,
    inspect,
    cancel,
    stop,
  };
};
export type TradesApi = ReturnType<typeof useTrades>;
