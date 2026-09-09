/**
 * The receipts a previous tab, or a previous day, produced.
 *
 * The socket only pushes receipts as they happen, so a reload used to start
 * with an empty ledger and a wallet strip that disagreed with it. This asks
 * `/api/receipts` once per session and hands the answer to the reducer, which
 * merges it with whatever the socket has said since.
 */

import { Receipt } from "@froggy/domain";
import { useQuery } from "@tanstack/react-query";
import { Schema } from "effect";
import { useEffect } from "react";

import type { AppEvent } from "../lib/app-state";
import { useSessionToken } from "../lib/session-token";

const ReceiptsBody = Schema.Struct({ receipts: Schema.Array(Receipt) });
const decodeReceipts = Schema.decodeUnknownSync(ReceiptsBody);

export interface ReceiptsBackfill {
  readonly loading: boolean;
  readonly failed: boolean;
  readonly retry: () => void;
}

export const useReceipts = (
  sessionId: string | null,
  dispatch: (event: AppEvent) => void
): ReceiptsBackfill => {
  const { getToken } = useSessionToken();
  const query = useQuery({
    enabled: sessionId !== null,
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch("/api/receipts", {
        headers: token === null ? {} : { authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`receipts: ${response.status}`);
      }
      return decodeReceipts(await response.json()).receipts;
    },
    queryKey: ["receipts", sessionId],
  });

  useEffect(() => {
    if (query.data !== undefined) {
      dispatch({ receipts: query.data, type: "receipts" });
    }
  }, [dispatch, query.data]);

  return {
    loading: query.isPending,
    failed: query.isError,
    retry: () => {
      void query.refetch();
    },
  };
};
