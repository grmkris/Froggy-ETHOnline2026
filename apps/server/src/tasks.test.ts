import { beforeEach, describe, expect, it } from "bun:test";

import type { BrowserHandle } from "@froggy/browser";
import {
  OAuthGrantId,
  OAuthClientId,
  TaskId,
  creditUnits,
  SessionId,
  userId,
} from "@froggy/domain";
import type { Task } from "@froggy/domain";
import { Effect, Schema } from "effect";

import { mintAgentToken } from "./agents";
import { handleBrowseQuote } from "./browse-quotes";
import { ModelBudget } from "./budget";
import { fundTestCredits } from "./credit-fixture";
import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { InteractionRegistry } from "./interactions";
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
  readonly v?: number;
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

beforeEach(async () => {
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
    browseExecutor: "legacy",
    modes: { ...loaded.modes, browser: "stub", model: "stub" },
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
  await fundTestCredits(services.store, ALICE, 10_000_000);
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
    body: JSON.stringify({ v: 2, ...body }),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });

const settle = async (): Promise<void> => {
  // The task runs detached; the stub graph answers within a tick or two.
  await Bun.sleep(50);
};

const caller = {
  agentTokenId: null,
  grantId: null,
  scopes: null,
  userId: ALICE,
};
const quoteBody = (key: string) => ({
  v: 2 as const,
  kind: "browse" as const,
  instruction: "Read a public page",
  budgetUsd: 1 as const,
  idempotencyKey: key,
});
const quoteView = (task: Task) => ({
  ...task,
  browse: null,
  approval: [],
  receipts: [],
});

