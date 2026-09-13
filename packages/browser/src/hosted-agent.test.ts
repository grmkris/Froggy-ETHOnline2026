import { expect, test } from "bun:test";

import { hostedAgentApi, HostedAgentError } from "./hosted-agent";

const ID = "6f19ba70-e37c-4c63-913c-62bbc94f1740";
const fixture = (responses: Response[]) => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const api = hostedAgentApi({
    apiKey: "secret-provider-key",
    fetch: Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: input instanceof Request ? input.url : String(input),
          init,
        });
        const response = responses.shift();
        if (response === undefined) {
          throw new Error("Unexpected provider request");
        }
        return await Promise.resolve(response);
      },
      { preconnect: fetch.preconnect }
    ),
  });
  return { api, calls };
};

test("hosted create pins cost, low reasoning and session continuation without retrying", async () => {
  const { api, calls } = fixture([
    Response.json({ id: ID, sessionId: ID, workspaceId: ID, status: "queued" }),
  ]);
  await api.create({
    task: "Example",
    model: "gpt-5.6-luna",
    maxCostUsd: 0.1,
    sessionId: ID,
    country: null,
  });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.init?.redirect).toBe("error");
  expect(calls[0]?.init?.body).toBe(
    JSON.stringify({
      task: "Example",
      model: "gpt-5.6-luna",
      modelParams: { reasoning: { effort: "low" } },
      maxCostUsd: 0.1,
      agentmail: false,
      browserSettings: {
        proxyCountryCode: null,
        record: false,
        screenWidth: 1280,
        screenHeight: 800,
      },
      sessionId: ID,
    })
  );
});

test("429 respects Retry-After and errors never copy provider response content", async () => {
  const { api, calls } = fixture([
    new Response("secret-provider-key private page text", {
      status: 429,
      headers: { "retry-after": "11" },
    }),
  ]);
  const failure = await api.status(ID).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(HostedAgentError);
  if (!(failure instanceof HostedAgentError)) {
    throw new Error("Expected provider error");
  }
  expect(failure.retryAfterMs).toBe(11_000);
  expect(failure.message).not.toContain("secret-provider-key");
  expect(failure.message).not.toContain("private page");
  expect(calls).toHaveLength(1);
});

test("malformed and oversized responses fail closed, and cancellation accepts 204", async () => {
  const malformed = fixture([Response.json({ status: "invented" })]);
  expect(malformed.api.status(ID)).rejects.toBeInstanceOf(HostedAgentError);
  const oversized = fixture([new Response("x".repeat(512 * 1024 + 1))]);
  expect(oversized.api.events(ID, 7)).rejects.toBeInstanceOf(HostedAgentError);
  expect(oversized.calls[0]?.url).toContain("after=7&include_output=false");
  const cancelled = fixture([new Response(null, { status: 204 })]);
  await cancelled.api.cancel(ID);
  expect(cancelled.calls).toHaveLength(1);
});

test("private purchase dispatch disables sharing before sending run-scoped secret bindings", async () => {
  const { api, calls } = fixture([
    new Response(null, { status: 204 }),
    Response.json({ id: ID, sessionId: ID, workspaceId: ID, status: "queued" }),
  ]);
  await api.create({
    task: "Fill by alias after checking the approved checkout.",
    model: "gpt-5.6-luna",
    maxCostUsd: 0.1,
    sessionId: ID,
    country: null,
    privateSession: true,
    secretBindings: [
      {
        alias: "card_number",
        source: { type: "inline", value: "synthetic-secret" },
        allowedDomains: ["checkout.example", "fields.example"],
      },
    ],
  });
  expect(calls).toHaveLength(2);
  expect(calls[0]?.url).toEndWith(`/sessions/${ID}/share`);
  expect(calls[0]?.init?.method).toBe("PUT");
  expect(calls[0]?.init?.body).toBe(JSON.stringify({ isActive: false }));
  const run = calls[1]?.init?.body;
  expect(typeof run).toBe("string");
  expect(run).toContain('"record":false');
  expect(run).toContain(
    '"allowedDomains":["checkout.example","fields.example"]'
  );
  expect(run).toContain('"alias":"card_number"');
});

test("purchase dispatch stops when session sharing cannot be disabled", async () => {
  const { api, calls } = fixture([
    new Response("synthetic-secret", { status: 503 }),
  ]);
  const result = await api
    .create({
      task: "Purchase",
      model: "gpt-5.6-luna",
      maxCostUsd: 0.1,
      sessionId: ID,
      country: null,
      privateSession: true,
    })
    .catch((error: unknown) => error);
  expect(result).toBeInstanceOf(HostedAgentError);
  expect(String(result)).not.toContain("synthetic-secret");
  expect(calls).toHaveLength(1);
});
