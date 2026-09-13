import {
  CardCheckoutList,
  PaymentMethods,
  TradeAuthorization,
} from "@froggy/protocol";
import type { CardCheckoutApprove, CardCheckoutView } from "@froggy/protocol";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useCallback } from "react";

import { useIdentity } from "../lib/privy";
import { useSessionToken } from "../lib/session-token";
import { useWorkspace } from "../lib/workspace-context";

export const useCardApi = () => {
  const { getToken, canConnect } = useSessionToken();
  const { app } = useWorkspace();
  const queries = useQueryClient();
  const request = useCallback(
    async (path: string, body?: Schema.Json, method?: string) => {
      const token = await getToken();
      const init: RequestInit = {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: {
          authorization: `Bearer ${token ?? ""}`,
          "content-type": "application/json",
        },
      };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      const response = await fetch(path, init);
      if (!response.ok) {
        const error = Schema.decodeUnknownResult(
          Schema.Struct({ error: Schema.String })
        )(await response.json().catch(() => null));
        throw new Error(
          error._tag === "Success"
            ? error.success.error
            : "Purchase request failed."
        );
      }
      return Schema.decodeUnknownSync(Schema.Json)(await response.json());
    },
    [getToken]
  );
  const refresh = async () => {
    await queries.invalidateQueries({ queryKey: ["cards", app.sessionId] });
  };
  return {
    request,
    refresh,
    enabled: canConnect,
    owner: app.sessionId,
  };
};
export const usePaymentMethods = () => {
  const api = useCardApi();
  return useQuery({
    queryKey: ["cards", api.owner, "methods"],
    enabled: api.enabled,
    retry: false,
    staleTime: 15_000,
    queryFn: async () =>
      Schema.decodeUnknownSync(PaymentMethods)(
        await api.request("/api/payment-methods")
      ),
  });
};
export const useCardCheckouts = () => {
  const api = useCardApi();
  return useQuery({
    queryKey: ["cards", api.owner, "checkouts"],
    enabled: api.enabled,
    retry: false,
    refetchInterval: 3000,
    queryFn: async () =>
      Schema.decodeUnknownSync(CardCheckoutList)(
        await api.request("/api/card-checkouts")
      ),
  });
};
export const useCardApproval = () => {
  const api = useCardApi();
  const identity = useIdentity();
  return async (view: typeof CardCheckoutView.Type) => {
    const { checkout, trade } = view;
    if (checkout.fingerprint === null) {
      throw new Error("This purchase has no active review.");
    }
    const step = trade?.steps[0];
    let input: typeof CardCheckoutApprove.Type = {
      v: 1,
      fingerprint: checkout.fingerprint,
      tradeAnswer:
        step === undefined
          ? null
          : {
              v: 1,
              stepId: step.id,
              approvalId: step.approvalId,
              fingerprint: step.fingerprint,
              decision: "allow_once",
            },
    };
    const authorization = Schema.decodeUnknownSync(TradeAuthorization)(
      await api.request(
        `/api/card-checkouts/${checkout.id}/authorization`,
        input
      )
    );
    if (authorization.request !== null) {
      const signature = await identity.signPrivyRequest?.(
        authorization.request
      );
      if (
        signature === undefined ||
        signature === null ||
        signature === "" ||
        input.tradeAnswer === null
      ) {
        throw new Error("Wallet authorization was not completed.");
      }
      input = {
        ...input,
        tradeAnswer: {
          ...input.tradeAnswer,
          authorizationSignature: signature,
        },
      };
    }
    await api.request(`/api/card-checkouts/${checkout.id}/approve`, input);
    await api.refresh();
  };
};
