/**
 * The OAuth 2.1 authorization server in front of `/mcp`.
 *
 * An MCP client (Claude Code, Cursor, the Inspector, our own CLI) discovers
 * this server from the protected-resource metadata, registers itself,
 * sends the person to `/oauth/authorize` in their browser, and exchanges
 * the code it gets back for an access token bound to that person's
 * workspace and the scopes they left on. No secret is ever pasted.
 *
 * Hand-rolled on purpose: the surface is five endpoints and every wire
 * shape is an Effect Schema, which the SDK's Express-shaped helpers would
 * not give us. Public clients only (PKCE S256 is mandatory), codes are
 * single use, refresh tokens rotate and a reused one revokes the grant.
 * Nothing here changes spending authority: a scope names what an agent may
 * buy, never what a person may change.
 *
 * CORS is `*` on the public endpoints in this file and nowhere else: the
 * metadata, registration, token and revocation endpoints are reached from
 * other origins by design. `/mcp` itself is not, which is why a browser-based
 * MCP client is out of scope this week (ADR 0012).
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  OAUTH_ACCESS_TOKEN_PREFIX,
  OAUTH_REFRESH_TOKEN_PREFIX,
  OAUTH_SCOPES,
  OAuthClientId,
  OAuthGrantId,
  OAuthScope,
} from "@froggy/domain";
import type { OAuthClient, OAuthGrant, UserId } from "@froggy/domain";
import type { OAuthTokenRow, Store } from "@froggy/wallet";
import { Result, Schema } from "effect";

import { detached } from "./detached";
import { boundedBytes } from "./service-providers";

const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BODY_CAP_BYTES = 8 * 1024;
const MCP_PATH = "/mcp";
const MANUAL_PATH = "/oauth/manual";
const AUTHORIZE_PATH = "/oauth/authorize";
const REGISTER_PATH = "/oauth/register";
const TOKEN_PATH = "/oauth/token";
const REVOKE_PATH = "/oauth/revoke";
const AS_METADATA_PATH = "/.well-known/oauth-authorization-server";
const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
const RESOURCE_METADATA_MCP_PATH = `${RESOURCE_METADATA_PATH}/mcp`;
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  AS_METADATA_PATH,
  RESOURCE_METADATA_PATH,
  RESOURCE_METADATA_MCP_PATH,
  REGISTER_PATH,
  TOKEN_PATH,
  REVOKE_PATH,
]);
/** `http` redirects are allowed only here (RFC 8252 §7.3, plus `localhost`). */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "127.0.0.1",
  "[::1]",
  "localhost",
]);
/** Where a port may differ between registration and use: the two IP loopbacks. */
const PORT_FLEXIBLE_HOSTS: ReadonlySet<string> = new Set([
  "127.0.0.1",
  "[::1]",
]);
const MAX_REDIRECT_URIS = 10;
const CLIENT_NAME_MAX = 80;

export interface OAuthDeps {
  readonly appOrigin: string;
  readonly now?: () => number;
  readonly store: Pick<Store, "oauth">;
}

/** Wire shapes, RFC names, snake case on purpose. */
interface AuthorizationServerMetadata {
  readonly authorization_endpoint: string;
  readonly authorization_response_iss_parameter_supported: true;
  readonly code_challenge_methods_supported: readonly ["S256"];
  readonly grant_types_supported: readonly [
    "authorization_code",
    "refresh_token",
  ];
  readonly issuer: string;
  readonly registration_endpoint: string;
  readonly response_types_supported: readonly ["code"];
  readonly revocation_endpoint: string;
  readonly revocation_endpoint_auth_methods_supported: readonly ["none"];
  readonly scopes_supported: readonly OAuthScope[];
  readonly token_endpoint: string;
  readonly token_endpoint_auth_methods_supported: readonly ["none"];
}

interface ProtectedResourceMetadata {
  readonly authorization_servers: readonly string[];
  readonly bearer_methods_supported: readonly ["header"];
  readonly resource: string;
  readonly scopes_supported: readonly OAuthScope[];
}

interface RegistrationResponse {
  readonly client_id: OAuthClientId;
  readonly client_id_issued_at: number;
  readonly client_name: string;
  readonly grant_types: readonly ["authorization_code", "refresh_token"];
  readonly redirect_uris: readonly string[];
  readonly response_types: readonly ["code"];
  readonly token_endpoint_auth_method: "none";
}

