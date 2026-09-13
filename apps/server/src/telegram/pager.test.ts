import { afterEach, beforeAll, expect, spyOn, test } from "bun:test";

import { TelegramAdapter } from "@chat-adapter/telegram";
import { MessageId, NoticeId, userId } from "@froggy/domain";
import type { WalletAlert } from "@froggy/wallet";
import type { StateAdapter } from "chat";
import { ConfigProvider, Effect } from "effect";

import { ModelBudget } from "../budget";
import { loadEnvironment } from "../environment";
import type { Environment } from "../environment";
import { InteractionRegistry } from "../interactions";
import { ChatRunRegistry } from "../runs";
import { createServices } from "../services";
import { UnlockTokens } from "../unlock";
import type { Workspaces } from "../workspaces";
import { liveTelegramPager } from "./pager";
import type { LivePagerDeps } from "./pager";

let environment: Environment;
const cleanups: (() => Promise<void>)[] = [];
beforeAll(async () => {
  environment = await Effect.runPromise(
    loadEnvironment().pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({
          DATABASE_URL: "",
          HEDERA_ACCOUNT_ID: "0.0.0",
          HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
          PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
          PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
          GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
          PINAX_API_KEY: "REPLACE_ME_PINAX_KEY",
        })
      )
    )
  );
});
afterEach(async () => {
  await Promise.all(
    cleanups.splice(0).map(async (cleanup) => {
      await cleanup();
    })
  );
});

const unexpectedInput = (): void => {
  throw new Error("Outbound-only fixture received incoming work.");
};

const fixture = async (initializationFailure: Error | null = null) => {
  const services = createServices({ environment });
  const owner = userId(`did:stub:pager-${crypto.randomUUID()}`);
  const threadId = "telegram:12345";
  const order: string[] = [];
  let state: StateAdapter | null = null;
  let nextInitializationFailure = initializationFailure;
  const getState = (): StateAdapter => {
    if (state === null) {
      throw new Error("The SDK did not initialize its state adapter.");
    }
    return state;
  };
  const initialize = spyOn(
    TelegramAdapter.prototype,
    "initialize"
  ).mockImplementation(async (chat) => {
    state = chat.getState();
    await state.get("pager-regression");
    order.push("initialized");
    if (nextInitializationFailure !== null) {
      const failure = nextInitializationFailure;
      nextInitializationFailure = null;
      throw failure;
    }
  });
  const post = spyOn(
    TelegramAdapter.prototype,
    "postMessage"
  ).mockImplementation(async (destination) => {
    await getState().get("pager-regression");
    order.push("posted");
    return {
      id: "42",
      threadId: destination,
      raw: {
        message_id: 42,
        chat: { id: 12_345, type: "private" },
        date: 1,
        text: "Local pager fixture",
      },
    };
  });
  const deps: LivePagerDeps = {
    botToken: "12345:local-fixture-token",
    botUsername: "froggy_fixture_bot",
    webhookSecret: "local-fixture-secret",
    services,
    budget: new ModelBudget({ exempt: null, runsPerDay: 1, stepsPerDay: 1 }),
    interactions: new InteractionRegistry({
      onRequest: unexpectedInput,
      onResolved: unexpectedInput,
    }),
    notices: {
      post: async () => {
        await Promise.resolve();
        throw new Error("Outbound delivery must not start an agent notice.");
      },
    },
    oracleUrl: "http://localhost:3000/oracle",
    publishApp: unexpectedInput,
    runs: new ChatRunRegistry(),
    unlocks: new UnlockTokens(),
    get workspaces(): Workspaces {
      throw new Error("Outbound delivery must not hydrate a workspace.");
    },
  };
  const pager = liveTelegramPager(deps);
  cleanups.push(async () => {
    try {
      await pager.shutdown();
      await services.shutdown();
    } finally {
      initialize.mockRestore();
      post.mockRestore();
    }
  });
  await services.store.telegram.pair(owner, {
    since: 1,
    telegramUserId: "12345",
    threadId,
  });
  const id = NoticeId.generate();
  const alert: WalletAlert = {
    v: 1,
    id,
    owner,
    network: "eip155:8453",
    itemId: null,
    monitorId: null,
    revision: 1,
    key: `pager-fixture:${id}`,
    kind: "summary",
    text: "Local pager fixture",
    activityIds: [],
    state: "sending",
    createdAt: 1000,
    notBefore: 1000,
    attempts: 1,
    claimUntil: 2000,
    telegramMessageId: null,
  };
  const messages = async () =>
    await services.store.history.transaction(
      owner,
      async (tx) =>
        await tx.list({ kind: "message", source: "telegram", limit: 20 })
    );
  return {
    pager,
    services,
    owner,
    alert,
    threadId,
    initialize,
    post,
    order,
    getState,
    messages,
  };
};

