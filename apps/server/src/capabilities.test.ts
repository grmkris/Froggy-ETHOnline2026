import { expect, test } from "bun:test";

import { OAuthClientId, OAuthGrantId, userId } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";

import { canUseTool, connectionScopes } from "./capabilities";
import { handleMonitoring } from "./monitoring-routes";

test("delegated permissions are owner scoped and revocation is checked on every use", async () => {
  const store = memoryStore();
  const owner = userId("did:privy:capability-owner");
  const other = userId("did:privy:capability-other");
  const id = OAuthGrantId.generate();
  const clientId = OAuthClientId.generate();
  await store.oauth.clients.create({
    id: clientId,
    name: "Test agent",
    redirectUris: ["https://example.com/callback"],
    createdAt: 0,
  });
  await store.oauth.grants.create(owner, {
    id,
    clientId,
    clientName: "Test agent",
    createdAt: 0,
    lastUsedAt: null,
    revokedAt: null,
    scopes: ["browse", "email:read", "automation"],
  });
  const scopes = await connectionScopes(store, owner, id);
  expect(canUseTool("email_read", "browse", scopes)).toBe(true);
  expect(canUseTool("email_draft", "browse", scopes)).toBe(false);
  expect(canUseTool("watchlist_list", "browse", scopes)).toBe(false);
  expect(connectionScopes(store, other, id)).rejects.toThrow("revoked");
  const budget = await handleMonitoring(
    store,
    { userId: owner, grantId: id, agentTokenId: null, scopes },
    new Request("https://froggy.test/api/monitoring/budget", {
      method: "PUT",
      body: JSON.stringify({
        v: 1,
        monthlyUsdMicros: 50_000_000,
        timezone: "UTC",
      }),
    })
  );
  expect(budget?.status).toBe(403);
  await store.oauth.grants.revoke(owner, id, Date.now());
  expect(connectionScopes(store, owner, id)).rejects.toThrow("revoked");
});