interface TokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
  readonly refresh_token: string;
  readonly scope: string;
  readonly token_type: "Bearer";
}

/** RFC 6749 §5.2 and RFC 7591 §3.2.2 share one error shape. */
interface OAuthErrorBody {
  readonly error: string;
  readonly error_description: string;
}

interface ConsentRefused {
  readonly kind: "refused";
  readonly reason: string;
  readonly v: 1;
}

interface ConsentRedirect {
  readonly kind: "redirect";
  readonly url: string;
  readonly v: 1;
}

interface ClientView {
  readonly client: {
    readonly id: OAuthClientId;
    readonly name: string;
    readonly redirectUris: readonly string[];
  };
  readonly v: 1;
}

interface NotFoundBody {
  readonly error: string;
}

type PublicBody =
  | AuthorizationServerMetadata
  | OAuthErrorBody
  | ProtectedResourceMetadata
  | RegistrationResponse
  | TokenResponse;

type ApiBody = ClientView | ConsentRedirect | ConsentRefused | NotFoundBody;

const CORS_HEADERS = {
  "access-control-allow-headers":
    "content-type, authorization, mcp-protocol-version",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-origin": "*",
} as const;

const publicJson = (
  body: PublicBody,
  status = 200,
  cacheControl = "no-store"
): Response =>
  Response.json(body, {
    headers: { ...CORS_HEADERS, "cache-control": cacheControl },
    status,
  });

const apiJson = (body: ApiBody, status = 200): Response =>
  Response.json(body, { headers: { "cache-control": "no-store" }, status });

const oauthError = (
  error: string,
  description: string,
  status = 400
): Response => publicJson({ error, error_description: description }, status);

const sha256Hex = (secret: string): string =>
  createHash("sha256").update(secret).digest("hex");

const randomToken = (prefix: string): string =>
  `${prefix}${randomBytes(32).toString("base64url")}`;

const resourceOf = (origin: string): string => `${origin}${MCP_PATH}`;

/** Where a 401 on `/mcp` points a client (RFC 9728). */
const resourceMetadataUrl = (origin: string): string =>
  `${origin}${RESOURCE_METADATA_MCP_PATH}`;

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

const authorizationServerMetadata = (
  origin: string
): AuthorizationServerMetadata => ({
  authorization_endpoint: `${origin}${AUTHORIZE_PATH}`,
  authorization_response_iss_parameter_supported: true,
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  issuer: origin,
  registration_endpoint: `${origin}${REGISTER_PATH}`,
  response_types_supported: ["code"],
  revocation_endpoint: `${origin}${REVOKE_PATH}`,
  revocation_endpoint_auth_methods_supported: ["none"],
  scopes_supported: OAUTH_SCOPES,
  token_endpoint: `${origin}${TOKEN_PATH}`,
  token_endpoint_auth_methods_supported: ["none"],
});

const protectedResourceMetadata = (
  origin: string
): ProtectedResourceMetadata => ({
  authorization_servers: [origin],
  bearer_methods_supported: ["header"],
  resource: resourceOf(origin),
  scopes_supported: OAUTH_SCOPES,
});

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

/** JSON or a form, capped, decoded. Null when unreadable, over the cap or not the shape. */
const readBody = async <S extends Schema.Codec<unknown>>(
  request: Request,
  schema: S
): Promise<S["Type"] | null> => {
  let text: string;
  try {
    text = new TextDecoder().decode(
      await boundedBytes(new Response(request.body), BODY_CAP_BYTES)
    );
  } catch {
    return null;
  }
  const decode = Schema.decodeUnknownResult(schema);
  const type = request.headers.get("content-type") ?? "";
  let parsed: Result.Result<S["Type"], Schema.SchemaError>;
  if (type.startsWith("application/x-www-form-urlencoded")) {
    parsed = decode(Object.fromEntries(new URLSearchParams(text)));
  } else {
    try {
      parsed = decode(JSON.parse(text));
    } catch {
      return null;
    }
  }
  return Result.isSuccess(parsed) ? parsed.success : null;
};

const RegistrationBody = Schema.Struct({
  client_name: Schema.optional(Schema.String),
  grant_types: Schema.optional(Schema.Array(Schema.String)),
  redirect_uris: Schema.Array(Schema.String),
  response_types: Schema.optional(Schema.Array(Schema.String)),
  token_endpoint_auth_method: Schema.optional(Schema.String),
});

