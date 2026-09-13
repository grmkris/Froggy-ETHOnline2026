import { beforeAll, beforeEach, describe, expect, it } from "bun:test";

import type { BrowserHandle } from "@froggy/browser";
import {
  OAuthGrantId,
  MonitorCheckId,
  OAUTH_SCOPES,
  SaleId,
  defaultAllowance,
  SessionId,
  usdMicros,
  userId,
} from "@froggy/domain";
import type { Task } from "@froggy/domain";
import { decodePaymentChallenge } from "@froggy/payments";
import { BrowseChallenge, BrowseQuoteResponse } from "@froggy/protocol";
import { Effect, Schema } from "effect";

import { agentDetail } from "./agent-invocations";
import { mintAgentToken } from "./agents";
import { handleBrowseQuote } from "./browse-quotes";
import { ModelBudget } from "./budget";
import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { InteractionRegistry } from "./interactions";
import {
  changeMonitor,
  claimMonitor,
  configureMonitor,
  setMonitoringBudget,
} from "./monitoring";
import { createNotices } from "./notices";
import { createQuotes } from "./quotes";
import { ChatRunRegistry } from "./runs";
import { createServices } from "./services";
import type { Services } from "./services";
import { WorkspaceSession } from "./session";
import {
  handleTaskGet,
  handleTaskList,
  handleTaskPost,
  resumeBrowseTask,
  handleWalletPay,
  TASK_PRICE_USD_MICROS,
} from "./tasks";
import type { TaskDeps } from "./tasks";
import { UnlockTokens } from "./unlock";
import { saveWatchlistItem } from "./watchlist-routes";
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
  readonly budgetUsd?: number;
  readonly kind: string;
  readonly quoteTaskId?: string;
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
  const loaded = await Effect.runPromise(loadEnvironment());
  /**
   * Every condition a browse quote is refused on, named here rather than
   * inherited.
   *
   * Nothing reaches a provider — the browser handle is a stand-in object — but
   * a quote is refused outright without a browser key, and refused again if the
   * model is live while its accounting rates are zero. Both were being answered
   * by whatever happened to be in the ambient environment, which is why these
   * five passed under `bun run test` and failed from the repository root: Bun
   * loads `.env` from the working directory, the root has one with a real
   * model key and no browser rates, and `apps/server` does not. The quote then
   * refused with 503 instead of the 402 these assert, looking exactly like a
   * regression somebody had just introduced.
   *
   * Pinning the rates settles it whichever way the model reads, because the
   * rate check only bites when they are zero.
   */
  const environment: Environment = {
    ...loaded,
    browserUseApiKey: "bu_task_fixture_key",
    browserModelInputRate: 2,
    browserModelOutputRate: 6,
    modes: { ...loaded.modes, browser: "live" },
  };
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
    const fetched = await handleTaskGet(deps, workspace(), caller, created.id);
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
    expect(history?.agent.scopes).toEqual(
      OAUTH_SCOPES.filter((scope) => !scope.startsWith("email:"))
    );
    const stranger = await mintAgentToken(
      services.store,
      ALICE,
      "Other",
      Date.now()
    );
    const peek = await handleTaskGet(
      deps,
      workspace(),
      {
        agentTokenId: stranger.token.id,
        grantId: null,
        scopes: null,
        userId: ALICE,
      },
      created.id
    );
    expect(peek.status).toBe(404);
    const listed = await handleTaskList(deps, workspace(), {
      agentTokenId: stranger.token.id,
      grantId: null,
      scopes: null,
      userId: ALICE,
    });
    const body: unknown = await listed.json();
    expect(JSON.stringify(body)).not.toContain(created.id);
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
    const missing = await handleTaskGet(deps, workspace(), caller, "tsk_nope");
    expect(missing.status).toBe(404);
  });
});

const quoteBody = (key: string) => ({
  kind: "browse" as const,
  instruction: "Read the fixture page",
  budgetUsd: 1 as const,
  idempotencyKey: key,
});
const quoteView = (task: Task) => ({
  ...task,
  browse: null,
  approval: [],
  receipts: [],
});

