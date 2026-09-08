import { beforeAll, describe, expect, it } from "bun:test";

import type { BrowserHandle } from "@froggy/browser";
import { SaleId, SessionId, userId } from "@froggy/domain";
import { Effect, Schema } from "effect";

import { agentDetail } from "./agent-invocations";
import { mintAgentToken } from "./agents";
import { ModelBudget } from "./budget";
import { loadEnvironment } from "./environment";
import { InteractionRegistry } from "./interactions";
import { createNotices } from "./notices";
import { createQuotes } from "./quotes";
import { ChatRunRegistry } from "./runs";
import { createServices } from "./services";
import type { Services } from "./services";
import { WorkspaceSession } from "./session";
import {
  handleTaskGet,
  handleTaskPost,
  handleWalletPay,
  TASK_PRICE_USD_MICROS,
} from "./tasks";
import type { TaskDeps } from "./tasks";
import { UnlockTokens } from "./unlock";
import { Workspaces } from "./workspaces";

const ALICE = userId("did:privy:tasks-test");
const TASKS_URL = "http://localhost:3000/api/tasks";

// Every integration on its placeholder, whatever the shell around the test
// holds: this test must never reach a live facilitator or gateway.
const PLACEHOLDERS = {
  ANTHROPIC_API_KEY: "sk-ant-REPLACE_ME",
  DATABASE_URL: "",
  GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
  HEDERA_ACCOUNT_ID: "0.0.0",
  HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
  OPENAI_COMPATIBLE_API_KEY: "",
  PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
  PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
  TELEGRAM_BOT_TOKEN: "REPLACE_ME_TELEGRAM_BOT_TOKEN",
};

const noop = (): void => {
  // These tests read state, not events.
};

const Challenge = Schema.Struct({
  accepts: Schema.Array(Schema.Struct({ network: Schema.String })),
});
const Paid = Schema.Struct({ header: Schema.String });
const WithTask = Schema.Struct({
  task: Schema.Struct({
    id: Schema.String,
    kind: Schema.String,
    priceUsdMicros: Schema.Finite,
    result: Schema.NullOr(Schema.Struct({ symbol: Schema.String })),
    saleId: Schema.NullOr(Schema.String),
    status: Schema.String,
  }),
});
const challengeOf = Schema.decodeUnknownSync(Challenge);
const paidOf = Schema.decodeUnknownSync(Paid);
const taskOf = Schema.decodeUnknownSync(WithTask);

let services: Services;
let deps: TaskDeps;
let session: WorkspaceSession;

/**
 * The handlers under test call only `touch` on the registry, and the real
 * class needs a browser factory this suite has no use for.
 */
const registryThatOnlyTouches = (): Workspaces => {
  // SAFETY: an instance with the class's prototype and one method the tests
  // reach; any other member would be a test bug, not a silent pass.
  const registry = Object.create(Workspaces.prototype) as Workspaces;
  Object.defineProperty(registry, "touch", { value: noop });
  return registry;
};

/** What the tests post: the wire shape of a task request. */
interface TaskRequestBody {
  readonly idempotencyKey?: string;
  readonly instruction?: string;
  readonly kind: string;
  readonly symbol?: string;
}

const workspace = () => ({
  // SAFETY: a brief task never touches the browser, and this suite starts no
  // browse; the handle is present only to satisfy the workspace's shape.
  browser: {} as BrowserHandle,
  session,
  userId: ALICE,
});