const TokenBody = Schema.Struct({
  client_id: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
  code_verifier: Schema.optional(Schema.String),
  grant_type: Schema.optional(Schema.String),
  redirect_uri: Schema.optional(Schema.String),
  refresh_token: Schema.optional(Schema.String),
  resource: Schema.optional(Schema.String),
});
type TokenBody = typeof TokenBody.Type;

const RevocationBody = Schema.Struct({
  token: Schema.String,
  token_type_hint: Schema.optional(Schema.String),
});

/** The authorization request as the consent page relays it, names as the query carried them. */
const AuthorizationParams = Schema.Struct({
  client_id: Schema.String,
  code_challenge: Schema.optional(Schema.String),
  code_challenge_method: Schema.optional(Schema.String),
  redirect_uri: Schema.String,
  resource: Schema.optional(Schema.String),
  response_type: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
});
type AuthorizationParams = typeof AuthorizationParams.Type;

const ConsentBody = Schema.Struct({
  decision: Schema.Literals(["allow", "deny"]),
  /** The scopes the person left on. Ignored on deny. */
  granted: Schema.Array(Schema.String),
  params: AuthorizationParams,
  v: Schema.Literals([1]),
});

// ---------------------------------------------------------------------------
// Redirect URIs
// ---------------------------------------------------------------------------

const parseUrl = (candidate: string): URL | null => {
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
};

/**
 * What a client may register: absolute, no fragment, `https`, or `http` on
 * a loopback host, or exactly this server's own manual page.
 */
export const validRedirectUri = (uri: string, origin: string): boolean => {
  if (uri.includes("#")) {
    return false;
  }
  const url = parseUrl(uri);
  if (url === null) {
    return false;
  }
  if (url.protocol === "https:") {
    return true;
  }
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) {
    return true;
  }
  return uri === `${origin}${MANUAL_PATH}`;
};

/** Exact, except that a loopback IP redirect may use any port (RFC 8252 §7.3). */
export const redirectMatches = (
  registered: string,
  presented: string
): boolean => {
  if (registered === presented) {
    return true;
  }
  const a = parseUrl(registered);
  const b = parseUrl(presented);
  if (a === null || b === null || !PORT_FLEXIBLE_HOSTS.has(a.hostname)) {
    return false;
  }
  return (
    a.protocol === b.protocol &&
    a.hostname === b.hostname &&
    a.pathname === b.pathname &&
    a.search === b.search
  );
};

const redirectWith = (
  redirectUri: string,
  entries: readonly (readonly [string, string | undefined])[]
): string => {
  const url = new URL(redirectUri);
  for (const [key, value] of entries) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
};

// ---------------------------------------------------------------------------
// Registration (RFC 7591)
// ---------------------------------------------------------------------------

const handleRegister = async (
  deps: OAuthDeps,
  request: Request
): Promise<Response> => {
  const body = await readBody(request, RegistrationBody);
  if (body === null) {
    return oauthError(
      "invalid_client_metadata",
      "Send {redirect_uris: [...]} and optionally client_name."
    );
  }
  if (
    body.redirect_uris.length === 0 ||
    body.redirect_uris.length > MAX_REDIRECT_URIS
  ) {
    return oauthError(
      "invalid_redirect_uri",
      `Register between 1 and ${MAX_REDIRECT_URIS} redirect URIs.`
    );
  }
  const bad = body.redirect_uris.find(
    (uri) => !validRedirectUri(uri, deps.appOrigin)
  );
  if (bad !== undefined) {
    return oauthError(
      "invalid_redirect_uri",
      `${bad} is not allowed: use https, http on a loopback host, or ${deps.appOrigin}${MANUAL_PATH}.`
    );
  }
  const method = body.token_endpoint_auth_method ?? "none";
  if (method !== "none") {
    return oauthError(
      "invalid_client_metadata",
      "Only public clients: token_endpoint_auth_method must be none."
    );
  }
  const name = (body.client_name ?? "").trim();
  const client: OAuthClient = {
    createdAt: (deps.now ?? Date.now)(),
    id: OAuthClientId.generate(),
    name: name === "" ? "MCP client" : name.slice(0, CLIENT_NAME_MAX),
    redirectUris: body.redirect_uris,
  };
  await deps.store.oauth.clients.create(client);
  return publicJson(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt / 1000),
      client_name: client.name,
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: client.redirectUris,
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201
  );
};