describe("credit-funded task API", () => {
  it("funds once and completes multiple briefs without signatures or sales", async () => {
    let payments = 0;
    const testDeps = {
      ...deps,
      services: {
        ...services,
        rates: { ...services.rates, current: () => null },
        oracle: {
          ...services.oracle,
          settle: async () => {
            payments += 1;
            return await Promise.reject(new Error("must not settle"));
          },
        },
        hederaPayerFor: async () => {
          payments += 1;
          return await Promise.reject(new Error("must not sign"));
        },
      },
    };
    await Promise.all(
      ["USDC", "WETH"].map(async (symbol) => {
        const response = await handleTaskPost(
          testDeps,
          post({ kind: "brief", symbol, idempotencyKey: symbol }),
          workspace(),
          caller
        );
        expect(response.status).toBe(202);
        const { task } = taskOf(await response.json());
        await settle();
        const result = await handleTaskGet(
          testDeps,
          workspace(),
          caller,
          task.id
        );
        expect(taskOf(await result.json()).task.status).toBe("done");
        const saved = await services.store.tasks.byIdempotencyKey(
          ALICE,
          symbol
        );
        expect(saved?.chargeStatus).toBe("captured");
        expect(saved?.saleId).toBeNull();
      })
    );
    expect(payments).toBe(0);
    const checkedResult22 = await services.store.credits.summary(ALICE);
    expect(checkedResult22.spentUnits).toBe(
      creditUnits(2 * TASK_PRICE_USD_MICROS.brief)
    );
    expect(session.history).toHaveLength(0);
  });

  it("rejects v1 and task-signing requests before any credit or wallet change", async () => {
    const before = await services.store.credits.summary(ALICE);
    const old = await handleTaskPost(
      deps,
      post({ v: 1, kind: "brief", symbol: "USDC", idempotencyKey: "old" }),
      workspace(),
      caller
    );
    expect(old.status).toBe(426);
    const proof = await handleTaskPost(
      deps,
      post(
        { kind: "brief", symbol: "USDC", idempotencyKey: "proof" },
        { "payment-signature": "old-proof" }
      ),
      workspace(),
      caller
    );
    expect(proof.status).toBe(426);
    const checkedResult21 = await handleWalletPay(
      deps,
      new Request(TASKS_URL),
      workspace(),
      caller
    );
    expect(checkedResult21.status).toBe(410);
    expect(await services.store.credits.summary(ALICE)).toEqual(before);
    expect(await services.store.tasks.list(ALICE, 10)).toHaveLength(0);
  });

  it("claims concurrent retries once and refuses changed input", async () => {
    const body = { kind: "brief", symbol: "USDC", idempotencyKey: "same" };
    const responses = await Promise.all(
      [1, 2, 3].map(
        async () => await handleTaskPost(deps, post(body), workspace(), caller)
      )
    );
    const ids = await Promise.all(
      responses.map(async (response) => taskOf(await response.json()).task.id)
    );
    expect(new Set(ids).size).toBe(1);
    await settle();
    const checkedResult17 = await services.store.credits.summary(ALICE);
    expect(checkedResult17.spentUnits).toBe(
      creditUnits(TASK_PRICE_USD_MICROS.brief)
    );
    expect(
      handleTaskPost(
        deps,
        post({ ...body, symbol: "WETH" }),
        workspace(),
        caller
      )
    ).rejects.toThrow("idempotency key");
  });

  it("keeps tasks and idempotency replay private to the initiating connection", async () => {
    const checkedResult16 = await mintAgentToken(
      services.store,
      ALICE,
      "First",
      Date.now()
    );
    const first = checkedResult16.token;
    const checkedResult15 = await mintAgentToken(
      services.store,
      ALICE,
      "Second",
      Date.now()
    );
    const second = checkedResult15.token;
    const a = { ...caller, agentTokenId: first.id };
    const b = { ...caller, agentTokenId: second.id };
    const body = { kind: "brief", symbol: "USDC", idempotencyKey: "private" };
    const response = await handleTaskPost(deps, post(body), workspace(), a);
    const { id } = taskOf(await response.json()).task;
    const checkedResult13 = await handleTaskGet(deps, workspace(), b, id);
    expect(checkedResult13.status).toBe(404);
    const checkedResult12 = await handleTaskGet(deps, workspace(), caller, id);
    expect(checkedResult12.status).toBe(200);
    const checkedResult10 = await handleTaskList(deps, workspace(), b);
    expect(await checkedResult10.json()).toEqual({
      v: 1,
      tasks: [],
    });
    expect(handleTaskPost(deps, post(body), workspace(), b)).rejects.toThrow(
      "connection"
    );
    await settle();
  });

  it("returns structured insufficient-credit errors without a payment challenge", async () => {
    const noFunds = userId("did:privy:unfunded-task");
    const response = await handleTaskPost(
      deps,
      post({ kind: "brief", symbol: "USDC", idempotencyKey: "empty" }),
      { ...workspace(), userId: noFunds },
      { ...caller, userId: noFunds }
    );
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("insufficient_credits");
    expect(response.headers.has("payment-required")).toBe(false);
  });

  it("requires current brief scope before reserving", async () => {
    const id = OAuthGrantId.generate();
    await services.store.oauth.grants.create(ALICE, {
      id,
      clientId: OAuthClientId.generate(),
      clientName: "Browser only",
      createdAt: Date.now(),
      lastUsedAt: null,
      revokedAt: null,
      scopes: ["browse"],
    });
    const response = await handleTaskPost(
      deps,
      post({ kind: "brief", symbol: "USDC", idempotencyKey: "scope" }),
      workspace(),
      { ...caller, grantId: id, scopes: new Set(["browse" as const]) }
    );
    expect(response.status).toBe(403);
    expect(await services.store.tasks.list(ALICE, 10)).toHaveLength(0);
  });

  it("releases credits when a brief provider fails", async () => {
    const testDeps = {
      ...deps,
      services: {
        ...services,
        graph: {
          ...services.graph,
          lendingMarkets: async () =>
            await Promise.reject(new Error("Provider unavailable")),
        },
      },
    };
    const response = await handleTaskPost(
      testDeps,
      post({ kind: "brief", symbol: "USDC", idempotencyKey: "fails" }),
      workspace(),
      caller
    );
    expect(response.status).toBe(202);
    await settle();
    const saved = await services.store.tasks.byIdempotencyKey(ALICE, "fails");
    expect(saved?.status).toBe("failed");
    expect(saved?.chargeStatus).toBe("released");
    const checkedResult7 = await services.store.credits.summary(ALICE);
    expect(checkedResult7.availableUnits).toBe(creditUnits(10_000_000));
  });

  it("refuses malformed tasks and unknown ids", async () => {
    const checkedResult6 = await handleTaskPost(
      deps,
      post({ kind: "brief" }),
      workspace(),
      caller
    );
    expect(checkedResult6.status).toBe(400);
    const checkedResult5 = await handleTaskGet(
      deps,
      workspace(),
      caller,
      TaskId.generate()
    );
    expect(checkedResult5.status).toBe(404);
  });
});