test("the first outbound alert initializes SDK state and records both histories before stable-id replay", async () => {
  const f = await fixture();
  expect(f.initialize).not.toHaveBeenCalled();
  const delivered = { kind: "delivered", messageId: "42" } as const;
  expect(await f.pager.deliverWalletAlert(f.alert)).toEqual(delivered);
  expect(f.order).toEqual(["initialized", "posted"]);
  const stableId = MessageId.fromUuid(NoticeId.toUuid(f.alert.id));
  const receipt = await f.services.store.history.transaction(
    f.owner,
    async (tx) => await tx.get(stableId)
  );
  expect(receipt).toMatchObject({
    kind: "message",
    delivery: "delivered",
    clientId: "tg-42",
  });
  expect(await f.getState().getList(`msg-history:${f.threadId}`)).toMatchObject(
    [{ id: "42", text: f.alert.text }]
  );
  expect(await f.pager.deliverWalletAlert(f.alert)).toEqual(delivered);
  expect(f.post).toHaveBeenCalledTimes(1);
  expect(f.initialize).toHaveBeenCalledTimes(1);
  expect(await f.messages()).toHaveLength(1);
  await f.pager.shutdown();
  expect(f.getState().get("pager-regression")).rejects.toThrow("not connected");
});

test("failed cold-start initialization is unsent and the same pager can retry without a duplicate intent", async () => {
  const f = await fixture(new Error("Local initialization failure"));
  expect(await f.pager.deliverWalletAlert(f.alert)).toEqual({
    kind: "definitely_not_sent",
    retryAfterMs: 2000,
  });
  expect(f.initialize).toHaveBeenCalledTimes(1);
  expect(f.post).not.toHaveBeenCalled();
  expect(await f.messages()).toEqual([]);
  expect(await f.pager.deliverWalletAlert(f.alert)).toEqual({
    kind: "delivered",
    messageId: "42",
  });
  expect(f.initialize).toHaveBeenCalledTimes(2);
  expect(f.post).toHaveBeenCalledTimes(1);
  expect(await f.messages()).toMatchObject([
    { delivery: "delivered", clientId: "tg-42" },
  ]);
});

for (const method of ["notify", "report"] as const) {
  test(`${method} initializes the SDK before its first outbound delivery`, async () => {
    const f = await fixture();
    if (method === "notify") {
      expect(await f.pager.notify(f.owner, "Local pager fixture")).toBe(true);
    } else {
      await f.pager.deliver({
        userId: f.owner,
        at: 1000,
        outcome: "finished",
        receipts: [],
        reason: null,
        scheduleId: null,
        spentUsdMicros: 0,
        summary: "Local pager fixture",
        title: "Fixture report",
      });
    }
    expect(f.order).toEqual(["initialized", "posted"]);
    expect(await f.messages()).toMatchObject([
      { delivery: "delivered", clientId: "tg-42" },
    ]);
    expect(
      await f.getState().getList(`msg-history:${f.threadId}`)
    ).toHaveLength(1);
  });
}