// ---------------------------------------------------------------------------
// Consent (the authorize endpoint's decision, posted by the page)
// ---------------------------------------------------------------------------

const CHALLENGE_MIN = 43;
const CHALLENGE_MAX = 128;

const decodeScope = Schema.decodeUnknownResult(OAuthScope);

/** The scopes a space-separated list names, all of them when absent, null on an unknown one. */
const requestedScopes = (
  scope: string | undefined
): readonly OAuthScope[] | null => {
  if (scope === undefined || scope.trim() === "") {
    return OAUTH_SCOPES;
  }
  const names = scope.split(" ").filter((name) => name !== "");
  const scopes: OAuthScope[] = [];
  for (const name of names) {
    const decoded = decodeScope(name);
    if (decoded._tag === "Failure") {
      return null;
    }
    scopes.push(decoded.success);
  }
  return scopes;
};

/** The error an otherwise well-addressed request earns, or null. */
const authorizationError = (
  params: AuthorizationParams,
  origin: string
): string | null => {
  if ((params.response_type ?? "code") !== "code") {
    return "unsupported_response_type";
  }
  const challenge = params.code_challenge ?? "";
  if (
    params.code_challenge_method !== "S256" ||
    challenge.length < CHALLENGE_MIN ||
    challenge.length > CHALLENGE_MAX
  ) {
    return "invalid_request";
  }
  if (params.resource !== undefined && params.resource !== resourceOf(origin)) {
    return "invalid_target";
  }
  return null;
};

/** The scopes to grant: what the person left on, as long as each was asked for. */
const grantedScopes = (
  granted: readonly string[],
  requested: readonly OAuthScope[]
): readonly OAuthScope[] | null => {
  const scopes: OAuthScope[] = [];
  for (const name of granted) {
    const decoded = decodeScope(name);
    if (decoded._tag === "Failure" || !requested.includes(decoded.success)) {
      return null;
    }
    if (!scopes.includes(decoded.success)) {
      scopes.push(decoded.success);
    }
  }
  return scopes;
};

const issueCode = async (
  deps: OAuthDeps,
  client: OAuthClient,
  userId: UserId,
  params: AuthorizationParams,
  scopes: readonly OAuthScope[]
): Promise<string> => {
  const now = (deps.now ?? Date.now)();
  const grant: OAuthGrant = {
    clientId: client.id,
    clientName: client.name,
    createdAt: now,
    id: OAuthGrantId.generate(),
    lastUsedAt: null,
    revokedAt: null,
    scopes,
  };
  await deps.store.oauth.grants.create(userId, grant);
  const code = randomBytes(32).toString("base64url");
  await deps.store.oauth.tokens.insert({
    codeChallenge: params.code_challenge ?? null,
    createdAt: now,
    expiresAt: now + CODE_TTL_MS,
    grantId: grant.id,
    hash: sha256Hex(code),
    kind: "code",
    redirectUri: params.redirect_uri,
    resource: params.resource ?? null,
    revokedAt: null,
    scopes,
    usedAt: null,
  });
  return code;
};

const handleConsent = async (
  deps: OAuthDeps,
  request: Request,
  userId: UserId
): Promise<Response> => {
  const body = await readBody(request, ConsentBody);
  if (body === null) {
    return apiJson(
      { kind: "refused", reason: "Malformed consent.", v: 1 },
      400
    );
  }
  const { decision, granted, params } = body;
  // The client and its redirect are checked before anything is sent
  // anywhere: an unknown client or a redirect it did not register never
  // receives a code or an error, only the person sees the refusal.
  const client = OAuthClientId.is(params.client_id)
    ? await deps.store.oauth.clients.byId(params.client_id)
    : null;
  if (client === null) {
    return apiJson({ kind: "refused", reason: "Unknown client.", v: 1 }, 400);
  }
  if (
    !client.redirectUris.some((uri) =>
      redirectMatches(uri, params.redirect_uri)
    )
  ) {
    return apiJson(
      {
        kind: "refused",
        reason: "The client asked to return somewhere it did not register.",
        v: 1,
      },
      400
    );
  }
  const redirect = (
    entries: readonly (readonly [string, string | undefined])[]
  ) =>
    apiJson({
      kind: "redirect",
      url: redirectWith(params.redirect_uri, [
        ...entries,
        ["state", params.state],
        ["iss", deps.appOrigin],
      ]),
      v: 1,
    });
  const error = authorizationError(params, deps.appOrigin);
  if (error !== null) {
    return redirect([["error", error]]);
  }
  const requested = requestedScopes(params.scope);
  if (requested === null) {
    return redirect([["error", "invalid_scope"]]);
  }
  const scopes = decision === "allow" ? grantedScopes(granted, requested) : [];
  if (scopes === null) {
    return redirect([["error", "invalid_scope"]]);
  }
  if (decision === "deny" || scopes.length === 0) {
    return redirect([["error", "access_denied"]]);
  }
  const code = await issueCode(deps, client, userId, params, scopes);
  return redirect([["code", code]]);
};

