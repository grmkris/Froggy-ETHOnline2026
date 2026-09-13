import { describe, expect, test } from "bun:test";

import { StubCloudBrowser, HostedBrowserExpiredError } from "@froggy/browser";
import type {
  HostedAgentApi,
  HostedEvent,
  HostedRunInput,
  HostedRunStatus,
} from "@froggy/browser";
import {
  RunId,
  SaleId,
  TaskId,
  usdMicros,
  userId,
  ApprovalId,
  PurchaseId,
  AgentTokenId,
} from "@froggy/domain";
import type { Task, Purchase } from "@froggy/domain";
import type { BrowserState } from "@froggy/protocol";
import { ConfigProvider, Effect } from "effect";

import { handleBrowseTaskRoutes } from "./browse-task-routes";
import { ModelBudget } from "./budget";
import { loadEnvironment } from "./environment";
import { HostedBrowseJob } from "./hosted-browse";
import type { HostedBrowseState } from "./hosted-browse-state";
import {
  applyHostedEvent,
  hostedState,
  initialHostedState,
  publicBrowseTask,
} from "./hosted-browse-state";
import { InteractionRegistry } from "./interactions";
import { createNotices } from "./notices";
import { ChatRunRegistry } from "./runs";
import { createServices } from "./services";
import type { TaskDeps } from "./tasks";
import { UnlockTokens } from "./unlock";
import { Workspaces } from "./workspaces";

const PROFILE = "6f19ba70-e37c-4c63-913c-62bbc94f1740";
const BROWSER = "ad041f9b-4102-4909-b3b9-65114f43f73c";
const PROVIDER_RUN = "b2b8216c-4997-44c9-9651-cc1c925fd226";
const noop = (): void => {};

