import type { PurchaseId } from "@froggy/domain";
import {
  PurchaseList,
  PurchaseTicket,
  PurchaseWallets,
} from "@froggy/protocol";
import type { PurchaseAnswer, PurchaseRequest } from "@froggy/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useCallback } from "react";

import { useSessionToken } from "../lib/session-token";

const decodeList = Schema.decodeUnknownSync(PurchaseList);
const decodeTicket = Schema.decodeUnknownSync(PurchaseTicket);
const decodeWallets = Schema.decodeUnknownSync(PurchaseWallets);
const decodeError = Schema.decodeUnknownResult(
  Schema.Struct({ error: Schema.String })
);

export const usePurchases = (sessionId: string | null, showWallets = false) => {
  const { canConnect, getToken } = useSessionToken();
  const queries = useQueryClient();
  const enabled = canConnect && sessionId !== null;
  const queryKey = ["purchases", sessionId];
  const walletKey = ["purchase-wallets", sessionId];
  const api = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
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
            : `Request failed (${response.status}).`
        );
      }
      return response;
    },
    [getToken]
  );
  const purchases = useQuery({
    enabled,
    queryKey,
    queryFn: async ({ signal }) => {
      const response = await api("/api/purchases", { signal });
      return decodeList(await response.json());
    },
    refetchInterval: (query) =>
      query.state.data?.purchases.some(
        (purchase) =>
          purchase.status === "probing" ||
          purchase.status === "awaiting_approval" ||
          purchase.status === "paying"
      ) === true
        ? 2000
        : 5000,
    retry: false,
  });
  const wallets = useQuery({
    enabled: enabled && showWallets,
    queryKey: walletKey,
    queryFn: async ({ signal }) => {
      const response = await api("/api/purchases/wallets", { signal });
      return decodeWallets(await response.json());
    },
    refetchInterval: 30_000,
    retry: false,
    staleTime: 15_000,
  });
  const remember = async (ticket: PurchaseTicket): Promise<void> => {
    await queries.cancelQueries({ queryKey });
    queries.setQueryData(
      queryKey,
      (
        previous: typeof PurchaseList.Type | undefined
      ): typeof PurchaseList.Type => ({
        v: 1,
        purchases: [
          ticket,
          ...(previous?.purchases.filter(
            (purchase) => purchase.id !== ticket.id
          ) ?? []),
        ].slice(0, 50),
      })
    );
    void queries.invalidateQueries({ queryKey });
    void queries.invalidateQueries({ queryKey: walletKey });
  };
  const request = useMutation({
    mutationFn: async (input: PurchaseRequest) => {
      const response = await api("/api/purchases", {
        body: JSON.stringify(input),
        method: "POST",
      });
      return decodeTicket(await response.json());
    },
    onSuccess: remember,
    retry: false,
  });
  const answer = useMutation({
    mutationFn: async (input: {
      readonly id: PurchaseId;
      readonly answer: PurchaseAnswer;
    }) => {
      const response = await api(`/api/purchases/${input.id}/answer`, {
        body: JSON.stringify(input.answer),
        method: "POST",
      });
      return decodeTicket(await response.json());
    },
    onSuccess: remember,
    onError: () => {
      void queries.invalidateQueries({ queryKey });
    },
    retry: false,
  });
  const createSolana = useMutation({
    mutationFn: async () => {
      const response = await api("/api/purchases/wallets/solana", {
        body: JSON.stringify({ v: 1 }),
        method: "POST",
      });
      return decodeWallets(await response.json());
    },
    onSuccess: (value) => {
      queries.setQueryData(walletKey, value);
    },
    retry: false,
  });
  return { answer, createSolana, enabled, purchases, request, wallets };
};

export type PurchasesApi = ReturnType<typeof usePurchases>;