// ---------------------------------------------------------------------------
// Token (RFC 6749 §4.1.3, §6; RFC 7636; RFC 8707)
// ---------------------------------------------------------------------------

type TokenOutcome =
  | {
      readonly kind: "error";
      readonly error: string;
      readonly description: string;
    }
  | { readonly kind: "issued"; readonly response: TokenResponse };

const invalidGrant = (description: string): TokenOutcome => ({
  description,
  error: "invalid_grant",
  kind: "error",
});

/** Both sides hashed to a fixed width, so the comparison is constant time on any input. */
const pkceMatches = (verifier: string, challenge: string | null): boolean => {
  if (
    challenge === null ||
    verifier.length < CHALLENGE_MIN ||
    verifier.length > CHALLENGE_MAX
  ) {
    return false;
  }
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return timingSafeEqual(
    createHash("sha256").update(computed).digest(),
    createHash("sha256").update(challenge).digest()
  );
};

const issueTokens = async (
  deps: OAuthDeps,
  grantId: OAuthGrantId,
  scopes: readonly OAuthScope[],
  now: number
): Promise<TokenResponse> => {
  const access = randomToken(OAUTH_ACCESS_TOKEN_PREFIX);
  const refresh = randomToken(OAUTH_REFRESH_TOKEN_PREFIX);
  const row = (
    hash: string,
    kind: OAuthTokenRow["kind"],
    ttl: number
  ): OAuthTokenRow => ({
    codeChallenge: null,
    createdAt: now,
    expiresAt: now + ttl,
    grantId,
    hash,
    kind,
    redirectUri: null,
    resource: null,
    revokedAt: null,
    scopes,
    usedAt: null,
  });
  await deps.store.oauth.tokens.insert(
    row(sha256Hex(access), "access", ACCESS_TTL_MS)
  );
  await deps.store.oauth.tokens.insert(
    row(sha256Hex(refresh), "refresh", REFRESH_TTL_MS)
  );
  await deps.store.oauth.grants.touch(grantId, now);
  return {
    access_token: access,
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    refresh_token: refresh,
    scope: scopes.join(" "),
    token_type: "Bearer",
  };
};

/** A live row of the wanted kind under a live grant of this client, or why not. */
const liveRow = async (
  deps: OAuthDeps,
  secret: string,
  kind: OAuthTokenRow["kind"],
  clientId: string | undefined,
  now: number
): Promise<
  | { readonly row: OAuthTokenRow; readonly userId: UserId }
  | { readonly reason: string }
> => {
  const row = await deps.store.oauth.tokens.byHash(sha256Hex(secret));
  if (row === null || row.kind !== kind) {
    return { reason: `That ${kind} is not one this server issued.` };
  }
  const found = await deps.store.oauth.grants.byId(row.grantId);
  if (found === null || found.grant.revokedAt !== null) {
    return { reason: "The person disconnected this client." };
  }
  if (clientId !== undefined && found.grant.clientId !== clientId) {
    return { reason: "That code belongs to another client." };
  }
  if (row.expiresAt <= now) {
    return { reason: `That ${kind} has expired.` };
  }
  return { row, userId: found.userId };
};

/** The grant goes with all its tokens. True when there was one to revoke. */
export const revokeGrant = async (
  store: Pick<Store, "oauth">,
  userId: UserId,
  id: OAuthGrantId,
  now: number
): Promise<boolean> => {
  const revoked = await store.oauth.grants.revoke(userId, id, now);
  if (revoked) {
    await store.oauth.tokens.revokeAllForGrant(id, now);
  }
  return revoked;
};