describe("bounded browser quotes", () => {
  beforeEach(async () => {
    // Each scenario owns a separate purchase; unresolved earlier fixtures must not block it.
    const previous = await services.store.tasks.list(ALICE, 100);
    await Promise.all(
      previous
        .filter((task) => task.kind === "browse")
        .map(async (task) => {
          await services.store.tasks.update(ALICE, task.id, {
            status: "failed",
            updatedAt: Date.now(),
            error: "Fixture cleanup",
          });
        })
    );
  });
  const caller = {
    agentTokenId: null,
    grantId: null,
    scopes: null,
    userId: ALICE,
  };

  it("refuses email browsing before quoting when the connection has no email permission", async () => {
    const { token } = await mintAgentToken(
      services.store,
      ALICE,
      "Email permission fixture",
      Date.now()
    );
    const key = "email-browse-without-permission";
    const response = await handleTaskPost(
      deps,
      post({
        ...quoteBody(key),
        instruction:
          "Read my email confirmation code to finish the requested signup.",
      }),
      workspace(),
      { ...caller, agentTokenId: token.id }
    );
    expect(response.status).toBe(403);
    const result = Schema.decodeUnknownSync(
      Schema.Struct({ error: Schema.String })
    )(await response.json());
    expect(result.error).toContain("email:read");
    expect(await services.store.tasks.byIdempotencyKey(ALICE, key)).toBeNull();
  });

  it("requires an active mailbox before quoting a person's email task", async () => {
    const key = "email-browse-without-mailbox";
    const response = await handleTaskPost(
      deps,
      post({
        ...quoteBody(key),
        instruction:
          "Use my email confirmation code to finish the requested signup.",
      }),
      workspace(),
      caller
    );
    expect(response.status).toBe(409);
    const result = Schema.decodeUnknownSync(
      Schema.Struct({ error: Schema.String })
    )(await response.json());
    expect(result.error).toContain("Configure your email");
    expect(await services.store.tasks.byIdempotencyKey(ALICE, key)).toBeNull();
  });

  it("rejects malformed budgets instead of selling a legacy browse", async () => {
    const response = await handleTaskPost(
      deps,
      post({ ...quoteBody("bad-budget"), budgetUsd: 2 }),
      workspace(),
      caller
    );
    expect(response.status).toBe(400);
    expect(
      await services.store.tasks.byIdempotencyKey(ALICE, "bad-budget")
    ).toBeNull();
  });

  it("keeps unattended and internally identified monitors on Froggy's tool-enabled executor", async () => {
    const servicesWithHosted = {
      ...services,
      environment: {
        ...services.environment,
        browseExecutor: "hosted" as const,
      },
    };
    const checks: readonly {
      key: string;
      deps: TaskDeps;
      executor: "legacy" | "hosted";
    }[] = [
      {
        key: "executor-unattended",
        deps: { ...deps, services: servicesWithHosted, unattended: true },
        executor: "legacy",
      },
      {
        key: "executor-monitor-id",
        deps: {
          ...deps,
          services: servicesWithHosted,
          monitorCheckId: MonitorCheckId.generate(),
        },
        executor: "legacy",
      },
      {
        key: "executor-normal",
        deps: { ...deps, services: servicesWithHosted },
        executor: "hosted",
      },
    ];
    await Promise.all(
      checks.map(async (check) => {
        const response = await handleTaskPost(
          check.deps,
          post(quoteBody(check.key)),
          workspace(),
          caller
        );
        expect(response.status).toBe(402);
        const saved = await services.store.tasks.byIdempotencyKey(
          ALICE,
          check.key
        );
        expect(saved?.input["executor"]).toBe(check.executor);
        if (check.deps.monitorCheckId !== undefined) {
          expect(saved?.input["monitorCheckId"]).toBe(
            check.deps.monitorCheckId
          );
        }
      })
    );
  });

  it("does not sign or hold wallet funds when a monitor pauses during payment setup", async () => {
    const now = Date.now();
    const item = await saveWatchlistItem(services.store, ALICE, {
      title: "Pause race fixture",
      notes: "Exact product",
      source: { _tag: "product", url: "https://example.com/product" },
    });
    await setMonitoringBudget(services.store, ALICE, 2_000_000, "UTC");
    const monitor = await configureMonitor(
      services.store,
      ALICE,
      {
        itemId: item.id,
        cadence: "daily",
        timezone: "UTC",
        context: "Exact product",
        condition: { _tag: "price_below", amount: 50, currency: "USD" },
      },
      null,
      now
    );
    const check = await claimMonitor(services.store, ALICE, now);
    if (check === null) {
      throw new Error("Expected a reserved monitor check");
    }
    session.applyAllowance({
      allowance: {
        ...defaultAllowance(now),
        askOverUsdMicros: usdMicros(2_000_000),
      },
      policyId: "policy-fixture-monitor-pause",
    });
    await session.creditPocket(2_000_000);
    let signatures = 0;
    const guarded: TaskDeps = {
      ...deps,
      unattended: true,
      monitorCheckId: check.id,
      services: {
        ...services,
        hederaPayerFor: async (input) => {
          const payer = await services.hederaPayerFor(input);
          await changeMonitor(services.store, ALICE, monitor.id, "pause", now);
          return {
            ...payer,
            pay: async (challenge) => {
              signatures += 1;
              return await payer.pay(challenge);
            },
          };
        },
      },
    };
    const quoteResponse = await handleTaskPost(
      guarded,
      post(quoteBody("monitor-pause-before-signing")),
      workspace(),
      caller
    );
    expect(quoteResponse.status).toBe(402);
    const raw: unknown = await quoteResponse.json();
    const { quote } = Schema.decodeUnknownSync(BrowseQuoteResponse)(raw);
    const challenge = Schema.decodeUnknownSync(BrowseChallenge)(raw);
    const { pocket } = session;
    const paid = await handleWalletPay(
      guarded,
      new Request("http://localhost:3000/api/wallet/pay", {
        method: "POST",
        body: JSON.stringify({ challenge, quoteTaskId: quote.taskId }),
      }),
      workspace(),
      caller
    );
    expect(paid.status).toBe(403);
    const result = Schema.decodeUnknownSync(
      Schema.Struct({ error: Schema.String })
    )(await paid.json());
    expect(result.error).toContain("paused or changed");
    expect(signatures).toBe(0);
    expect(session.pocket).toBe(pocket);
    const task = await services.store.tasks.byId(ALICE, quote.taskId);
    expect(task?.result).toBeNull();
  });

  it("freezes the quote and refuses expired payment without settlement", async () => {
    const body = quoteBody("expiring-browser-quote");
    const first = await handleTaskPost(deps, post(body), workspace(), caller);
    expect(first.status).toBe(402);
    const initial = Schema.decodeUnknownSync(BrowseQuoteResponse)(
      await first.json()
    );
    const replay = await handleTaskPost(deps, post(body), workspace(), caller);
    expect(
      Schema.decodeUnknownSync(BrowseQuoteResponse)(await replay.json())
    ).toEqual(initial);
    // A payment that arrives after the quote lapsed is refused, never
    // re-priced under it.
    const expired = await handleTaskPost(
      { ...deps, now: () => initial.quote.expiresAt },
      post(
        { ...body, quoteTaskId: initial.quote.taskId },
        { "x-payment": "late-fixture-proof" }
      ),
      workspace(),
      caller
    );
    expect(expired.status).toBe(410);
    const task = await services.store.tasks.byId(ALICE, initial.quote.taskId);
    expect(task?.status).toBe("quoted");
    expect(task?.saleId).toBeNull();
  });

  it("re-prices an unpaid quote when the card asks for another budget", async () => {
    const body = quoteBody("requote-another-budget");
    const first = await handleTaskPost(deps, post(body), workspace(), caller);
    expect(first.status).toBe(402);
    const initial = Schema.decodeUnknownSync(BrowseQuoteResponse)(
      await first.json()
    );
    const second = await handleTaskPost(
      deps,
      post({ ...body, budgetUsd: 3 }),
      workspace(),
      caller
    );
    expect(second.status).toBe(402);
    const repriced = Schema.decodeUnknownSync(BrowseQuoteResponse)(
      await second.json()
    );
    // Same card, same task: only the numbers moved.
    expect(repriced.quote.taskId).toBe(initial.quote.taskId);
    expect(repriced.quote.budgetUsd).toBe(3);
    expect(repriced.quote.priceUsdMicros).toBe(3_000_000);
    expect(repriced.quote.executionMs).toBe(20 * 60_000);
    expect(repriced.accepts[0]?.amount).not.toBe(initial.accepts[0]?.amount);
    const stored = await services.store.tasks.byId(ALICE, initial.quote.taskId);
    expect(stored?.priceUsdMicros).toBe(usdMicros(3_000_000));
    // Paying names the new budget; the old one no longer matches.
    const stale = await handleTaskPost(
      deps,
      post(
        { ...body, quoteTaskId: initial.quote.taskId },
        { "x-payment": "stale-budget-proof" }
      ),
      workspace(),
      caller
    );
    expect(stale.status).toBe(409);
  });

  it("re-prices an expired unpaid quote instead of leaving the card stuck", async () => {
    const body = quoteBody("requote-after-expiry");
    const first = await handleTaskPost(deps, post(body), workspace(), caller);
    const initial = Schema.decodeUnknownSync(BrowseQuoteResponse)(
      await first.json()
    );
    const later = initial.quote.expiresAt + 1;
    const again = await handleTaskPost(
      { ...deps, now: () => later },
      post(body),
      workspace(),
      caller
    );
    expect(again.status).toBe(402);
    const fresh = Schema.decodeUnknownSync(BrowseQuoteResponse)(
      await again.json()
    );
    expect(fresh.quote.taskId).toBe(initial.quote.taskId);
    expect(fresh.quote.budgetUsd).toBe(1);
    expect(fresh.quote.expiresAt).toBeGreaterThan(later);
  });

  it("never re-prices a quote that already has a signed payment", async () => {
    const body = quoteBody("requote-after-signing");
    const quoted = await handleTaskPost(deps, post(body), workspace(), caller);
    const { quote } = Schema.decodeUnknownSync(BrowseQuoteResponse)(
      await quoted.json()
    );
    // What `/api/wallet/pay` leaves behind once a header is signed, without
    // spending the shared fixture pocket to get there.
    await services.store.tasks.update(ALICE, quote.taskId, {
      result: { paymentProofHash: "signed-fixture-hash" },
      updatedAt: Date.now(),
    });
    const changed = await handleTaskPost(
      deps,
      post({ ...body, budgetUsd: 5 }),
      workspace(),
      caller
    );
    expect(changed.status).toBe(409);
    const stored = await services.store.tasks.byId(ALICE, quote.taskId);
    expect(stored?.priceUsdMicros).toBe(usdMicros(1_000_000));
  });

  it("accepts the browser card's decoded challenge and never signs the quote twice", async () => {
    const body = quoteBody("quote-wallet-sign-once");
    const quoted = await handleTaskPost(deps, post(body), workspace(), caller);
    const raw: unknown = await quoted.json();
    const { quote } = Schema.decodeUnknownSync(BrowseQuoteResponse)(raw);
    const challenge = Schema.decodeUnknownSync(BrowseChallenge)(raw);
    const pay = () =>
      new Request("http://localhost:3000/api/wallet/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challenge, quoteTaskId: quote.taskId }),
      });
    const first = await handleWalletPay(deps, pay(), workspace(), caller);
    expect(first.status).toBe(200);
    const after = session.pocket;
    const duplicate = await handleWalletPay(deps, pay(), workspace(), caller);
    expect(duplicate.status).toBe(402);
    expect(session.pocket).toBe(after);
  });

  it("keeps an ambiguous settlement retrievable without trying the provider again", async () => {
    const body = quoteBody("uncertain-browser-settlement");
    let settlements = 0;
    let executions = 0;
    const uncertainDeps: TaskDeps = {
      ...deps,
      services: {
        ...services,
        oracle: {
          ...services.oracle,
          settle: async () => {
            settlements += 1;
            await Promise.resolve();
            throw new Error("Fixture transport ended after dispatch");
          },
        },
      },
    };
    const executeQuote = (): void => {
      executions += 1;
    };
    const first = await handleBrowseQuote(
      uncertainDeps,
      post(body),
      workspace(),
      caller,
      body,
      executeQuote,
      quoteView
    );
    const quoted = Schema.decodeUnknownSync(BrowseQuoteResponse)(
      await first.json()
    );
    const paying = { ...body, quoteTaskId: quoted.quote.taskId };
    const paid = await handleBrowseQuote(
      uncertainDeps,
      post(paying, { "x-payment": "uncertain-fixture-proof" }),
      workspace(),
      caller,
      paying,
      executeQuote,
      quoteView
    );
    expect(paid.status).toBe(502);
    const uncertain = await services.store.tasks.byId(
      ALICE,
      quoted.quote.taskId
    );
    expect(uncertain?.status).toBe("uncertain");
    const replay = await handleBrowseQuote(
      uncertainDeps,
      post(paying, { "x-payment": "uncertain-fixture-proof" }),
      workspace(),
      caller,
      paying,
      executeQuote,
      quoteView
    );
    expect(replay.status).toBe(202);
    expect(settlements).toBe(1);
    expect(executions).toBe(0);
    // Release the shared fixture's active slot after verifying its uncertain state.
    await services.store.tasks.update(ALICE, quoted.quote.taskId, {
      status: "failed",
      updatedAt: Date.now(),
    });
  });

  it("claims one settlement and one execution for simultaneous proof replays", async () => {
    const body = quoteBody("concurrent-browser-proof");
    let executions = 0;
    const executeQuote = (): void => {
      executions += 1;
    };
    const first = await handleBrowseQuote(
      deps,
      post(body),
      workspace(),
      caller,
      body,
      executeQuote,
      quoteView
    );
    expect(first.status).toBe(402);
    const quoted = Schema.decodeUnknownSync(BrowseQuoteResponse)(
      await first.json()
    );
    const challenge = decodePaymentChallenge(quoted);
    if (challenge._tag === "Failure") {
      throw new Error("Fixture challenge did not decode");
    }
    const signed = await services.payer.pay(challenge.success);
    if (signed.header === null) {
      throw new Error("Fixture did not sign");
    }
    const paying = { ...body, quoteTaskId: quoted.quote.taskId };
    const responses = await Promise.all(
      Array.from(
        { length: 4 },
        async () =>
          await handleBrowseQuote(
            deps,
            post(paying, { "x-payment": signed.header ?? "" }),
            workspace(),
            caller,
            paying,
            executeQuote,
            quoteView
          )
      )
    );
    expect(responses.every((response) => response.status === 202)).toBe(true);
    expect(executions).toBe(1);
    const task = await services.store.tasks.byId(ALICE, quoted.quote.taskId);
    expect(task?.status).toBe("paid");
    expect(task?.saleId).not.toBeNull();
    const repeated = await handleBrowseQuote(
      deps,
      post(paying, { "x-payment": signed.header }),
      workspace(),
      caller,
      paying,
      executeQuote,
      quoteView
    );
    expect(repeated.status).toBe(202);
    expect(executions).toBe(1);
    await services.store.tasks.update(ALICE, quoted.quote.taskId, {
      status: "done",
      updatedAt: Date.now(),
    });
  });

  it("only signs one of two simultaneous browser purchases and preserves an ambiguous signing reservation", async () => {
    await session.creditPocket(2_000_000);
    const one = quoteBody("parallel-one");
    const two = quoteBody("parallel-two");
    const first = await handleBrowseQuote(
      deps,
      post(one),
      workspace(),
      caller,
      one,
      () => {},
      quoteView
    );
    const second = await handleBrowseQuote(
      deps,
      post(two),
      workspace(),
      caller,
      two,
      () => {},
      quoteView
    );
    const a = Schema.decodeUnknownSync(BrowseQuoteResponse)(await first.json());
    const b = Schema.decodeUnknownSync(BrowseQuoteResponse)(
      await second.json()
    );
    const sign = async (raw: typeof BrowseQuoteResponse.Type) => {
      const { quote } = raw;
      const challenge = Schema.decodeUnknownSync(BrowseChallenge)(raw);
      return await handleWalletPay(
        deps,
        new Request("http://localhost:3000/api/wallet/pay", {
          method: "POST",
          body: JSON.stringify({ challenge, quoteTaskId: quote.taskId }),
        }),
        workspace(),
        caller
      );
    };
    const replies = await Promise.all([sign(a), sign(b)]);
    expect(
      replies
        .map((reply) => reply.status)
        .toSorted((left, right) => left - right)
    ).toEqual([200, 409]);
    const active = await services.store.tasks.activeBrowses();
    const own = active.filter((row) => row.userId === ALICE);
    expect(own).toHaveLength(1);
    const task = own[0]?.task;
    if (task === undefined) {
      throw new Error("Missing reserved quote");
    }
    await services.store.tasks.update(ALICE, task.id, {
      result: { paymentSigning: true },
      updatedAt: Date.now(),
    });
    const retry = await sign(a);
    expect(retry.status).toBe(409);
  });

  it("refuses to resume an exhausted allowance without buying or signing again", async () => {
    const body = quoteBody("exhausted-resume-fixture");
    const first = await handleBrowseQuote(
      deps,
      post(body),
      workspace(),
      caller,
      body,
      noop,
      quoteView
    );
    const quoted = Schema.decodeUnknownSync(BrowseQuoteResponse)(
      await first.json()
    );
    const challenge = decodePaymentChallenge(quoted);
    if (challenge._tag === "Failure") {
      throw new Error("Fixture challenge did not decode");
    }
    const signed = await services.payer.pay(challenge.success);
    if (signed.header === null) {
      throw new Error("Fixture did not sign");
    }
    const paying = { ...body, quoteTaskId: quoted.quote.taskId };
    const paid = await handleBrowseQuote(
      deps,
      post(paying, { "x-payment": signed.header }),
      workspace(),
      caller,
      paying,
      noop,
      quoteView
    );
    expect(paid.status).toBe(202);
    const task = await services.store.tasks.byId(ALICE, quoted.quote.taskId);
    if (task === null) {
      throw new Error("Expected the purchased fixture task");
    }
    await services.store.tasks.update(ALICE, task.id, {
      status: "paused",
      updatedAt: Date.now(),
      result: {
        progress: {
          spentUsdMicros: 500_000,
          steps: 2,
          activeMs: 1000,
          summary: "Partial fixture result",
        },
      },
    });
    const registry = registryThatOnlyTouches();
    Object.defineProperty(registry, "hydrate", {
      value: async () => await Promise.resolve(workspace()),
    });
    // Resume takes a person, not a task: it picks the newest of their resumable
    // browse tasks. Every test in this file shares one person and one store, so
    // an earlier test's task left `paid` is also a candidate — and which of the
    // two is "newest" comes down to whether they landed in the same millisecond,
    // which is a property of the machine rather than of the code. Retiring the
    // others first makes this test assert what its name says: that *this*
    // exhausted task fails rather than sitting resumable.
    const others = await services.store.tasks.list(ALICE, 100);
    await Promise.all(
      others
        .filter((other) => other.id !== task.id && other.kind === "browse")
        .map(async (other) => {
          await services.store.tasks.update(ALICE, other.id, {
            status: "done",
            updatedAt: Date.now(),
          });
        })
    );
    const before = session.pocket;
    await resumeBrowseTask({ ...deps, workspaces: registry }, ALICE);
    await settle();
    const stopped = await services.store.tasks.byId(ALICE, task.id);
    expect(stopped?.status).toBe("failed");
    expect(stopped?.error).toContain("allowance is exhausted");
    expect(stopped?.saleId).toBe(task.saleId);
    expect(session.pocket).toBe(before);
  });
});

