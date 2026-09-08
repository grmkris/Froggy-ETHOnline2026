import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  OAuthClientId,
  OAuthGrantId,
  OAUTH_SCOPES,
  OAUTH_REFRESH_TOKEN_PREFIX,
  userId,
} from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";

import { handleOAuth, resolveAccessToken } from "./oauth";

const runPair = async (refuse: boolean) => {
  const store = memoryStore();
  const now = Date.now();
  const owner = userId("did:privy:cli-test");
  const clientId = OAuthClientId.generate();
  const grantId = OAuthGrantId.generate();
  const refresh = `${OAUTH_REFRESH_TOKEN_PREFIX}fixture-only`;
  await store.oauth.clients.create({
    id: clientId,
    name: "test",
    createdAt: now,
    redirectUris: ["http://127.0.0.1/callback"],
  });
  await store.oauth.grants.create(owner, {
    id: grantId,
    clientId,
    clientName: "test",
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
    scopes: OAUTH_SCOPES,
  });
  await store.oauth.tokens.insert({
    hash: createHash("sha256").update(refresh).digest("hex"),
    kind: "refresh",
    grantId,
    createdAt: now,
    expiresAt: now + 3_600_000,
    revokedAt: null,
    usedAt: null,
    codeChallenge: null,
    redirectUri: null,
    resource: null,
    scopes: OAUTH_SCOPES,
  });
  let attempts = 0;
  let origin = "";
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === "/oauth/token") {
        attempts += 1;
        await Bun.sleep(200);
        if (refuse) {
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        }
        return (
          (await handleOAuth(
            { appOrigin: origin, store },
            request,
            pathname
          )) ?? new Response(null, { status: 404 })
        );
      }
      const token = request.headers.get("authorization")?.slice(7) ?? "";
      return (await resolveAccessToken(store, token, Date.now())) === null
        ? new Response(null, { status: 401 })
        : Response.json({ tasks: [] });
    },
  });
  origin = `http://127.0.0.1:${server.port}`;
  const config = await mkdtemp(path.join(tmpdir(), "froggy-cli-test-"));
  const credentials = path.join(config, "froggy", "credentials.json");
  try {
    await mkdir(path.dirname(credentials), { recursive: true });
    await Bun.write(
      credentials,
      JSON.stringify({
        v: 1,
        url: origin,
        clientId,
        accessToken: "expired-fixture",
        refreshToken: refresh,
        expiresAt: now - 1000,
        tokenEndpoint: `${origin}/oauth/token`,
        revocationEndpoint: `${origin}/oauth/revoke`,
      })
    );
    const processes = [1, 2].map(() =>
      Bun.spawn(
        [
          process.execPath,
          path.join(import.meta.dir, "cli", "froggy.ts"),
          "tasks",
        ],
        {
          env: {
            ...process.env,
            XDG_CONFIG_HOME: config,
            FROGGY_TOKEN: "",
            FROGGY_URL: origin,
          },
          stdout: "pipe",
          stderr: "pipe",
        }
      )
    );
    const results = await Promise.all(
      processes.map(async (process) => ({
        code: await process.exited,
        output: await new Response(process.stdout).text(),
        error: await new Response(process.stderr).text(),
      }))
    );
    const grant = await store.oauth.grants.byId(grantId);
    const file = await stat(credentials);
    return {
      attempts,
      results,
      revoked: grant?.grant.revokedAt,
      mode: file.mode % 0o1000,
    };
  } finally {
    await server.stop(true);
    await rm(config, { recursive: true, force: true });
  }
};
describe("CLI credentials", () => {
  test("concurrent commands rotate once and retain the connection", async () => {
    const result = await runPair(false);
    expect(result.attempts).toBe(1);
    expect(result.revoked).toBeNull();
    expect(result.mode).toBe(0o600);
    expect(result.results.map((entry) => entry.code)).toEqual([0, 0]);
    expect(
      result.results.every((entry) => entry.output.includes('"tasks":[]'))
    ).toBe(true);
  });
  test("authentication failure makes tasks exit unsuccessfully", async () => {
    const result = await runPair(true);
    expect(result.results.every((entry) => entry.code !== 0)).toBe(true);
  });
});
