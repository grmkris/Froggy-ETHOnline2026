import { CreditActivity, CreditPurchase, CreditState } from "@froggy/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useCallback } from "react";

import { payCreditPurchaseInBrowser } from "../lib/credit-payment";
import type { CreditPaymentOutcome } from "../lib/credit-payment";
import { useIdentity } from "../lib/privy";
import { useSessionToken } from "../lib/session-token";
import { useWorkspace } from "../lib/workspace-context";

const ErrorBody = Schema.Struct({ error: Schema.String });

export const useCredits = (history = false) => {
  const { canConnect, getToken } = useSessionToken();
  const identity = useIdentity();
  const { app } = useWorkspace();
  const queries = useQueryClient();
  const key = ["credits", app.sessionId];
  const request = useCallback(
    async (path: string, body?: Schema.Json, method = "POST") => {
      const token = await getToken();
      const init: RequestInit = {
        method: body === undefined ? "GET" : method,
        headers: {
          authorization: `Bearer ${token ?? ""}`,
          "content-type": "application/json",
        },
        cache: "no-store",
      };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      const response = await fetch(`/api/credits${path}`, init);
      const value: unknown = await response.json();
      if (!response.ok) {
        const error = Schema.decodeUnknownResult(ErrorBody)(value);
        throw new Error(
          error._tag === "Success"
            ? error.success.error
            : "Credits could not be updated. Check the saved purchase before retrying."
        );
      }
      return Schema.decodeUnknownSync(Schema.Json)(value);
    },
    [getToken]
  );
  const refresh = async () => {
    await queries.invalidateQueries({ queryKey: ["credits"] });
  };
  const summary = useQuery({
    queryKey: key,
    enabled: canConnect && app.sessionId !== null,
    queryFn: async () =>
      Schema.decodeUnknownSync(CreditState)(await request("")),
    refetchInterval: 5000,
    retry: false,
  });
  const activity = useQuery({
    queryKey: [...key, "activity"],
    enabled: history && canConnect && app.sessionId !== null,
    queryFn: async () =>
      Schema.decodeUnknownSync(CreditActivity)(await request("/activity")),
    refetchInterval: 5000,
    retry: false,
  });
  const limits = useMutation({
    mutationFn: async (input: { perTaskUnits: number; dailyUnits: number }) =>
      await request("/limits", { v: 1, ...input }, "PUT"),
    onSuccess: refresh,
    retry: false,
  });
  const create = useMutation({
    mutationFn: async (input: {
      idempotencyKey: string;
      amountUsdMicros: number;
      network: string;
    }) =>
      Schema.decodeUnknownSync(CreditPurchase)(
        await request("/purchases", { v: 1, ...input })
      ),
    onSuccess: refresh,
    retry: false,
  });
  // A live USDC quote is signed here, by the person's own wallet; a stubbed
  // or HBAR quote is paid by the server, which holds what those need.
  const pay = useMutation({
    mutationFn: async (
      purchase: CreditPurchase
    ): Promise<CreditPaymentOutcome> => {
      if (purchase.stubbed || !purchase.network.startsWith("eip155:")) {
        return {
          kind: "submitted",
          purchase: Schema.decodeUnknownSync(CreditPurchase)(
            await request(`/purchases/${purchase.id}/pay`, { v: 1 })
          ),
        };
      }
      return await payCreditPurchaseInBrowser({
        purchase,
        address: identity.address,
        sign: identity.signTypedData,
        token: await getToken(),
      });
    },
    onSettled: refresh,
    retry: false,
  });
  const canSignUsdc =
    identity.signTypedData !== null && identity.address !== null;
  return {
    summary,
    activity,
    limits,
    create,
    pay,
    canSignUsdc,
    refresh,
    request,
  };
};
