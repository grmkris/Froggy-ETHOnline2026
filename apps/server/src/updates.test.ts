import { expect, test } from "bun:test";

import { NoticeId, userId } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";

import { createNotices } from "./notices";
import { createUpdates, noticeUpdate } from "./updates";
import {
  invokeWorkspaceTool,
  workspaceToolDefinitions,
} from "./workspace-tools";

test("non-email notices are durably filed without Telegram and cap their text", async () => {
  const store = memoryStore();
  const owner = userId("did:privy:updates-notice");
  const updates = createUpdates({ store });
  const notices = createNotices({
    updates,
    notify: async () => await Promise.resolve(false),
    publishApp: () => {},
    now: () => 50,
  });
  await notices.post(owner, { source: "notify", text: "A finished check" });
  expect(await store.updates.unread(owner)).toBe(1);
  await notices.post(owner, {
    source: "email",
    text: "Mail already has its own feed",
  });
  expect(await store.updates.unread(owner)).toBe(1);
  const long = noticeUpdate({
    id: NoticeId.generate(),
    at: 50,
    runId: null,
    scheduleId: null,
    source: "notify",
    text: "x".repeat(2000),
    telegram: false,
  });
  expect(long.body).toHaveLength(1000);
});

test("MCP Updates is a read-only scoped listing and leaves records unread", async () => {
  const store = memoryStore();
  const owner = userId("did:privy:updates-mcp");
  const updates = createUpdates({ store });
  await updates.file(
    owner,
    noticeUpdate({
      id: NoticeId.generate(),
      at: 20,
      runId: null,
      scheduleId: null,
      source: "notify",
      text: "A result",
      telegram: false,
    })
  );
  expect(
    workspaceToolDefinitions.find((tool) => tool.name === "updates_list")
  ).toMatchObject({ scope: "watchlist:read", writes: false });
  const page = await invokeWorkspaceTool(
    store,
    owner,
    null,
    "froggy_updates_list",
    {}
  );
  expect(page).toMatchObject({ v: 1, unread: 1 });
  expect(await store.updates.unread(owner)).toBe(1);
});