describe("browser credit allowances", () => {
  it("starts directly with one reserved charge and immutable execution allowance", async () => {
    let executions = 0;
    const body = quoteBody("browse");
    const submit = async () =>
      await handleBrowseQuote(
        deps,
        post(body),
        workspace(),
        caller,
        body,
        () => {
          executions += 1;
        },
        quoteView
      );
    const responses = await Promise.all([submit(), submit(), submit()]);
    expect(responses.every((response) => response.status === 202)).toBe(true);
    const saved = await services.store.tasks.byIdempotencyKey(
      ALICE,
      body.idempotencyKey
    );
    expect(saved?.chargeStatus).toBe("reserved");
    expect(saved?.saleId).toBeNull();
    expect(saved?.input["quote"]).toMatchObject({
      budgetUsd: 1,
      priceUsdMicros: 1_000_000,
      modelAllowanceUsdMicros: 500_000,
      executionMs: 600_000,
    });
    expect(executions).toBe(1);
    const changed = { ...body, budgetUsd: 3 as const };
    const checkedResult4 = await handleBrowseQuote(
      deps,
      post(changed),
      workspace(),
      caller,
      changed,
      noop,
      quoteView
    );
    expect(checkedResult4.status).toBe(409);
    const checkedResult3 = await services.store.credits.summary(ALICE);
    expect(checkedResult3.reservedUnits).toBe(creditUnits(1_000_000));
  });

  it("rejects invalid budgets and concurrent different browser tasks", async () => {
    const checkedResult2 = await handleTaskPost(
      deps,
      post({ ...quoteBody("bad"), budgetUsd: 2 }),
      workspace(),
      caller
    );
    expect(checkedResult2.status).toBe(400);
    const body = quoteBody("one");
    await handleBrowseQuote(
      deps,
      post(body),
      workspace(),
      caller,
      body,
      noop,
      quoteView
    );
    const other = quoteBody("two");
    const checkedResult1 = await handleBrowseQuote(
      deps,
      post(other),
      workspace(),
      caller,
      other,
      noop,
      quoteView
    );
    expect(checkedResult1.status).toBe(409);
  });

  it("refuses to resume an exhausted allowance and returns its reservation", async () => {
    const body = quoteBody("exhausted");
    await handleBrowseQuote(
      deps,
      post(body),
      workspace(),
      caller,
      body,
      noop,
      quoteView
    );
    const task = await services.store.tasks.byIdempotencyKey(
      ALICE,
      body.idempotencyKey
    );
    if (task === null) {
      throw new Error("Expected the browser task");
    }
    await services.store.tasks.update(ALICE, task.id, {
      status: "paused",
      updatedAt: Date.now(),
      result: {
        progress: {
          spentUsdMicros: 500_000,
          steps: 2,
          activeMs: 1000,
          summary: "Partial result",
        },
      },
    });
    const registry = registryThatOnlyTouches();
    Object.defineProperty(registry, "hydrate", {
      value: async () => await Promise.resolve(workspace()),
    });
    await resumeBrowseTask({ ...deps, workspaces: registry }, ALICE, task.id);
    await settle();
    const stopped = await services.store.tasks.byId(ALICE, task.id);
    expect(stopped?.status).toBe("failed");
    expect(stopped?.error).toContain("allowance is exhausted");
    expect(stopped?.chargeStatus).toBe("released");
  });
});
