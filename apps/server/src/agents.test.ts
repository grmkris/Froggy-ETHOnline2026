import { describe, expect, it } from "bun:test";

import { userId } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";

import {
  agentMayCall,
  looksLikeAgentSecret,
  mintAgentToken,
  resolveAgentSecret,
  requiredScope,
} from "./agents";

const ALICE = userId("did:privy:agents-test");
const NOW = 1_756_000_000_000;

describe("agent tokens", () => {
  it("mints a secret that resolves to the person until it is revoked, and never stores it", async () => {
    const store = memoryStore();
    const minted = await mintAgentToken(store, ALICE, "Hermes", NOW);
    expect(looksLikeAgentSecret(minted.secret)).toBe(true);
    expect(minted.token.label).toBe("Hermes");

    const resolved = await resolveAgentSecret(store, minted.secret, NOW + 1);
    expect(resolved?.userId).toBe(ALICE);
    expect(resolved?.token.id).toBe(minted.token.id);

    const listed = await store.agents.list(ALICE);
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(minted.secret);

    await store.agents.revoke(ALICE, minted.token.id);
    expect(await resolveAgentSecret(store, minted.secret, NOW + 2)).toBeNull();
  });

  it("does not resolve a secret it never minted, nor one without the prefix", async () => {
    const store = memoryStore();
    expect(await resolveAgentSecret(store, "fgy_nope", NOW)).toBeNull();
    expect(await resolveAgentSecret(store, "not-ours", NOW)).toBeNull();
  });

  it("lets a token reach tasks and the signing endpoint, and nothing that changes authority", () => {
    expect(agentMayCall("/api/tasks", "POST")).toBe(true);
    expect(agentMayCall("/api/tasks/tsk_x/events", "GET")).toBe(true);
    expect(agentMayCall("/api/wallet", "GET")).toBe(true);
    expect(agentMayCall("/api/wallet/pay", "POST")).toBe(true);
    expect(agentMayCall("/mcp", "POST")).toBe(true);
    expect(agentMayCall("/api/mcp", "POST")).toBe(true);
    expect(agentMayCall("/api/oauth/consent", "POST")).toBe(false);
    expect(agentMayCall("/api/directory", "POST")).toBe(false);
    expect(agentMayCall("/api/agents", "POST")).toBe(false);
    expect(agentMayCall("/api/me", "DELETE")).toBe(false);
    expect(agentMayCall("/api/setup", "PUT")).toBe(false);
    expect(agentMayCall("/api/chat", "POST")).toBe(false);
    expect(agentMayCall("/api/wallet-requests", "GET")).toBe(false);
    expect(agentMayCall("/api/wallet-requests/bwr_x/prepare", "POST")).toBe(
      false
    );
    expect(agentMayCall("/api/wallet-requests/bwr_x/commit", "POST")).toBe(
      false
    );
    expect(agentMayCall("/api/wallet-connections", "GET")).toBe(false);
    expect(agentMayCall("/api/wallet-connections/bwc_x", "DELETE")).toBe(false);
  });
});

describe("agent purchase routes", () => {
  it("permits requests and status reads, while keeping approvals and wallets owner-only", () => {
    const purchase = "/api/purchases/pur_01k4test";
    expect(agentMayCall("/api/purchases", "POST")).toBe(true);
    expect(agentMayCall("/api/purchases", "GET")).toBe(true);
    expect(agentMayCall(purchase, "GET")).toBe(true);
    expect(agentMayCall(`${purchase}/answer`, "POST")).toBe(false);
    expect(agentMayCall(`${purchase}/cancel`, "POST")).toBe(false);
    expect(agentMayCall("/api/purchases/wallets", "GET")).toBe(false);
    expect(agentMayCall("/api/purchases/wallets/solana", "POST")).toBe(false);
  });

  it("requires the OAuth pay scope for purchase requests and status reads", () => {
    expect(requiredScope("/api/purchases", "POST")).toBe("pay");
    expect(requiredScope("/api/purchases", "GET")).toBe("pay");
    expect(requiredScope("/api/purchases/pur_01k4test", "GET")).toBe("pay");
  });
});
