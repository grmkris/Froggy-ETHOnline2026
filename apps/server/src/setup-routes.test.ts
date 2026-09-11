import { describe, expect, test } from "bun:test";

import { userId } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";

import { handleSetup } from "./setup-routes";

const ALICE = userId("did:privy:alice");
const NOW = Date.UTC(2026, 8, 11, 20, 0);

const request = (method: string, body?: string): Request =>
  new Request("http://localhost/api/setup", {
    body: body ?? null,
    headers: { "content-type": "application/json" },
    method,
  });

describe("handleSetup", () => {
  test("is unseen until the flow says otherwise, and can be unseen again", async () => {
    const store = memoryStore();
    const before = await handleSetup(store, request("GET"), ALICE, NOW);
    expect(await before.json()).toEqual({ seenAt: null, v: 1 });

    const seen = await handleSetup(
      store,
      request("PUT", JSON.stringify({ seen: true, v: 1 })),
      ALICE,
      NOW
    );
    expect(await seen.json()).toEqual({ seenAt: NOW, v: 1 });
    expect(await store.setup.load(ALICE)).toBe(NOW);

    const again = await handleSetup(
      store,
      request("PUT", JSON.stringify({ seen: false, v: 1 })),
      ALICE,
      NOW + 1
    );
    expect(await again.json()).toEqual({ seenAt: null, v: 1 });
    const after = await handleSetup(store, request("GET"), ALICE, NOW + 2);
    expect(await after.json()).toEqual({ seenAt: null, v: 1 });
  });

  test("refuses a body it does not understand, and writes nothing", async () => {
    const store = memoryStore();
    const bad = await handleSetup(
      store,
      request("PUT", JSON.stringify({ seen: "yes" })),
      ALICE,
      NOW
    );
    expect(bad.status).toBe(400);
    const empty = await handleSetup(store, request("PUT"), ALICE, NOW);
    expect(empty.status).toBe(400);
    expect(await store.setup.load(ALICE)).toBeNull();
    const other = await handleSetup(store, request("DELETE"), ALICE, NOW);
    expect(other.status).toBe(404);
  });
});
