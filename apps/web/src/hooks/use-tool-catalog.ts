/** The Tools tab's price list, read once per minute; prices never come from the page. */

import { ToolCatalog } from "@froggy/protocol";
import { useQuery } from "@tanstack/react-query";
import { Schema } from "effect";

import { useSessionToken } from "../lib/session-token";

const decode = Schema.decodeUnknownSync(ToolCatalog);

export const useToolCatalog = () => {
  const { canConnect, getToken } = useSessionToken();
  return useQuery({
    enabled: canConnect,
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch("/api/tools", {
        headers: { authorization: `Bearer ${token ?? ""}` },
      });
      if (!response.ok) {
        throw new Error(`tools: ${response.status}`);
      }
      // Read the clock here, not in render: "2 h ago" is measured from the fetch.
      return { ...decode(await response.json()), fetchedAt: Date.now() };
    },
    queryKey: ["tool-catalog"],
    retry: 1,
    staleTime: 60_000,
  });
};