const exchangeCode = async (
  deps: OAuthDeps,
  body: TokenBody,
  now: number
): Promise<TokenOutcome> => {
  if (body.code === undefined || body.client_id === undefined) {
    return {
      description: "Send code, client_id, redirect_uri and code_verifier.",
      error: "invalid_request",
      kind: "error",
    };
  }
  const live = await liveRow(deps, body.code, "code", body.client_id, now);
  if ("reason" in live) {
    return invalidGrant(live.reason);
  }
  const { row, userId } = live;
  if (body.redirect_uri !== row.redirectUri) {
    return invalidGrant(
      "redirect_uri does not match the authorization request."
    );
  }
  if (!pkceMatches(body.code_verifier ?? "", row.codeChallenge)) {
    return invalidGrant("code_verifier does not match the code challenge.");
  }
  // The single use. A second presentation of one code is an attack on the
  // first, so everything the grant issued goes with it.
  if (!(await deps.store.oauth.tokens.consume(row.hash, now))) {
    await revokeGrant(deps.store, userId, row.grantId, now);
    return invalidGrant("That code was already used; its tokens are revoked.");
  }
  return {
    kind: "issued",
    response: await issueTokens(deps, row.grantId, row.scopes, now),
  };
};

const rotateRefresh = async (
  deps: OAuthDeps,
  body: TokenBody,
  now: number
): Promise<TokenOutcome> => {
  if (body.refresh_token === undefined) {
    return {
      description: "Send refresh_token.",
      error: "invalid_request",
      kind: "error",
    };
  }
  const live = await liveRow(
    deps,
    body.refresh_token,
    "refresh",
    body.client_id,
    now
  );
  if ("reason" in live) {
    return invalidGrant(live.reason);
  }
  const { row, userId } = live;
  // Rotation: the old token is spent here. Seeing it spent already means a
  // copy was replayed, and the whole grant is withdrawn (RFC 6749 §10.4).
  if (!(await deps.store.oauth.tokens.consume(row.hash, now))) {
    await deps.store.oauth.tokens.revokeAllForGrant(row.grantId, now);
    await deps.store.oauth.grants.revoke(userId, row.grantId, now);
    return invalidGrant(
      "That refresh token was already used; the connection is revoked."
    );
  }
  return {
    kind: "issued",
    response: await issueTokens(deps, row.grantId, row.scopes, now),
  };
};

const handleToken = async (
  deps: OAuthDeps,
  request: Request
): Promise<Response> => {
  const body = await readBody(request, TokenBody);
  if (body === null) {
    return oauthError("invalid_request", "Unreadable token request.");
  }
  if (
    body.resource !== undefined &&
    body.resource !== resourceOf(deps.appOrigin)
  ) {
    return oauthError(
      "invalid_target",
      `This server issues tokens for ${resourceOf(deps.appOrigin)} only.`
    );
  }
  const now = (deps.now ?? Date.now)();
  let outcome: TokenOutcome;
  if (body.grant_type === "authorization_code") {
    outcome = await exchangeCode(deps, body, now);
  } else if (body.grant_type === "refresh_token") {
    outcome = await rotateRefresh(deps, body, now);
  } else {
    outcome = {
      description: "Use authorization_code or refresh_token.",
      error: "unsupported_grant_type",
      kind: "error",
    };
  }
  if (outcome.kind === "error") {
    return oauthError(outcome.error, outcome.description);
  }
  return publicJson(outcome.response);
};

// ---------------------------------------------------------------------------
// Revocation (RFC 7009)
// ---------------------------------------------------------------------------

const handleRevoke = async (
  deps: OAuthDeps,
  request: Request
): Promise<Response> => {
  const body = await readBody(request, RevocationBody);
  // Always 200 (RFC 7009 §2.2): a token we do not know is as revoked as it
  // will ever be, and saying more would let anyone probe which exist.
  const ok = new Response(null, {
    headers: { ...CORS_HEADERS, "cache-control": "no-store" },
    status: 200,
  });
  if (body === null) {
    return ok;
  }
  const row = await deps.store.oauth.tokens.byHash(sha256Hex(body.token));
  if (row === null) {
    return ok;
  }
  const found = await deps.store.oauth.grants.byId(row.grantId);
  if (found !== null) {
    await revokeGrant(
      deps.store,
      found.userId,
      row.grantId,
      (deps.now ?? Date.now)()
    );
  }
  return ok;
};

// ---------------------------------------------------------------------------
// Resolution and refusals, for the router
// ---------------------------------------------------------------------------

/** Looks like one of ours, whether or not it resolves. */
export const looksLikeAccessToken = (bearer: string): boolean =>
  bearer.startsWith(OAUTH_ACCESS_TOKEN_PREFIX);