describe("paying a quote under the ask line", () => {
  const BOB = userId("did:privy:tasks-test-ask-line");
  /**
   * A second person with their own pocket and their own numbers, so what this
   * asserts does not depend on what the tests above left in Alice's.
   */
  const sessionFor = async (): Promise<WorkspaceSession> => {
    const fresh = new WorkspaceSession(
      SessionId.generate(),
      BOB,
      {
        ledger: services.ledger,
        modes: services.environment.modes,
        onPolicyDecision: noop,
        balances: {
          hbar: async () => await Promise.resolve(null),
          usdc: async () => await Promise.resolve(null),
        },
        networks: { evm: "eip155:84532", hedera: "hedera:testnet" },
        onReceipt: noop,
        pocket: {
          networks: ["hedera:testnet"],
          startingUsdMicrosFor: () => 5_000_000,
        },
        quote: createQuotes(services.rates).quote,
        store: services.store,
      },
      { hosts: ["localhost:3000"], payeeIds: [services.oracle.payTo] }
    );
    await fresh.hydrate();
    // The person's own numbers: a $1 quote is well over this ask line, so the
    // policy says `ask` whatever the HBAR rounding does to the last micro.
    fresh.applyAllowance({
      allowance: {
        ...defaultAllowance(Date.now()),
        askOverUsdMicros: usdMicros(500_000),
      },
      policyId: "policy-fixture-bob",
    });
    return fresh;
  };
  const payFor = async (
    who: WorkspaceSession,
    caller: Parameters<typeof handleWalletPay>[3],
    key: string
  ): Promise<Response> => {
    const place = {
      // SAFETY: nothing here browses; the handle only satisfies the shape.
      browser: {} as BrowserHandle,
      session: who,
      userId: BOB,
    };
    const quoted = await handleTaskPost(
      deps,
      post(quoteBody(key)),
      place,
      caller
    );
    expect(quoted.status).toBe(402);
    const raw: unknown = await quoted.json();
    const { quote } = Schema.decodeUnknownSync(BrowseQuoteResponse)(raw);
    const challenge = Schema.decodeUnknownSync(BrowseChallenge)(raw);
    return await handleWalletPay(
      deps,
      new Request("http://localhost:3000/api/wallet/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challenge, quoteTaskId: quote.taskId }),
      }),
      place,
      caller
    );
  };

  it("takes the person's own tap on Pay as the answer, and still refuses over the cap", async () => {
    const who = await sessionFor();
    const person = {
      agentTokenId: null,
      grantId: null,
      scopes: null,
      userId: BOB,
    };
    const signed = await payFor(who, person, "ask-line-person");
    expect(signed.status).toBe(200);
    const { receipt } = Schema.decodeUnknownSync(
      Schema.Struct({
        header: Schema.String,
        receipt: Schema.Struct({
          decision: Schema.Struct({ _tag: Schema.String }),
        }),
      })
    )(await signed.json());
    expect(receipt.decision._tag).toBe("allow");
    const signedQuotes = await services.store.tasks.activeBrowses();
    await Promise.all(
      signedQuotes
        .filter((row) => row.userId === BOB)
        .map(async (row) => {
          await services.store.tasks.update(BOB, row.task.id, {
            status: "done",
            updatedAt: Date.now(),
          });
        })
    );
    // The tap answers the question; it does not move the ceiling.
    const place = {
      // SAFETY: as above.
      browser: {} as BrowserHandle,
      session: who,
      userId: BOB,
    };
    const big = await handleTaskPost(
      deps,
      post({ ...quoteBody("ask-line-over-cap"), budgetUsd: 3 }),
      place,
      person
    );
    const raw: unknown = await big.json();
    const { quote } = Schema.decodeUnknownSync(BrowseQuoteResponse)(raw);
    const challenge = Schema.decodeUnknownSync(BrowseChallenge)(raw);
    const refused = await handleWalletPay(
      deps,
      new Request("http://localhost:3000/api/wallet/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challenge, quoteTaskId: quote.taskId }),
      }),
      place,
      person
    );
    expect(refused.status).toBe(403);
    expect(
      Schema.decodeUnknownSync(Schema.Struct({ error: Schema.String }))(
        await refused.json()
      ).error
    ).toContain("per-transaction cap");
  });

  it("does not take an agent's request as anybody's answer", async () => {
    const who = await sessionFor();
    const { token } = await mintAgentToken(
      services.store,
      BOB,
      "Ask-line agent",
      Date.now()
    );
    const agent = {
      agentTokenId: token.id,
      grantId: null,
      scopes: null,
      userId: BOB,
    };
    const refused = await payFor(who, agent, "ask-line-agent");
    expect(refused.status).toBe(403);
    expect(
      Schema.decodeUnknownSync(Schema.Struct({ error: Schema.String }))(
        await refused.json()
      ).error
    ).toContain("no one to ask");
  });
  it("does not treat an OAuth grant as human payment approval", async () => {
    const who = await sessionFor();
    const refused = await payFor(
      who,
      {
        agentTokenId: null,
        grantId: OAuthGrantId.generate(),
        scopes: new Set(["browse", "pay"]),
        userId: BOB,
      },
      "ask-line-oauth"
    );
    expect(refused.status).toBe(403);
    const result = Schema.decodeUnknownSync(
      Schema.Struct({ error: Schema.String })
    )(await refused.json());
    expect(result.error).toContain("no one to ask");
  });
});
