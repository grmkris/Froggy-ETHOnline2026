import { createHash, randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";
import { Schema } from "effect";

import { captureResponsive, captureScreen } from "./capture";

/**
 * An MCP client connects the official way: it registers itself, the person
 * consents in the page, the code is exchanged for a token that reaches
 * `/mcp` with the scopes left on and nothing more, and Disconnect (here by
 * the API Connections calls) ends it. The server side of every step is
 * unit-tested in `apps/server/src/oauth.test.ts`; this is the page and the
 * wiring.
 */

const Registered = Schema.Struct({ client_id: Schema.String });
const Tokens = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  scope: Schema.String,
});
const Grants = Schema.Struct({
  grants: Schema.Array(
    Schema.Struct({
      clientName: Schema.String,
      id: Schema.String,
      revokedAt: Schema.NullOr(Schema.Int),
      scopes: Schema.Array(Schema.String),
    })
  ),
});

test("an MCP client signs in through the consent page and is held to its scopes", async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  const manual = `${baseURL}/oauth/manual`;
  const registration = await request.post("/oauth/register", {
    data: { client_name: "E2E MCP client", redirect_uris: [manual] },
  });
  expect(registration.status()).toBe(201);
  const { client_id: clientId } = Schema.decodeUnknownSync(Registered)(
    await registration.json()
  );

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorize = new URL("/oauth/authorize", baseURL);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", manual);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("scope", "brief services");
  authorize.searchParams.set("state", "e2e-state");
  authorize.searchParams.set("resource", `${baseURL}/mcp`);

  await page.goto(authorize.toString());
  await expect(
    page.getByRole("heading", {
      name: "E2E MCP client wants to connect to Froggy",
    })
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Buy lending briefs" })
  ).toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Buy services" })
  ).toBeChecked();
  // Only what was asked for is offered.
  await expect(page.getByRole("switch")).toHaveCount(2);
  await expect(
    page.getByText("Disconnect any time on Connections.")
  ).toBeVisible();
  const captureConsent = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await captureScreen(page, testInfo, "oauth-consent");
  };
  await captureConsent(1440);
  await captureConsent(390);
  await page.getByRole("button", { name: "Allow" }).click();

  await page.waitForURL(/\/oauth\/manual\?/u);
  const landed = new URL(page.url());
  expect(landed.searchParams.get("state")).toBe("e2e-state");
  expect(landed.searchParams.get("iss")).toBe(baseURL);
  const code = await page
    .getByRole("textbox", { name: "Authorization code" })
    .inputValue();
  expect(code.length).toBeGreaterThan(30);

  const exchange = await request.post("/oauth/token", {
    form: {
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: manual,
      resource: `${baseURL}/mcp`,
    },
  });
  expect(exchange.status()).toBe(200);
  const issued = Schema.decodeUnknownSync(Tokens)(await exchange.json());
  expect(issued.scope).toBe("brief services");
  await captureResponsive(page, testInfo, "oauth-manual");

  const agent = {
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${issued.access_token}`,
  };
  const tools = await request.post("/mcp", {
    data: { id: 1, jsonrpc: "2.0", method: "tools/list" },
    headers: agent,
  });
  expect(tools.status()).toBe(200);
  expect(await tools.text()).toContain("froggy_services");

  // `pay` was never asked for, so the signing endpoint refuses and says why.
  const pay = await request.post("/api/wallet/pay", {
    data: { challenge: {} },
    headers: agent,
  });
  expect(pay.status()).toBe(403);
  expect(pay.headers()["www-authenticate"]).toContain("insufficient_scope");
  expect(pay.headers()["www-authenticate"]).toContain('scope="pay"');

  // Disconnect, as Connections does, under the person's own token.
  const personToken = await page.evaluate(() =>
    localStorage.getItem("froggy.local-identity")
  );
  expect(personToken).not.toBeNull();
  const person = { authorization: `Bearer ${personToken}` };
  const agents = await request.get("/api/agents", { headers: person });
  const listed = Schema.decodeUnknownSync(Grants)(await agents.json());
  const grant = listed.grants.find((g) => g.clientName === "E2E MCP client");
  expect(grant?.scopes).toEqual(["brief", "services"]);
  expect(grant?.revokedAt).toBeNull();
  await page.goto("/agents");
  await expect(
    page.getByRole("button", { name: "Copy for your agent" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "E2E MCP client" })
  ).toBeVisible();
  await expect(page.getByText("Permissions: brief, services")).toBeVisible();
  await request.post("/mcp", {
    headers: agent,
    data: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "froggy_services" },
    },
  });
  await page.getByRole("link", { name: /E2E MCP client/u }).click();
  await expect(page).toHaveURL(new RegExp(`/agents/${grant?.id}$`, "u"));
  await expect(
    page.getByRole("region", { name: "Agent connection" })
  ).toContainText("brief, services");
  const history = page.getByRole("region", { name: "Invocation history" });
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await expect(history).toContainText("froggy_services");
  await expect(history).toContainText("insufficient scope");
  await page.getByRole("button", { name: "Disconnect E2E MCP client" }).click();
  await expect(
    page.getByText(/Disconnected .* History is kept\./u)
  ).toBeVisible();
  await expect(history.getByRole("listitem")).toHaveCount(2);

  const after = await request.post("/mcp", {
    data: { id: 2, jsonrpc: "2.0", method: "tools/list" },
    headers: agent,
  });
  expect(after.status()).toBe(401);
  expect(after.headers()["www-authenticate"]).toContain(
    `resource_metadata="${baseURL}/.well-known/oauth-protected-resource/mcp"`
  );
  expect(after.headers()["www-authenticate"]).toContain(
    'error="invalid_token"'
  );
  expect(errors).toEqual([]);
});
