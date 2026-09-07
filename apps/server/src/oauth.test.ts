import { describe, expect, it } from "bun:test";
import { createHash, randomBytes } from "node:crypto";

import { userId } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";
import { Schema } from "effect";

import { requiredScope } from "./agents";
import {
  handleOAuth,
  handleOAuthApi,
  insufficientScope,
  redirectMatches,
  resolveAccessToken,
  revokeGrant,
  unauthorizedMcp,
  validRedirectUri,
} from "./oauth";
import type { OAuthDeps } from "./oauth";

const ORIGIN = "https://froggy.test";
const ALICE = userId("did:privy:oauth-test");
const NOW = 1_756_000_000_000;
const MANUAL = `${ORIGIN}/oauth/manual`;
const LOOPBACK = "http://127.0.0.1/callback";

const depsAt = (
  now: number,
  store: OAuthDeps["store"] = memoryStore()
): OAuthDeps => ({
  appOrigin: ORIGIN,
  now: () => now,
  store,
});

const jsonPost = (path: string, json: string): Request =>
  new Request(`${ORIGIN}${path}`, {
    body: json,
    headers: { "content-type": "application/json" },
    method: "POST",
  });

const formPost = (path: string, fields: Record<string, string>): Request =>
  new Request(`${ORIGIN}${path}`, {
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

const get = (path: string): Request => new Request(`${ORIGIN}${path}`);

const AsMetadata = Schema.Struct({
  authorization_endpoint: Schema.String,
  authorization_response_iss_parameter_supported: Schema.Boolean,
  code_challenge_methods_supported: Schema.Array(Schema.String),
  grant_types_supported: Schema.Array(Schema.String),
  issuer: Schema.String,
  registration_endpoint: Schema.String,
  response_types_supported: Schema.Array(Schema.String),
  revocation_endpoint: Schema.String,
  scopes_supported: Schema.Array(Schema.String),
  token_endpoint: Schema.String,
  token_endpoint_auth_methods_supported: Schema.Array(Schema.String),
});
const ResourceMetadata = Schema.Struct({
  authorization_servers: Schema.Array(Schema.String),
  bearer_methods_supported: Schema.Array(Schema.String),
  resource: Schema.String,
});
const Registered = Schema.Struct({
  client_id: Schema.String,
  client_name: Schema.String,
  token_endpoint_auth_method: Schema.String,
});
const OAuthError = Schema.Struct({ error: Schema.String });
const Redirected = Schema.Struct({
  kind: Schema.Literals(["redirect"]),
  url: Schema.String,
});
const Refused = Schema.Struct({
  kind: Schema.Literals(["refused"]),
  reason: Schema.String,
});
const Tokens = Schema.Struct({
  access_token: Schema.String,
  expires_in: Schema.Finite,
  refresh_token: Schema.String,
  scope: Schema.String,
  token_type: Schema.String,
});
const asMetadata = Schema.decodeUnknownSync(AsMetadata);
const resourceMetadata = Schema.decodeUnknownSync(ResourceMetadata);
const registered = Schema.decodeUnknownSync(Registered);
const oauthError = Schema.decodeUnknownSync(OAuthError);
const redirected = Schema.decodeUnknownSync(Redirected);
const refused = Schema.decodeUnknownSync(Refused);
const tokens = Schema.decodeUnknownSync(Tokens);

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return {
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    verifier,
  };
};

const register = async (
  deps: OAuthDeps,
  redirectUris: readonly string[],
  name = "Claude Code"
): Promise<string> => {
  const response = await handleOAuth(
    deps,
    jsonPost(
      "/oauth/register",
      JSON.stringify({ client_name: name, redirect_uris: redirectUris })
    ),
    "/oauth/register"
  );
  expect(response?.status).toBe(201);
  return registered(await response?.json()).client_id;
};

interface ConsentInput {
  readonly decision?: "allow" | "deny";
  readonly granted?: readonly string[];
  readonly params: Record<string, string>;
}

const consent = async (
  deps: OAuthDeps,
  input: ConsentInput
): Promise<Response> => {
  const response = await handleOAuthApi(
    deps,
    jsonPost(
      "/api/oauth/consent",
      JSON.stringify({
        decision: input.decision ?? "allow",
        granted: input.granted ?? ["brief", "services"],
        params: input.params,
        v: 1,
      })
    ),
    ALICE,
    "/api/oauth/consent"
  );
  if (response === null) {
    throw new Error("consent route not matched");
  }
  return response;
};

/** The error a consent redirect carries, with the rest of the redirect checked on the way. */
const redirectError = async (response: Response): Promise<string | null> => {
  expect(response.status).toBe(200);
  const url = new URL(redirected(await response.json()).url);
  expect(url.origin + url.pathname).toBe(MANUAL);
  expect(url.searchParams.get("state")).toBe("xyz");
  expect(url.searchParams.get("iss")).toBe(ORIGIN);
  expect(url.searchParams.get("code")).toBeNull();
  return url.searchParams.get("error");
};

const authorizeParams = (
  clientId: string,
  challenge: string,
  redirectUri = MANUAL
) => ({
  client_id: clientId,
  code_challenge: challenge,
  code_challenge_method: "S256",
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "brief services",
  state: "xyz",
});

/** Register, consent and read the code off the redirect: the happy path up to the exchange. */
const codeFor = async (deps: OAuthDeps, redirectUri = MANUAL) => {
  const clientId = await register(deps, [redirectUri]);
  const { challenge, verifier } = pkce();
  const response = await consent(deps, {
    params: authorizeParams(clientId, challenge, redirectUri),
  });
  const { url } = redirected(await response.json());
  const code = new URL(url).searchParams.get("code");
  if (code === null) {
    throw new Error(`no code on ${url}`);
  }
  return { clientId, code, verifier };
};

const exchange = async (
  deps: OAuthDeps,
  fields: Record<string, string>
): Promise<Response> => {
  const response = await handleOAuth(
    deps,
    formPost("/oauth/token", fields),
    "/oauth/token"
  );
  if (response === null) {
    throw new Error("token route not matched");
  }
  return response;
};

const exchangeFields = (
  clientId: string,
  code: string,
  verifier: string,
  redirectUri = MANUAL
) => ({
  client_id: clientId,
  code,
  code_verifier: verifier,
  grant_type: "authorization_code",
  redirect_uri: redirectUri,
});

/** The whole happy path: a client, a consent, an exchange, the tokens. */
const issue = async (deps: OAuthDeps) => {
  const { clientId, code, verifier } = await codeFor(deps);
  const response = await exchange(
    deps,
    exchangeFields(clientId, code, verifier)
  );
  expect(response.status).toBe(200);
  return { clientId, issued: tokens(await response.json()) };
};

/** The error an exchange answers with. */
const exchangeError = async (
  deps: OAuthDeps,
  fields: Record<string, string>
): Promise<string> => {
  const response = await exchange(deps, fields);
  expect(response.status).toBe(400);
  return oauthError(await response.json()).error;
};

describe("metadata", () => {
  it("describes the authorization server as RFC 8414 asks, cacheable and cross-origin", async () => {
    const response = await handleOAuth(
      depsAt(NOW),
      get("/.well-known/oauth-authorization-server"),
      "/.well-known/oauth-authorization-server"
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response?.headers.get("access-control-allow-origin")).toBe("*");
    const body = asMetadata(await response?.json());
    expect(body.issuer).toBe(ORIGIN);
    expect(body.authorization_endpoint).toBe(`${ORIGIN}/oauth/authorize`);
    expect(body.token_endpoint).toBe(`${ORIGIN}/oauth/token`);
    expect(body.registration_endpoint).toBe(`${ORIGIN}/oauth/register`);
    expect(body.revocation_endpoint).toBe(`${ORIGIN}/oauth/revoke`);
    expect(body.response_types_supported).toEqual(["code"]);
    expect(body.grant_types_supported).toEqual([
      "authorization_code",
      "refresh_token",
    ]);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(body.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(body.scopes_supported).toEqual([
      "brief",
      "browse",
      "pay",
      "services",
    ]);
    expect(body.authorization_response_iss_parameter_supported).toBe(true);
  });

  it("names /mcp as the protected resource at both metadata paths", async () => {
    const bodies = await Promise.all(
      [
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
      ].map(async (path) => {
        const response = await handleOAuth(depsAt(NOW), get(path), path);
        return resourceMetadata(await response?.json());
      })
    );
    for (const body of bodies) {
      expect(body.resource).toBe(`${ORIGIN}/mcp`);
      expect(body.authorization_servers).toEqual([ORIGIN]);
      expect(body.bearer_methods_supported).toEqual(["header"]);
    }
  });

  it("answers a preflight on the public endpoints and nothing else", async () => {
    const preflight = await handleOAuth(
      depsAt(NOW),
      new Request(`${ORIGIN}/oauth/token`, { method: "OPTIONS" }),
      "/oauth/token"
    );
    expect(preflight?.status).toBe(204);
    expect(preflight?.headers.get("access-control-allow-origin")).toBe("*");
    expect(
      await handleOAuth(depsAt(NOW), get("/api/wallet"), "/api/wallet")
    ).toBeNull();
  });
});

describe("registration", () => {
  it("accepts https, loopback http and the manual page, and answers with no secret", async () => {
    const deps = depsAt(NOW);
    const response = await handleOAuth(
      deps,
      jsonPost(
        "/oauth/register",
        JSON.stringify({
          client_name: "Cursor",
          redirect_uris: [
            "https://cursor.com/oauth/callback",
            "http://localhost:3000/cb",
            "http://[::1]:8080/cb",
            LOOPBACK,
            MANUAL,
          ],
        })
      ),
      "/oauth/register"
    );
    expect(response?.status).toBe(201);
    const text = await response?.text();
    const body = registered(JSON.parse(text ?? ""));
    expect(body.client_id.startsWith("oac_")).toBe(true);
    expect(body.client_name).toBe("Cursor");
    expect(body.token_endpoint_auth_method).toBe("none");
    expect(text).not.toContain("client_secret");
  });

  it("refuses a fragment, plain http off loopback, and a confidential client", async () => {
    const deps = depsAt(NOW);
    const cases = [
      [
        JSON.stringify({ redirect_uris: ["https://a.test/cb#frag"] }),
        "invalid_redirect_uri",
      ],
      [
        JSON.stringify({ redirect_uris: ["http://example.com/cb"] }),
        "invalid_redirect_uri",
      ],
      [JSON.stringify({ redirect_uris: [] }), "invalid_redirect_uri"],
      [
        JSON.stringify({
          redirect_uris: [LOOPBACK],
          token_endpoint_auth_method: "client_secret_post",
        }),
        "invalid_client_metadata",
      ],
      [JSON.stringify({ client_name: "no uris" }), "invalid_client_metadata"],
      ["{", "invalid_client_metadata"],
    ] as const;
    const errors = await Promise.all(
      cases.map(async ([json]) => {
        const response = await handleOAuth(
          deps,
          jsonPost("/oauth/register", json),
          "/oauth/register"
        );
        expect(response?.status).toBe(400);
        return oauthError(await response?.json()).error;
      })
    );
    expect(errors).toEqual(cases.map(([, error]) => error));
    expect(validRedirectUri("not a url", ORIGIN)).toBe(false);
  });
});

describe("consent", () => {
  it("refuses an unknown client or an unregistered redirect without redirecting", async () => {
    const deps = depsAt(NOW);
    const { challenge } = pkce();
    const unknown = await consent(deps, {
      params: authorizeParams("oac_01h455vb4pex5vsknk084sn02q", challenge),
    });
    expect(unknown.status).toBe(400);
    expect(refused(await unknown.json()).reason).toBe("Unknown client.");
    const clientId = await register(deps, [MANUAL]);
    const elsewhere = await consent(deps, {
      params: authorizeParams(clientId, challenge, "https://evil.test/cb"),
    });
    expect(elsewhere.status).toBe(400);
    expect(refused(await elsewhere.json()).reason).toContain(
      "did not register"
    );
  });

  it("lets a loopback redirect vary its port, and nothing else", async () => {
    const deps = depsAt(NOW);
    const { challenge } = pkce();
    const clientId = await register(deps, [
      LOOPBACK,
      "http://localhost:3000/cb",
    ]);
    const ported = await consent(deps, {
      params: authorizeParams(
        clientId,
        challenge,
        "http://127.0.0.1:53211/callback"
      ),
    });
    expect(ported.status).toBe(200);
    expect(redirected(await ported.json()).url).toContain(
      "http://127.0.0.1:53211/callback?code="
    );
    const otherLocalhost = await consent(deps, {
      params: authorizeParams(clientId, challenge, "http://localhost:4000/cb"),
    });
    expect(otherLocalhost.status).toBe(400);
    expect(redirectMatches("http://[::1]/cb", "http://[::1]:9000/cb")).toBe(
      true
    );
    expect(redirectMatches(LOOPBACK, "http://127.0.0.1:9000/other")).toBe(
      false
    );
    expect(redirectMatches("https://a.test/cb", "https://a.test:8443/cb")).toBe(
      false
    );
  });

  it("sends every other refusal back to the client with state and iss", async () => {
    const deps = depsAt(NOW);
    const clientId = await register(deps, [MANUAL]);
    const { challenge } = pkce();
    const base = authorizeParams(clientId, challenge);
    const cases: readonly (readonly [ConsentInput, string])[] = [
      [
        { params: { ...base, response_type: "token" } },
        "unsupported_response_type",
      ],
      [{ params: { ...base, code_challenge: "" } }, "invalid_request"],
      [
        { params: { ...base, code_challenge_method: "plain" } },
        "invalid_request",
      ],
      [
        { params: { ...base, resource: "https://other.test/mcp" } },
        "invalid_target",
      ],
      [{ params: { ...base, scope: "brief admin" } }, "invalid_scope"],
      [{ granted: ["pay"], params: base }, "invalid_scope"],
      [{ decision: "deny", params: base }, "access_denied"],
      [{ granted: [], params: base }, "access_denied"],
    ];
    const errors = await Promise.all(
      cases.map(
        async ([input]) => await redirectError(await consent(deps, input))
      )
    );
    expect(errors).toEqual(cases.map(([, error]) => error));
  });

  it("issues a code bound to the granted scopes, and the page can name the client", async () => {
    const deps = depsAt(NOW);
    const clientId = await register(deps, [MANUAL], "Hermes");
    const { challenge, verifier } = pkce();
    const response = await consent(deps, {
      granted: ["services"],
      params: {
        ...authorizeParams(clientId, challenge),
        resource: `${ORIGIN}/mcp`,
      },
    });
    const url = new URL(redirected(await response.json()).url);
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(url.searchParams.get("iss")).toBe(ORIGIN);
    const code = url.searchParams.get("code") ?? "";
    expect(code.length).toBeGreaterThan(30);
    const issued = await exchange(deps, {
      ...exchangeFields(clientId, code, verifier),
      resource: `${ORIGIN}/mcp`,
    });
    expect(issued.status).toBe(200);
    expect(tokens(await issued.json()).scope).toBe("services");
    const lookup = await handleOAuthApi(
      deps,
      get(`/api/oauth/client/${clientId}`),
      ALICE,
      `/api/oauth/client/${clientId}`
    );
    expect(await lookup?.json()).toEqual({
      client: { id: clientId, name: "Hermes", redirectUris: [MANUAL] },
      v: 1,
    });
    const listed = await deps.store.oauth.grants.list(ALICE);
    expect(listed[0]?.clientName).toBe("Hermes");
    expect(listed[0]?.scopes).toEqual(["services"]);
  });
});

describe("the token endpoint", () => {
  it("exchanges a code once, with PKCE, and revokes everything on a replay", async () => {
    const deps = depsAt(NOW);
    const { clientId, code, verifier } = await codeFor(deps);
    const first = await exchange(
      deps,
      exchangeFields(clientId, code, verifier)
    );
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("access-control-allow-origin")).toBe("*");
    const issued = tokens(await first.json());
    expect(issued.access_token.startsWith("fga_")).toBe(true);
    expect(issued.refresh_token.startsWith("fgr_")).toBe(true);
    expect(issued.token_type).toBe("Bearer");
    expect(issued.expires_in).toBe(3600);
    expect(issued.scope).toBe("brief services");
    const resolved = await resolveAccessToken(
      deps.store,
      issued.access_token,
      NOW + 1
    );
    expect(resolved?.userId).toBe(ALICE);
    expect(resolved?.grant.scopes).toEqual(["brief", "services"]);

    expect(
      await exchangeError(deps, exchangeFields(clientId, code, verifier))
    ).toBe("invalid_grant");
    expect(
      await resolveAccessToken(deps.store, issued.access_token, NOW + 2)
    ).toBeNull();
  });

  it("refuses a wrong verifier, redirect, client or resource, and a stale code", async () => {
    const deps = depsAt(NOW);
    const { clientId, code, verifier } = await codeFor(deps);
    const other = await register(deps, [MANUAL], "Other");
    const cases = [
      [exchangeFields(clientId, code, pkce().verifier), "invalid_grant"],
      [
        exchangeFields(clientId, code, verifier, `${ORIGIN}/oauth/manual?x=1`),
        "invalid_grant",
      ],
      [exchangeFields(other, code, verifier), "invalid_grant"],
      [
        {
          ...exchangeFields(clientId, code, verifier),
          resource: "https://x.test",
        },
        "invalid_target",
      ],
      [exchangeFields(clientId, "fgx_nope", verifier), "invalid_grant"],
      [{ grant_type: "password" }, "unsupported_grant_type"],
      [{ grant_type: "authorization_code" }, "invalid_request"],
    ] as const;
    const errors = await Promise.all(
      cases.map(async ([fields]) => await exchangeError(deps, fields))
    );
    expect(errors).toEqual(cases.map(([, error]) => error));
    // None of those spent the code; the right request still works, until it is old.
    expect(
      await exchangeError(
        depsAt(NOW + 11 * 60 * 1000, deps.store),
        exchangeFields(clientId, code, verifier)
      )
    ).toBe("invalid_grant");
  });

  it("reads JSON as well as a form, and refuses a body over the cap", async () => {
    const deps = depsAt(NOW);
    const { clientId, code, verifier } = await codeFor(deps);
    const response = await handleOAuth(
      deps,
      jsonPost(
        "/oauth/token",
        JSON.stringify(exchangeFields(clientId, code, verifier))
      ),
      "/oauth/token"
    );
    expect(response?.status).toBe(200);
    const huge = await handleOAuth(
      deps,
      jsonPost(
        "/oauth/token",
        JSON.stringify({ grant_type: "x".repeat(9000) })
      ),
      "/oauth/token"
    );
    expect(huge?.status).toBe(400);
    expect(oauthError(await huge?.json()).error).toBe("invalid_request");
  });

  it("rotates refresh tokens and revokes the grant when an old one is reused", async () => {
    const deps = depsAt(NOW);
    const { clientId, issued } = await issue(deps);
    const rotated = await exchange(deps, {
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: issued.refresh_token,
    });
    expect(rotated.status).toBe(200);
    const next = tokens(await rotated.json());
    expect(next.refresh_token).not.toBe(issued.refresh_token);
    expect(next.access_token).not.toBe(issued.access_token);
    expect(
      await resolveAccessToken(deps.store, next.access_token, NOW + 1)
    ).not.toBeNull();

    expect(
      await exchangeError(deps, {
        grant_type: "refresh_token",
        refresh_token: issued.refresh_token,
      })
    ).toBe("invalid_grant");
    expect(
      await resolveAccessToken(deps.store, next.access_token, NOW + 2)
    ).toBeNull();
    const listed = await deps.store.oauth.grants.list(ALICE);
    expect(listed[0]?.revokedAt).toBe(NOW);
  });

  it("stops resolving an access token after an hour", async () => {
    const deps = depsAt(NOW);
    const { issued } = await issue(deps);
    expect(
      await resolveAccessToken(deps.store, issued.access_token, NOW + 3_599_000)
    ).not.toBeNull();
    expect(
      await resolveAccessToken(deps.store, issued.access_token, NOW + 3_600_000)
    ).toBeNull();
    expect(await resolveAccessToken(deps.store, "fgy_legacy", NOW)).toBeNull();
    expect(await resolveAccessToken(deps.store, "fga_unknown", NOW)).toBeNull();
  });
});

describe("revocation", () => {
  it("answers 200 whatever it is given, and a known token takes its grant down", async () => {
    const deps = depsAt(NOW);
    const { issued } = await issue(deps);
    const unknown = await handleOAuth(
      deps,
      formPost("/oauth/revoke", { token: "fgr_never" }),
      "/oauth/revoke"
    );
    expect(unknown?.status).toBe(200);
    const garbage = await handleOAuth(
      deps,
      new Request(`${ORIGIN}/oauth/revoke`, { body: "{", method: "POST" }),
      "/oauth/revoke"
    );
    expect(garbage?.status).toBe(200);
    const revoked = await handleOAuth(
      deps,
      formPost("/oauth/revoke", { token: issued.refresh_token }),
      "/oauth/revoke"
    );
    expect(revoked?.status).toBe(200);
    expect(
      await resolveAccessToken(deps.store, issued.access_token, NOW + 1)
    ).toBeNull();
    const listed = await deps.store.oauth.grants.list(ALICE);
    expect(listed[0]?.revokedAt).toBe(NOW);
  });

  it("disconnects from the Agents page by grant id, for its owner only", async () => {
    const deps = depsAt(NOW);
    const { issued } = await issue(deps);
    const listed = await deps.store.oauth.grants.list(ALICE);
    const id = listed[0]?.id;
    if (id === undefined) {
      throw new Error("no grant");
    }
    expect(
      await revokeGrant(deps.store, userId("did:privy:bob"), id, NOW + 1)
    ).toBe(false);
    expect(
      await resolveAccessToken(deps.store, issued.access_token, NOW + 1)
    ).not.toBeNull();
    expect(await revokeGrant(deps.store, ALICE, id, NOW + 2)).toBe(true);
    expect(
      await resolveAccessToken(deps.store, issued.access_token, NOW + 3)
    ).toBeNull();
  });
});

describe("scopes on the router", () => {
  it("needs pay for the signing endpoint, services for a purchase, nothing for reads", () => {
    expect(requiredScope("/api/wallet/pay", "POST")).toBe("pay");
    expect(requiredScope("/api/services/run", "POST")).toBe("services");
    expect(requiredScope("/api/services", "GET")).toBeNull();
    expect(requiredScope("/api/tasks", "POST")).toBeNull();
    expect(requiredScope("/api/tasks", "GET")).toBeNull();
    expect(requiredScope("/mcp", "POST")).toBeNull();
    expect(requiredScope("/api/wallet", "GET")).toBeNull();
  });

  it("says which scope was missing, and where the metadata is", async () => {
    const forbidden = insufficientScope("pay");
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("www-authenticate")).toBe(
      'Bearer error="insufficient_scope", scope="pay"'
    );
    const bare = unauthorizedMcp(ORIGIN, false);
    expect(bare.status).toBe(401);
    expect(bare.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`
    );
    const presented = unauthorizedMcp(ORIGIN, true);
    expect(presented.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp", error="invalid_token"`
    );
    expect(await presented.json()).toEqual({ error: "Sign in to use this." });
  });
});