beforeAll(async () => {
  for (const [key, value] of Object.entries(PLACEHOLDERS)) {
    process.env[key] = value;
  }
  const environment = await Effect.runPromise(loadEnvironment());
  services = createServices({ environment });
  const { quote } = createQuotes(services.rates);
  session = new WorkspaceSession(
    SessionId.generate(),
    ALICE,
    {
      ledger: services.ledger,
      modes: environment.modes,
      onPolicyDecision: noop,
      balances: {
        hbar: async () => await Promise.resolve(null),
        usdc: async () => await Promise.resolve(null),
      },
      networks: { evm: "eip155:84532", hedera: "hedera:testnet" },
      onReceipt: noop,
      pocket: {
        networks: ["hedera:testnet"],
        startingUsdMicrosFor: () => 2_000_000,
      },
      quote,
      store: services.store,
    },
    { hosts: ["localhost:3000"], payeeIds: [services.oracle.payTo] }
  );
  await session.hydrate();
  deps = {
    budget: new ModelBudget({ exempt: null, runsPerDay: 5, stepsPerDay: 50 }),
    interactions: new InteractionRegistry({
      onRequest: noop,
      onResolved: noop,
    }),
    notices: createNotices({
      notify: async () => await Promise.resolve(false),
      publishApp: noop,
    }),
    oracleUrl: "http://localhost:3000/oracle/snapshot",
    runs: new ChatRunRegistry(),
    services,
    tasksUrl: TASKS_URL,
    unlocks: new UnlockTokens(),
    workspaces: registryThatOnlyTouches(),
  };
});

const post = (
  body: TaskRequestBody,
  headers: Record<string, string> = {}
): Request =>
  new Request(TASKS_URL, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });

const settle = async (): Promise<void> => {
  // The task runs detached; the stub graph answers within a tick or two.
  await Bun.sleep(50);
};