export interface ResolvedGrant {
  readonly grant: OAuthGrant;
  readonly userId: UserId;
}

/** Whose workspace an access token opens, and with which scopes, or null. */
export const resolveAccessToken = async (
  store: Pick<Store, "oauth">,
  token: string,
  now: number
): Promise<ResolvedGrant | null> => {
  if (!looksLikeAccessToken(token)) {
    return null;
  }
  const row = await store.oauth.tokens.byHash(sha256Hex(token));
  if (row === null || row.kind !== "access" || row.expiresAt <= now) {
    return null;
  }
  const found = await store.oauth.grants.byId(row.grantId);
  if (found === null || found.grant.revokedAt !== null) {
    return null;
  }
  detached("oauth grant touch", async () => {
    await store.oauth.grants.touch(row.grantId, now);
  });
  return found;
};

/**
 * The 401 an MCP client learns from: where the resource metadata is, and
 * whether a token was presented and refused (RFC 9728 §5.1, RFC 6750 §3).
 */
export const unauthorizedMcp = (origin: string, hadBearer: boolean): Response =>
  Response.json(
    { error: "Sign in to use this." },
    {
      headers: {
        "cache-control": "no-store",
        "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl(origin)}"${hadBearer ? ', error="invalid_token"' : ""}`,
      },
      status: 401,
    }
  );

/** The grant exists and is not enough: RFC 6750 §3.1. */
export const insufficientScope = (scope: OAuthScope): Response =>
  Response.json(
    {
      error: `This connection lacks the "${scope}" scope. Reconnect Froggy and allow it.`,
    },
    {
      headers: {
        "cache-control": "no-store",
        "www-authenticate": `Bearer error="insufficient_scope", scope="${scope}"`,
      },
      status: 403,
    }
  );

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const handleMetadata = (origin: string, pathname: string): Response | null => {
  if (pathname === AS_METADATA_PATH) {
    return publicJson(
      authorizationServerMetadata(origin),
      200,
      "public, max-age=300"
    );
  }
  if (
    pathname === RESOURCE_METADATA_PATH ||
    pathname === RESOURCE_METADATA_MCP_PATH
  ) {
    return publicJson(
      protectedResourceMetadata(origin),
      200,
      "public, max-age=300"
    );
  }
  return null;
};

/** The public endpoints, matched before the `/api` group. Null when the path is not ours. */
export const handleOAuth = async (
  deps: OAuthDeps,
  request: Request,
  pathname: string
): Promise<Response | null> => {
  if (!PUBLIC_PATHS.has(pathname)) {
    return null;
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS, status: 204 });
  }
  if (request.method === "GET") {
    return (
      handleMetadata(deps.appOrigin, pathname) ??
      new Response(null, { headers: { allow: "POST, OPTIONS" }, status: 405 })
    );
  }
  if (request.method !== "POST") {
    return new Response(null, {
      headers: { allow: "GET, POST, OPTIONS" },
      status: 405,
    });
  }
  if (pathname === REGISTER_PATH) {
    return await handleRegister(deps, request);
  }
  if (pathname === TOKEN_PATH) {
    return await handleToken(deps, request);
  }
  if (pathname === REVOKE_PATH) {
    return await handleRevoke(deps, request);
  }
  return new Response(null, {
    headers: { allow: "GET, OPTIONS" },
    status: 405,
  });
};

const CLIENT_LOOKUP = /^\/api\/oauth\/client\/(?<id>[^/]+)$/u;

/** The signed-in person's side: the client's name for the page, and the decision. */
export const handleOAuthApi = async (
  deps: OAuthDeps,
  request: Request,
  userId: UserId,
  pathname: string
): Promise<Response | null> => {
  if (pathname === "/api/oauth/consent" && request.method === "POST") {
    return await handleConsent(deps, request, userId);
  }
  const id = CLIENT_LOOKUP.exec(pathname)?.groups?.["id"];
  if (id !== undefined && request.method === "GET") {
    const client = OAuthClientId.is(id)
      ? await deps.store.oauth.clients.byId(id)
      : null;
    if (client === null) {
      return apiJson({ error: "No such client." }, 404);
    }
    return apiJson({
      client: {
        id: client.id,
        name: client.name,
        redirectUris: client.redirectUris,
      },
      v: 1,
    });
  }
  return null;
};