class BrowserFixture extends StubCloudBrowser {
  control: "agent" | "human" | "stopping" = "agent";
  attached = false;
  closed = false;
  expired = false;
  crashed = false;
  expiresAt: number | null = null;
  readonly calls: string[] = [];
  readonly hosted = {
    prepare: async (): Promise<string> => {
      this.calls.push("prepare");
      return await Promise.resolve(PROFILE);
    },
    attach: async (): Promise<void> => {
      this.calls.push("attach");
      if (this.expired) {
        throw new HostedBrowserExpiredError();
      }
      this.attached = true;
      await Promise.resolve();
    },
    control: async (control: "agent" | "human" | "stopping"): Promise<void> => {
      this.control = control;
      this.calls.push(control);
      await Promise.resolve();
    },
    stopUnexpected: async (id: string) => {
      this.calls.push(`stop:${id}`);
      await Promise.resolve();
    },
    detach: () => {
      this.calls.push("detach");
    },
    release: noop,
  };
  override state(): BrowserState {
    const state = super.state();
    return {
      ...state,
      status: this.crashed ? "crashed" : state.status,
      cloud: {
        control: this.control,
        viewerReady: this.attached,
        expiresAt: this.expiresAt,
        stubbed: true,
      },
    };
  }
  override close(): void {
    this.closed = true;
  }
}
interface ProviderFixture {
  calls: HostedRunInput[];
  status: HostedRunStatus;
  released: boolean;
  result: string;
  cost: string;
  ambiguous: boolean;
  cancelCalls: number;
  ids: string[];
  browserId: string;
}
const fixture = async () => {
  const owner = userId(`did:privy:hosted-${crypto.randomUUID()}`);
  const environment = await Effect.runPromise(
    loadEnvironment().pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({
          APP_ORIGIN: "http://localhost:3000",
          BROWSE_EXECUTOR: "hosted",
        })
      )
    )
  );
  const base = createServices({ environment });
  const browser = new BrowserFixture({});
  const provider: ProviderFixture = {
    calls: [],
    status: "completed",
    released: true,
    result: "Task result",
    cost: "0.010000",
    ambiguous: false,
    cancelCalls: 0,
    ids: [],
    browserId: BROWSER,
  };
  const api: HostedAgentApi = {
    stubbed: false,
    create: async (input) => {
      if (provider.calls.length > 0) {
        expect(browser.attached).toBe(true);
      }
      provider.calls.push(input);
      if (provider.ambiguous) {
        throw new Error("Connection dropped after POST");
      }
      const id = crypto.randomUUID();
      provider.ids.push(id);
      return await Promise.resolve({
        id,
        sessionId: PROFILE,
        workspaceId: PROFILE,
        status: provider.status,
      });
    },
    status: async () => await Promise.resolve(provider.status),
    events: async (id, after) => {
      const events: HostedEvent[] = [
        {
          id: 1,
          runId: id,
          ts: new Date().toISOString(),
          type: "browser.ready",
          data: { browser_session_id: provider.browserId },
        },
      ];
      if (provider.released) {
        events.push({
          id: 2,
          runId: id,
          ts: new Date().toISOString(),
          type: "worker.session_released",
          data: {},
        });
      }
      return await Promise.resolve({
        events: events.filter((event) => event.id > after),
        nextAfter: null,
        hasMore: false,
      });
    },
    summary: async () =>
      await Promise.resolve({
        status: provider.status,
        result: provider.result,
        error: null,
        totalCostUsd: provider.cost,
      }),
    cancel: async () => {
      provider.cancelCalls += 1;
      await Promise.resolve();
    },
  };
  const services = { ...base, hostedAgent: api };
  const runs = new ChatRunRegistry();
  const workspaces = new Workspaces({
    balances: {
      hbar: async () => await Promise.resolve(null),
      usdc: async () => await Promise.resolve(null),
    },
    blockPrivateNetwork: true,
    browserIdleMs: 60_000,
    createBrowser: () => browser,
    demoUserId: null,
    isBusy: () => true,
    ledger: base.ledger,
    maxBrowsers: 1,
    modes: environment.modes,
    onBrowserState: noop,
    onMandate: noop,
    onPolicyDecision: noop,
    onReceipt: noop,
    oracleHost: "localhost:3000",
    oraclePayTo: services.oracle.payTo,
    quote: () => null,
    networks: { evm: "eip155:84532", hedera: "hedera:testnet" },
    reservedBrowsers: 0,
    store: base.store,
  });
  const workspace = await workspaces.hydrate(owner);
  let now = Date.now();
  const deps: TaskDeps = {
    services,
    runs,
    workspaces,
    now: () => now,
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
    tasksUrl: "http://localhost:3000/api/tasks",
    unlocks: new UnlockTokens(),
  };
  const id = TaskId.generate();
  const task: Task = {
    id,
    agentTokenId: null,
    connectionId: null,
    createdAt: now,
    updatedAt: now,
    error: null,
    idempotencyKey: id,
    input: {
      executor: "hosted",
      stubbed: true,
      instruction: "Find a useful example",
      quote: {
        taskId: id,
        instruction: "Find a useful example",
        budgetUsd: 1,
        priceUsdMicros: 1_000_000,
        modelAllowanceUsdMicros: 500_000,
        executionMs: 600_000,
        expiresAt: now + 60_000,
        idempotencyKey: id,
      },
      challenge: {},
    },
    kind: "browse",
    priceUsdMicros: usdMicros(1_000_000),
    result: null,
    runId: null,
    saleId: SaleId.generate(),
    status: "paid",
  };
  await services.store.tasks.create(owner, task);
  const job = new HostedBrowseJob(deps, workspace, task);
  const saved = async (): Promise<Task> => {
    const value = await services.store.tasks.byId(owner, id);
    if (value === null) {
      throw new Error("Missing fixture task");
    }
    return value;
  };
  const boot = async (): Promise<void> => {
    await job.refresh();
    expect(provider.calls).toHaveLength(1);
    await job.refresh();
    expect(browser.attached).toBe(true);
    await job.refresh();
    expect(provider.calls).toHaveLength(2);
  };
  return {
    owner,
    deps,
    workspace,
    provider,
    browser,
    job,
    saved,
    boot,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe("hosted browser lifecycle", () => {
  test("attaches Froggy before user work, shares one allowance, and never occupies foreground chat", async () => {
    const f = await fixture();
    const chat = f.deps.runs.start(f.workspace.session.id);
    await f.boot();
    expect(f.provider.calls[0]?.task).toContain("about:blank");
    expect(f.provider.calls[1]?.sessionId).toBe(PROFILE);
    expect(f.provider.calls[1]?.maxCostUsd).toBe(0.49);
    expect(f.deps.runs.get(f.workspace.session.id)).toBe(chat);
    await f.job.refresh();
    expect(f.job.view().status).toBe("done");
    expect(f.job.view().browse?.stubbed).toBe(true);
    expect(chat.signal.aborted).toBe(false);
    expect(JSON.stringify(f.job.view())).not.toContain(PROFILE);
    expect(JSON.stringify(f.job.view())).not.toContain("providerRunId");
  });
  test("cancel acknowledgement does not hand over; release confirms control and Continue reuses the session", async () => {
    const f = await fixture();
    await f.boot();
    f.provider.status = "running";
    f.provider.released = false;
    await f.job.refresh();
    await f.job.control("take_control");
    await f.job.refresh();
    expect(f.provider.cancelCalls).toBe(1);
    expect(f.job.view().browse?.phase).toBe("handing_over");
    expect(f.browser.control).toBe("stopping");
    f.advance(16_000);
    expect(f.job.view().browse?.controls.forceStop).toBe(true);
    f.provider.status = "cancelled";
    await f.job.refresh();
    expect(f.browser.control).toBe("stopping");
    f.provider.released = true;
    await f.job.refresh();
    expect(f.job.view().browse?.phase).toBe("human");
    expect(f.browser.control).toBe("human");
    await f.job.control("continue");
    await f.job.refresh();
    expect(f.provider.calls[2]?.sessionId).toBe(PROFILE);
    expect(f.provider.calls[2]?.maxCostUsd).toBe(0.48);
  });
  test("an ambiguous create stays retrievable and is not retried after recovery", async () => {
    const f = await fixture();
    f.provider.ambiguous = true;
    await f.job.refresh();
    expect(f.job.view().browse?.phase).toBe("checking");
    await f.job.refresh();
    const restored = new HostedBrowseJob(f.deps, f.workspace, await f.saved());
    await restored.refresh();
    expect(f.provider.calls).toHaveLength(1);
    expect(restored.view().error).toContain("reconciliation");
  });
  test("recovery reads the same provider run and Stop leaves foreground chat alone", async () => {
    const f = await fixture();
    await f.boot();
    f.provider.status = "running";
    f.provider.released = false;
    await f.job.refresh();
    const restored = new HostedBrowseJob(f.deps, f.workspace, await f.saved());
    const chat = f.deps.runs.start(f.workspace.session.id);
    await restored.refresh();
    expect(f.provider.calls).toHaveLength(2);
    await restored.control("stop");
    await restored.refresh();
    expect(restored.view().status).toBe("running");
    expect(chat.signal.aborted).toBe(false);
    f.provider.status = "cancelled";
    f.provider.released = true;
    await restored.refresh();
    expect(restored.view().status).toBe("cancelled");
    expect(restored.view().result?.text).toBe("Task result");
  });
  test("missing result is incomplete and the local deadline stops a stalled worker", async () => {
    const f = await fixture();
    await f.boot();
    f.provider.result = "";
    await f.job.refresh();
    expect(f.job.view().status).toBe("failed");
    const stalled = await fixture();
    await stalled.boot();
    stalled.provider.status = "running";
    stalled.provider.released = false;
    await stalled.job.refresh();
    stalled.advance(600_001);
    await stalled.job.refresh();
    expect(stalled.provider.cancelCalls).toBe(1);
    stalled.provider.status = "cancelled";
    stalled.provider.released = true;
    await stalled.job.refresh();
    expect(stalled.job.view().browse?.phase).toBe("budget_reached");
  });
});

test("force stop confirms browser closure before completion and cannot reattach it", async () => {
  const f = await fixture();
  await f.boot();
  f.provider.status = "running";
  f.provider.released = false;
  await f.job.refresh();
  await f.job.control("take_control");
  expect(f.job.control("force_stop")).rejects.toThrow("Wait for");
  f.advance(15_001);
  await f.job.control("force_stop");
  expect(f.browser.closed).toBe(true);
  expect(f.job.view().browse?.controls.watch).toBe(false);
  const attaches = f.browser.calls.filter((call) => call === "attach").length;
  await f.job.refresh();
  expect(f.browser.calls.filter((call) => call === "attach")).toHaveLength(
    attaches
  );
  expect(f.job.view().status).toBe("running");
  f.provider.status = "cancelled";
  await f.job.refresh();
  expect(f.job.view().status).toBe("cancelled");
});

test("expired handover reconnects with a fresh bootstrap and the same remaining allowance", async () => {
  const f = await fixture();
  await f.boot();
  f.provider.status = "running";
  f.provider.released = false;
  await f.job.refresh();
  await f.job.control("take_control");
  f.provider.status = "cancelled";
  f.provider.released = true;
  await f.job.refresh();
  f.browser.expired = true;
  await f.job.control("continue");
  expect(f.job.view().browse?.phase).toBe("expired");
  expect(f.job.view().browse?.controls.reconnect).toBe(true);
  expect(f.job.run).toBeNull();
  expect(f.provider.calls).toHaveLength(2);
  f.browser.expired = false;
  await f.job.control("reconnect");
  f.provider.status = "completed";
  await f.job.refresh();
  expect(f.provider.calls[2]?.task).toContain("about:blank");
  expect(f.provider.calls[2]?.sessionId).toBeUndefined();
  await f.job.refresh();
  await f.job.refresh();
  expect(f.provider.calls[3]?.maxCostUsd).toBe(0.47);
});

test("an unexpected provider browser is stopped without attaching it", async () => {
  const f = await fixture();
  await f.boot();
  const replacement = crypto.randomUUID();
  f.provider.browserId = replacement;
  f.provider.status = "running";
  f.provider.released = false;
  await f.job.refresh();
  expect(f.provider.cancelCalls).toBe(1);
  expect(f.job.view().browse?.phase).toBe("stopping");
  await f.job.refresh();
  expect(f.browser.calls).toContain(`stop:${replacement}`);
  const saved = await f.saved();
  expect(hostedState(saved)?.browserId).toBe(BROWSER);
});

test("graceful suspension waits for release and recovers the same provider run", async () => {
  const f = await fixture();
  await f.boot();
  expect(await f.job.suspend()).toBe(true);
  expect(f.browser.calls).toContain("detach");
  expect(f.browser.closed).toBe(false);
  const restored = new HostedBrowseJob(f.deps, f.workspace, await f.saved());
  await restored.refresh();
  expect(f.provider.calls).toHaveLength(2);
  expect(restored.view().browse?.phase).toBe("human");
});

test("a dropped wallet bridge cancels the worker before handing over a reattached browser", async () => {
  const f = await fixture();
  await f.boot();
  f.provider.status = "running";
  f.provider.released = false;
  await f.job.refresh();
  f.browser.crashed = true;
  await f.job.refresh();
  expect(f.provider.cancelCalls).toBe(1);
  expect(f.job.view().browse?.phase).toBe("handing_over");
  expect(f.job.view().browse?.controls.watch).toBe(false);
  f.browser.crashed = false;
  f.provider.status = "cancelled";
  f.provider.released = true;
  await f.job.refresh();
  expect(f.job.view().browse?.phase).toBe("human");
  expect(f.job.view().browse?.controls.watch).toBe(true);
});

test("a confirmed expired paused browser releases capacity without purchasing a replacement", async () => {
  const f = await fixture();
  await f.boot();
  f.provider.status = "running";
  f.provider.released = false;
  await f.job.refresh();
  await f.job.control("take_control");
  f.provider.status = "cancelled";
  f.provider.released = true;
  await f.job.refresh();
  f.browser.expiresAt = 1;
  f.browser.expired = true;
  await f.job.refresh();
  expect(f.job.view().browse?.phase).toBe("expired");
  expect(f.browser.closed).toBe(true);
  expect(f.provider.calls).toHaveLength(2);
  expect(
    f.deps.workspaces.tryAdmitHosted(userId("did:privy:next-browser-owner"))
  ).toBe(true);
});

const pendingPurchase = async (
  f: Awaited<ReturnType<typeof fixture>>,
  runId: RunId,
  status: "paying" | "awaiting_approval"
): Promise<Purchase> => {
  const id = PurchaseId.generate();
  const purchase: Purchase = {
    id,
    runId,
    status,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    idempotencyKey: id,
    connectionId: null,
    source: "browser",
    toolCallId: null,
    browserPaymentId: null,
    request: { url: "https://example.com", method: "GET", body: null },
    requestFingerprint: "fixture",
    purpose: "Verify payment reconciliation",
    maxUsdMicros: usdMicros(100_000),
    budgetUsdMicros: usdMicros(100_000),
    preferredNetwork: null,
    contactApprovedAt: Date.now(),
    quote: null,
    approvalId: ApprovalId.generate(),
    expiresAt: Date.now() + 60_000,
    grant: null,
    payment: {
      state: "none",
      proofHash: null,
      transactionId: null,
      sentAt: null,
    },
    delivery: {
      state: "pending",
      status: null,
      contentType: null,
      body: null,
      bodyHash: null,
    },
    receiptId: null,
    error: null,
    stubbed: true,
  };
  await f.deps.services.store.purchases.create(f.owner, purchase);
  return purchase;
};

test("Done waits for this task's financial reconciliation and ignores another run's approval", async () => {
  const f = await fixture();
  await f.boot();
  const { run } = f.job;
  if (run === null) {
    throw new Error("Missing browser run");
  }
  const purchase = await pendingPurchase(f, run.id, "paying");
  await pendingPurchase(f, RunId.generate(), "awaiting_approval");
  await f.job.refresh();
  expect(f.job.view().browse?.phase).toBe("finalizing");
  expect(f.job.view().status).toBe("running");
  await f.deps.services.store.purchases.update(
    f.owner,
    purchase.id,
    ["paying"],
    { status: "completed", updatedAt: Date.now() }
  );
  await f.job.refresh();
  expect(f.job.view().status).toBe("done");
});

test("website approval is visible and Stop cancels only this browser task's pending purchase", async () => {
  const f = await fixture();
  await f.boot();
  const { run } = f.job;
  if (run === null) {
    throw new Error("Missing browser run");
  }
  const own = await pendingPurchase(f, run.id, "awaiting_approval");
  const other = await pendingPurchase(f, RunId.generate(), "awaiting_approval");
  f.provider.status = "running";
  f.provider.released = false;
  await f.job.refresh();
  expect(f.job.view().browse?.phase).toBe("awaiting_approval");
  await f.job.control("stop");
  await f.job.refresh();
  const stopped = await f.deps.services.store.purchases.byId(f.owner, own.id);
  const unaffected = await f.deps.services.store.purchases.byId(
    f.owner,
    other.id
  );
  expect(stopped?.status).toBe("cancelled");
  expect(unaffected?.status).toBe("awaiting_approval");
  f.provider.status = "cancelled";
  f.provider.released = true;
  await f.job.refresh();
  expect(f.job.view().status).toBe("cancelled");
});

test("task snapshots and controls enforce owner identity and protocol version", async () => {
  const f = await fixture();
  await f.job.refresh();
  const caller = {
    userId: f.owner,
    agentTokenId: null,
    grantId: null,
    scopes: null,
  };
  const list = new Request("http://localhost:3000/api/browse-tasks");
  const response = await handleBrowseTaskRoutes(
    f.deps,
    list,
    f.workspace,
    caller
  );
  const text = await response?.text();
  expect(text).toContain(f.job.view().id);
  expect(text).not.toContain("providerRunId");
  expect(text).not.toContain(PROFILE);
  const forbidden = await handleBrowseTaskRoutes(f.deps, list, f.workspace, {
    ...caller,
    agentTokenId: AgentTokenId.generate(),
  });
  expect(forbidden?.status).toBe(403);
  const control = (v: number) =>
    new Request(`http://localhost:3000/api/tasks/${f.job.view().id}/control`, {
      method: "POST",
      body: JSON.stringify({ v, action: "stop" }),
    });
  const foreign = await handleBrowseTaskRoutes(
    f.deps,
    control(1),
    f.workspace,
    { ...caller, userId: userId("did:privy:other-hosted-owner") }
  );
  expect(foreign?.status).toBe(404);
  const invalid = await handleBrowseTaskRoutes(
    f.deps,
    control(2),
    f.workspace,
    caller
  );
  expect(invalid?.status).toBe(400);
});

const event = (
  id: number,
  type: string,
  data: HostedEvent["data"]
): HostedEvent => ({
  id,
  type,
  data,
  runId: PROVIDER_RUN,
  ts: new Date(1000).toISOString(),
});
test("activity is bounded, redacted, deduplicated and a step error does not fail the task", () => {
  let state: HostedBrowseState = {
    ...initialHostedState(1000),
    stage: "task" as const,
    providerRunId: PROVIDER_RUN,
  };
  const step = event(1, "core.event", {
    type: "tool_use",
    part: {
      type: "tool",
      tool: "browser_execute",
      callID: "step-1",
      state: {
        status: "error",
        input: {
          code: "private",
          description: "open https://private.example/password?token=secret",
        },
        output: "secret",
      },
    },
  });
  state = applyHostedEvent(state, step, 1000);
  expect(state.activity[0]?.label).toBe("Opening a page");
  expect(state.phase).toBe("queued");
  expect(applyHostedEvent(state, step, 1000)).toBe(state);
  state = applyHostedEvent(
    state,
    event(2, "unknown.future.event", { secret: "hidden" }),
    1000
  );
  expect(state.cursor).toBe(2);
  expect(JSON.stringify(state.activity)).not.toContain("private");
  for (let i = 3; i < 100; i += 1) {
    state = applyHostedEvent(
      state,
      event(i, "core.event", {
        type: "tool_use",
        part: {
          type: "tool",
          tool: "browser_execute",
          callID: `step-${i}`,
          state: { status: "completed" },
        },
      }),
      1000
    );
  }
  expect(state.activity).toHaveLength(80);
});

test("approval cancellation is scoped to the browser run", async () => {
  const f = await fixture();
  await f.boot();
  f.provider.status = "running";
  f.provider.released = false;
  const runId = f.job.run?.id;
  if (runId === undefined) {
    throw new Error("Expected browser run");
  }
  const otherId = RunId.generate();
  const park = async (id: string, run: RunId) =>
    await f.deps.interactions.park({
      userId: f.owner,
      signal: new AbortController().signal,
      request: {
        id,
        runId: run,
        title: "Test",
        detail: "Test",
        amountLabel: "$1",
        expiresAt: Date.now() + 10_000,
        options: [{ id: "deny", kind: "deny", label: "Deny" }],
        payeeLabel: "Example",
        purpose: "Test",
      },
    });
  const own = park("own", runId);
  const other = park("other", otherId);
  await f.job.control("stop");
  const answer = await own;
  expect(answer.kind).toBe("aborted");
  expect(
    f.deps.interactions.pendingFor(f.owner).map((request) => request.id)
  ).toEqual(["other"]);
  f.deps.interactions.abortRun(f.owner, otherId, "test cleanup");
  await other;
  const task = await f.saved();
  expect(hostedState(task)?.intent).toBe("stop");
  expect(publicBrowseTask(task, Date.now()).browse?.controls.continue).toBe(
    false
  );
});

test("public browser snapshots retain the tool-enabled task's completion evidence", async () => {
  const f = await fixture();
  const task = await f.saved();
  const outcome = {
    status: "blocked" as const,
    reason: "Login is required",
    evidence: "The requested product page shows a login form.",
  };
  const view = publicBrowseTask(
    {
      ...task,
      input: { instruction: "Check the saved product" },
      status: "paused",
      result: { text: "Waiting for login", outcome },
    },
    Date.now()
  );
  expect(view.result?.outcome).toEqual(outcome);
  expect(view.browse?.executor).toBe("legacy");
  expect(view.browse?.phase).toBe("human");
});
