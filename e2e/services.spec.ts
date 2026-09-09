import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { text } from "node:stream/consumers";

import { expect, test } from "@playwright/test";
import { Schema } from "effect";

test("buy a demo service and recover its result after reload", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/services");
  await page.getByRole("button", { name: "Choose search the web" }).click();
  await page.getByLabel("Your request").fill("Find affordable train tickets");
  await page.getByRole("button", { name: "Try simulated · $0.01" }).click();
  await expect(page.getByLabel("Service tasks")).toContainText("Done");
  await expect(page.getByLabel("Service tasks")).toContainText("Simulated");
  await expect(page.getByLabel("Service tasks")).toContainText(
    "DEMO — Search the web"
  );
  await page.reload();
  await expect(page.getByLabel("Service tasks")).toContainText(
    "Find affordable train tickets"
  );
  await page.screenshot({ path: testInfo.outputPath("services-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("services-mobile.png") });
  expect(errors).toEqual([]);
});

test("an agent token reaches MCP but cannot change spending authority", async ({
  request,
}) => {
  const headers = { authorization: "Bearer dev-local" };
  // Use the same development identity as the workspace.
  const minted = await request.post("/api/agents", {
    headers,
    data: { label: "MCP service test" },
  });
  expect(minted.ok()).toBe(true);
  const body = Schema.decodeUnknownSync(
    Schema.Struct({
      secret: Schema.String,
      token: Schema.Struct({ id: Schema.String }),
    })
  )(await minted.json());
  const agent = {
    authorization: `Bearer ${body.secret}`,
    accept: "application/json, text/event-stream",
  };
  const tools = await request.post("/api/mcp", {
    headers: agent,
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(await tools.text()).toContain("froggy_service_run");
  const forbidden = await request.post("/api/directory", {
    headers: agent,
    data: { url: "https://example.com" },
  });
  expect(forbidden.status()).toBe(403);
  await request.delete(`/api/agents/${body.token.id}`, { headers });
  const revoked = await request.post("/api/mcp", {
    headers: agent,
    data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
  });
  expect(revoked.status()).toBe(401);
});

test("the distributed Node CLI speaks MCP over stdio", async ({
  request,
  baseURL,
}, testInfo) => {
  const bundle = await request.get("/froggy-cli.js");
  expect(bundle.ok()).toBe(true);
  expect(bundle.headers()["content-type"]).toContain("javascript");
  const script = testInfo.outputPath("froggy.mjs");
  await mkdir(path.dirname(script), { recursive: true });
  await writeFile(script, await bundle.text());
  const messages = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "1" },
      },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]
    .map((message) => JSON.stringify(message))
    .join("\n");
  const child = spawn("node", [script, "mcp"], {
    env: {
      PATH: process.env["PATH"],
      FROGGY_URL: baseURL,
      FROGGY_TOKEN: "dev-local",
    },
    timeout: 10_000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(`${messages}\n`);
  const [stdout, stderr] = await Promise.all([
    text(child.stdout),
    text(child.stderr),
    once(child, "close"),
  ]);
  expect(child.exitCode, stderr).toBe(0);
  expect(stderr).toBe("");
  const replies = stdout
    .trim()
    .split("\n")
    .map((line) =>
      Schema.decodeUnknownSync(
        Schema.Struct({
          jsonrpc: Schema.Literals(["2.0"]),
          id: Schema.Number,
          result: Schema.Unknown,
        })
      )(JSON.parse(line))
    );
  expect(replies.map((reply) => reply.id)).toEqual([1, 2]);
  expect(stdout).toContain("froggy_service_run");
});
