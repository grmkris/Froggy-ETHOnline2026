/** The agent tokens: the list, minting one, revoking one. One cache for both panels. */

import { OAuthGrant } from "@froggy/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useCallback } from "react";

import { setMintedSkill } from "../lib/minted-skill-store";
import { useSessionToken } from "../lib/session-token";

export const AgentToken = Schema.Struct({
  createdAt: Schema.Int,
  id: Schema.String,
  label: Schema.String,
  lastUsedAt: Schema.NullOr(Schema.Int),
  revokedAt: Schema.NullOr(Schema.Int),
});
export type AgentToken = typeof AgentToken.Type;
const Listed = Schema.Struct({
  agents: Schema.Array(AgentToken),
  grants: Schema.Array(OAuthGrant),
});
const Minted = Schema.Struct({
  secret: Schema.String,
  skill: Schema.String,
  token: AgentToken,
});
const decodeListed = Schema.decodeUnknownSync(Listed);
const decodeMinted = Schema.decodeUnknownSync(Minted);

export const useAgentTokens = () => {
  const { getToken } = useSessionToken();
  const queries = useQueryClient();
  const headers = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token === null ? {} : { authorization: `Bearer ${token}` };
  }, [getToken]);

  const agents = useQuery({
    queryFn: async () => {
      const response = await fetch("/api/agents", { headers: await headers() });
      if (!response.ok) {
        throw new Error(`agents: ${response.status}`);
      }
      return decodeListed(await response.json());
    },
    queryKey: ["agents"],
    refetchOnWindowFocus: "always",
    refetchInterval: 10_000,
    retry: false,
  });

  const mint = useMutation({
    mutationFn: async (label: string) => {
      const response = await fetch("/api/agents", {
        body: JSON.stringify({ label }),
        headers: { "content-type": "application/json", ...(await headers()) },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`agents: ${response.status}`);
      }
      // Keep the one-time token in memory across navigation, outside the cache.
      const { secret, skill } = decodeMinted(await response.json());
      setMintedSkill({ secret, skill });
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: ["agents"] });
    },
    retry: false,
  });

  const revoke = useCallback(
    async (id: string): Promise<void> => {
      const response = await fetch(`/api/agents/${id}`, {
        headers: await headers(),
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`agents: ${response.status}`);
      }
      await queries.invalidateQueries({ queryKey: ["agents"] });
    },
    [headers, queries]
  );

  return { agents, mint, revoke };
};
