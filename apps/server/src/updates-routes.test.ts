import { expect, test } from "bun:test";

import { UpdateId, userId } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";

import { agentMayCall } from "./agents";
import { handleUpdates } from "./updates-routes";

const request = (path: string, method = "GET"): Request => {
  const init: RequestInit = { method };
  if (method === "POST") {
    init.body = JSON.stringify({ v: 1 });
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`https://froggy.example/api/updates${path}`, init);
};

test("updates routes isolate owners and announce absolute read counts", async () => {
  const store = memoryStore();
  const owner = userId("did:privy:updates-route");
  const other = userId("did:privy:updates-other");
  const id = UpdateId.generate();
  await store.updates.save(owner, {
    v: 1,
    id,
    kind: "notice",
    key: "route",
    itemId: null,
    title: "Notice",
    body: "Recorded",
    at: 10,
    readAt: null,
    stubbed: true,
  });

  const denied = await handleUpdates(store, request(`/${id}`), other);
  expect(denied?.status).toBe(404);
  const invalid = await handleUpdates(store, request("?before=invalid"), owner);
  expect(invalid?.status).toBe(400);
  const detail = await handleUpdates(store, request(`/${id}`), owner);
  expect(detail?.status).toBe(200);
  expect(await detail?.json()).toMatchObject({
    v: 1,
    update: { id },
    activity: null,
  });
  const unversioned = await handleUpdates(
    store,
    new Request(`https://froggy.example/api/updates/${id}/read`, {
      method: "POST",
      body: "{}",
    }),
    owner
  );
  expect(unversioned?.status).toBe(400);
  const messages: unknown[] = [];
  const read = await handleUpdates(
    store,
    request(`/${id}/read`, "POST"),
    owner,
    (_, message) => {
      messages.push(message);
    }
  );
  expect(await read?.json()).toEqual({ v: 1, unread: 0 });
  expect(messages).toEqual([{ v: 1, type: "updates.changed", unread: 0 }]);
  expect(agentMayCall("/api/updates", "GET")).toBe(false);
  expect(agentMayCall(`/api/updates/${id}/read`, "POST")).toBe(false);
});