describe("a paid brief, from 402 to result", () => {
  it("quotes the task in HBAR, signs a payment under the mandate, records the sale, runs and answers by id", async () => {
    const { token } = await mintAgentToken(
      services.store,
      ALICE,
      "Task agent",
      Date.now()
    );
    const caller = {
      agentTokenId: token.id,
      grantId: null,
      scopes: null,
      userId: ALICE,
    };
    const quoted = await handleTaskPost(
      deps,
      post({ kind: "brief", symbol: "USDC" }),
      workspace(),
      caller
    );
    expect(quoted.status).toBe(402);
    const raw: unknown = await quoted.json();
    const challenge = challengeOf(raw);
    expect(challenge.accepts[0]?.network).toBe("hedera:testnet");

    // The caller holds no key: the person's Froggy wallet signs, under the
    // mandate, and hands back only the header.
    const before = session.pocket ?? 0;
    const signed = await handleWalletPay(
      deps,
      new Request("http://localhost:3000/api/wallet/pay", {
        body: JSON.stringify({ challenge: raw }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      workspace(),
      caller
    );
    expect(signed.status).toBe(200);
    const { header } = paidOf(await signed.json());
    expect(session.pocket ?? 0).toBeLessThan(before);

    const paid = await handleTaskPost(
      deps,
      post({ kind: "brief", symbol: "USDC" }, { "x-payment": header }),
      workspace(),
      caller
    );
    expect(paid.status).toBe(202);
    const created = taskOf(await paid.json()).task;
    expect(created.id).toMatch(/^tsk_/u);
    expect(created.status).toBe("paid");
    expect(created.priceUsdMicros).toBe(TASK_PRICE_USD_MICROS.brief);
    expect(created.saleId).toMatch(/^sal_/u);

    await settle();
    const fetched = await handleTaskGet(deps, workspace(), ALICE, created.id);
    const done = taskOf(await fetched.json()).task;
    expect(done.status).toBe("done");
    expect(done.result?.symbol).toBe("USDC");
    const saleId = created.saleId ?? "";
    expect(SaleId.is(saleId)).toBe(true);
    if (SaleId.is(saleId)) {
      const sale = await services.store.sales.byId(saleId);
      expect(sale?.status).toBe("delivered");
    }

    // The same proof again is the same task, not a second bill.
    const replayed = await handleTaskPost(
      deps,
      post({ kind: "brief", symbol: "USDC" }, { "x-payment": header }),
      workspace(),
      caller
    );
    expect(replayed.status).toBe(200);
    expect(taskOf(await replayed.json()).task.id).toBe(created.id);
    const history = await agentDetail(services.store, ALICE, token.id);
    expect(history?.invocations).toHaveLength(4);
    expect(history?.invocations.map((row) => row.outcome)).toEqual([
      "replayed",
      "accepted",
      "signed",
      "payment_required",
    ]);
    expect(history?.invocations[0]?.usdMicros).toBeNull();
    expect(history?.invocations[1]?.usdMicros).toBe(
      TASK_PRICE_USD_MICROS.brief
    );
    expect(history?.invocations[2]?.usdMicros).toBeGreaterThan(0);
    expect(JSON.stringify(history)).not.toContain(header);
  });

  it("returns the earlier task for a repeated idempotency key before asking for money", async () => {
    const caller = {
      agentTokenId: null,
      grantId: null,
      scopes: null,
      userId: ALICE,
    };
    const first = await handleTaskPost(
      deps,
      post({ idempotencyKey: "hermes-brief-1", kind: "brief", symbol: "USDC" }),
      workspace(),
      caller
    );
    // Unpaid, so a 402: no task exists yet for the key.
    expect(first.status).toBe(402);

    const challenge: unknown = await first.json();
    const signed = await handleWalletPay(
      deps,
      new Request("http://localhost:3000/api/wallet/pay", {
        body: JSON.stringify({ challenge }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      workspace(),
      caller
    );
    const { header } = paidOf(await signed.json());
    const paid = await handleTaskPost(
      deps,
      post(
        { idempotencyKey: "hermes-brief-1", kind: "brief", symbol: "USDC" },
        { "x-payment": header }
      ),
      workspace(),
      caller
    );
    expect(paid.status).toBe(202);
    const created = taskOf(await paid.json()).task;
    const again = await handleTaskPost(
      deps,
      post({ idempotencyKey: "hermes-brief-1", kind: "brief", symbol: "USDC" }),
      workspace(),
      caller
    );
    expect(again.status).toBe(200);
    expect(taskOf(await again.json()).task.id).toBe(created.id);
  });

  it("claims concurrent paid retries before settling and rejects changed input", async () => {
    const caller = {
      agentTokenId: null,
      grantId: null,
      scopes: null,
      userId: ALICE,
    };
    const body = {
      idempotencyKey: "concurrent-legacy-task",
      kind: "brief",
      symbol: "USDC",
    };
    const quoted = await handleTaskPost(deps, post(body), workspace(), caller);
    const challenge: unknown = await quoted.json();
    const signed = await handleWalletPay(
      deps,
      new Request("http://localhost:3000/api/wallet/pay", {
        method: "POST",
        body: JSON.stringify({ challenge }),
      }),
      workspace(),
      caller
    );
    const { header } = paidOf(await signed.json());
    let settlements = 0;
    const guarded = {
      ...deps,
      services: {
        ...services,
        oracle: {
          ...services.oracle,
          settle: async (
            payment: string,
            requirement: Parameters<Services["oracle"]["settle"]>[1]
          ) => {
            settlements += 1;
            await Bun.sleep(10);
            return await services.oracle.settle(payment, requirement);
          },
        },
      },
    };
    const replies = await Promise.all([
      handleTaskPost(
        guarded,
        post(body, { "x-payment": header }),
        workspace(),
        caller
      ),
      handleTaskPost(
        guarded,
        post(body, { "x-payment": header }),
        workspace(),
        caller
      ),
    ]);
    const tasks = await Promise.all(
      replies.map(async (response) => taskOf(await response.json()).task)
    );
    expect(new Set(tasks.map((task) => task.id)).size).toBe(1);
    expect(settlements).toBe(1);
    const conflict = await handleTaskPost(
      deps,
      post({ ...body, symbol: "ETH" }),
      workspace(),
      caller
    );
    expect(conflict.status).toBe(409);
  });
  it("refuses a malformed task and an unknown id", async () => {
    const caller = {
      agentTokenId: null,
      grantId: null,
      scopes: null,
      userId: ALICE,
    };
    const bad = await handleTaskPost(
      deps,
      post({ kind: "brief" }),
      workspace(),
      caller
    );
    expect(bad.status).toBe(400);
    const missing = await handleTaskGet(deps, workspace(), ALICE, "tsk_nope");
    expect(missing.status).toBe(404);
  });
});
