import { expect, test } from "@playwright/test";
import { Schema } from "effect";

import { AgentToken } from "../packages/domain/src/agent-token";
import { AgentDetail } from "../packages/protocol/src/agents";
import { ServiceTicket, TaskDetail } from "../packages/protocol/src/services";

const Minted = Schema.Struct({ secret: Schema.String, token: AgentToken });
interface ToolArguments {
  readonly id?: string;
  readonly secret?: string;
  readonly v?: number;
  readonly service?: string;
  readonly prompt?: string;
  readonly idempotencyKey?: string;
}

const McpReply = Schema.Struct({
  result: Schema.Struct({
    content: Schema.Array(Schema.Struct({ text: Schema.String })),
    isError: Schema.Boolean,
  }),
});

test("an agent detail keeps each call, links paid tasks and retains history after disconnect", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await page.goto("/agents");
  await expect(
    page.getByRole("button", { name: "Copy for your agent" })
  ).toBeVisible();
  const ownerToken = await page.evaluate(() =>
    localStorage.getItem("froggy.local-identity")
  );
  expect(ownerToken).not.toBeNull();
  const owner = { authorization: `Bearer ${ownerToken}` };
  const minted = await request.post("/api/agents", {
    headers: owner,
    data: { label: "Research agent" },
  });
  const { secret, token } = Schema.decodeUnknownSync(Minted)(
    await minted.json()
  );
  const headers = {
    authorization: `Bearer ${secret}`,
    accept: "application/json, text/event-stream",
  };
  const call = async (name: string, args: ToolArguments = {}) =>
    await request.post("/mcp", {
      headers,
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      },
    });
  const detailPath = `/api/agents/${token.id}`;
  const detail = async () => {
    const response = await request.get(detailPath, { headers: owner });
    return Schema.decodeUnknownSync(AgentDetail)(await response.json());
  };
  await page.goto(`/agents/${token.id}`);
  await expect(
    page.getByRole("heading", { name: "Research agent", exact: true })
  ).toBeVisible();
  await expect(page.getByText("No invocations yet.")).toBeVisible();
  await expect(
    page.getByText("brief, browse, pay, services, history")
  ).toBeVisible();
  await expect(
    page.getByText(
      "This minted token is not limited by consent scopes. It may call every agent tool, including history."
    )
  ).toBeVisible();
  await call("froggy_services");
  await call("not_a_tool");
  await call("froggy_service_run", { secret: "NEVER_PERSIST_ARGUMENTS" });
  await request.post("/api/tasks", {
    headers,
    data: { kind: "brief", symbol: "USDC" },
  });
  await request.post("/api/wallet/pay", { headers, data: { challenge: {} } });
  const input = {
    v: 1,
    service: "web_search",
    prompt: "Find local fixture sources",
    idempotencyKey: `agent-history-${token.id}`,
  };
  const purchased = await call("froggy_service_run", input);
  const purchase = Schema.decodeUnknownSync(McpReply)(await purchased.json());
  const ticket = Schema.decodeUnknownSync(ServiceTicket)(
    JSON.parse(purchase.result.content[0]?.text ?? "null")
  );
  await expect
    .poll(async () => {
      const response = await request.get(`/api/services/tasks/${ticket.id}`, {
        headers,
      });
      return Schema.decodeUnknownSync(ServiceTicket)(await response.json())
        .status;
    })
    .toBe("done");
  await call("froggy_service_run", input);
  await call("froggy_service_status", { id: ticket.id });
  const history = await detail();
  expect(history.invocations).toHaveLength(8);
  expect(
    history.invocations.filter((row) => row.outcome === "accepted")
  ).toHaveLength(1);
  expect(
    history.invocations.filter((row) => row.usdMicros !== null)
  ).toHaveLength(1);
  expect(
    history.invocations.find((row) => row.outcome === "accepted")?.usdMicros
  ).toBe(10_000);
  expect(
    history.invocations.some(
      (row) => row.outcome === "replayed" && row.usdMicros === null
    )
  ).toBe(true);
  expect(
    history.invocations.some(
      (row) => row.kind === "pay" && row.outcome === "invalid_request"
    )
  ).toBe(true);
  expect(
    history.invocations.some(
      (row) => row.name === "brief" && row.outcome === "payment_required"
    )
  ).toBe(true);
  expect(JSON.stringify(history)).not.toContain("NEVER_PERSIST_ARGUMENTS");
  expect(JSON.stringify(history)).not.toContain(input.prompt);
  expect(JSON.stringify(history)).not.toContain(secret);
  const agentRead = await request.get(detailPath, { headers });
  expect(agentRead.status()).toBe(403);
  const otherRead = await request.get(detailPath, {
    headers: { authorization: "Bearer other-history-owner" },
  });
  expect(otherRead.status()).toBe(404);
  await page.getByRole("button", { name: "Refresh history" }).click();
  const list = page.getByRole("region", { name: "Invocation history" });
  await expect(list.getByRole("listitem")).toHaveCount(8);
  await expect(list.getByText("$0.01 paid")).toBeVisible();
  await list.getByRole("link", { name: ticket.id }).first().click();
  await expect(
    page.getByRole("region", { name: "Selected service task" })
  ).toContainText(input.prompt);
  await page.goBack();
  const capture = async (width: number): Promise<void> => {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`agent-detail-${width}.png`),
    });
  };
  await capture(1440);
  await capture(390);
  await capture(320);
  await page.goto("/agents");
  await page.getByRole("link", { name: "1 agent connected" }).click();
  await expect(page).toHaveURL(new RegExp(`/agents/${token.id}$`, "u"));
  await page.getByRole("button", { name: "Disconnect Research agent" }).click();
  await expect(
    page.getByText(/Disconnected .* History is kept\./u)
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Invocation history" })
      .getByRole("listitem")
  ).toHaveCount(8);
  const refused = await call("froggy_services");
  expect(refused.status()).toBe(401);
  await page.goto("/agents");
  await expect(
    page.getByRole("button", { name: "Copy for your agent" })
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("history is capped at the newest 50 calls and records HTTP service requests", async ({
  page,
  request,
}) => {
  await page.goto("/agents");
  await expect(
    page.getByRole("button", { name: "Copy for your agent" })
  ).toBeVisible();
  const ownerToken = await page.evaluate(() =>
    localStorage.getItem("froggy.local-identity")
  );
  expect(ownerToken).not.toBeNull();
  const owner = { authorization: `Bearer ${ownerToken}` };
  const minted = await request.post("/api/agents", {
    headers: owner,
    data: { label: "Busy agent" },
  });
  const { secret, token } = Schema.decodeUnknownSync(Minted)(
    await minted.json()
  );
  const headers = { authorization: `Bearer ${secret}` };
  await Promise.all(
    Array.from(
      { length: 55 },
      async (_, index) =>
        await request.post(index % 2 === 0 ? "/api/mcp" : "/mcp", {
          headers,
          data: {
            jsonrpc: "2.0",
            id: index,
            method: "tools/call",
            params: { name: "froggy_services" },
          },
        })
    )
  );
  await request.post("/api/services/run", { headers, data: { invalid: true } });
  const response = await request.get(`/api/agents/${token.id}`, {
    headers: owner,
  });
  const history = Schema.decodeUnknownSync(AgentDetail)(await response.json());
  expect(history.invocations).toHaveLength(50);
  expect(history.invocations[0]?.kind).toBe("task");
  expect(history.invocations[0]?.name).toBe("services.run");
  const times = history.invocations.map((row) => row.at);
  expect(times).toEqual(times.toSorted((a, b) => b - a));
  await page.goto(`/agents/${token.id}`);
  await expect(
    page
      .getByRole("region", { name: "Invocation history" })
      .getByRole("listitem")
  ).toHaveCount(50);
});

test("a CLI brief shows signing separately from payment and links to its result", async ({
  page,
  request,
}) => {
  await page.goto("/agents");
  await expect(
    page.getByRole("button", { name: "Copy for your agent" })
  ).toBeVisible();
  const ownerToken = await page.evaluate(() =>
    localStorage.getItem("froggy.local-identity")
  );
  expect(ownerToken).not.toBeNull();
  const owner = { authorization: `Bearer ${ownerToken}` };
  const minted = await request.post("/api/agents", {
    headers: owner,
    data: { label: "CLI agent" },
  });
  const { secret, token } = Schema.decodeUnknownSync(Minted)(
    await minted.json()
  );
  const headers = { authorization: `Bearer ${secret}` };
  const body = {
    kind: "brief",
    symbol: "USDC",
    idempotencyKey: `brief-${token.id}`,
  };
  const quoted = await request.post("/api/tasks", { headers, data: body });
  expect(quoted.status()).toBe(402);
  const challenge: unknown = await quoted.json();
  const signed = await request.post("/api/wallet/pay", {
    headers,
    data: { challenge },
  });
  const proof = Schema.decodeUnknownSync(
    Schema.Struct({ header: Schema.String })
  )(await signed.json());
  const paid = await request.post("/api/tasks", {
    headers: { ...headers, "x-payment": proof.header },
    data: body,
  });
  expect(paid.status()).toBe(202);
  const ticket = Schema.decodeUnknownSync(TaskDetail)(await paid.json());
  const fetched = await request.get(`/api/tasks/${ticket.task.id}`, {
    headers,
  });
  expect(fetched.ok()).toBe(true);
  const listed = await request.get("/api/tasks", { headers });
  expect(listed.ok()).toBe(true);
  const events = await request.get(`/api/tasks/${ticket.task.id}/events`, {
    headers,
  });
  expect(events.ok()).toBe(true);
  const detail = await request.get(`/api/agents/${token.id}`, {
    headers: owner,
  });
  const recorded = Schema.decodeUnknownSync(AgentDetail)(await detail.json());
  expect(recorded.invocations.slice(0, 3).map((row) => row.name)).toEqual([
    "tasks.events",
    "tasks.list",
    "tasks.get",
  ]);
  expect(
    recorded.invocations
      .slice(0, 3)
      .every((row) => row.usdMicros === null && row.outcome === "ok")
  ).toBe(true);
  await page.goto(`/agents/${token.id}`);
  const history = page.getByRole("region", { name: "Invocation history" });
  await expect(history.getByRole("listitem")).toHaveCount(6);
  await expect(history.getByText("$0.05 paid", { exact: true })).toBeVisible();
  await expect(
    history.getByText("$0.05 signed · settlement not confirmed", {
      exact: true,
    })
  ).toBeVisible();
  await history.getByRole("link", { name: ticket.task.id }).first().click();
  const selected = page.getByRole("region", { name: "Selected service task" });
  await expect(selected).toContainText("Lending brief");
  await expect(selected).toContainText("Simulated");
  await expect(selected).toContainText("USDC");
});
