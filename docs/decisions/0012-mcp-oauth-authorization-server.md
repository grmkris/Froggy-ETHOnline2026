# 0012 — A hand-rolled OAuth 2.1 authorization server in front of `/mcp`

7 September 2026

Froggy is a remote MCP server at `/mcp`. An MCP client (Claude Code, Cursor, the Inspector, Froggy's own CLI) connects by URL and signs in the way MCP clients expect: it reads `/.well-known/oauth-protected-resource` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414), registers itself at `POST /oauth/register` (RFC 7591), sends the person to `/oauth/authorize`, and exchanges the code at `POST /oauth/token`. The skill an agent installs no longer carries a secret. Legacy `fgy_` tokens keep working for an unattended agent; they are the last option the skill names, not the first.

## The server is ours

No dependency was added. The MCP SDK's server-side auth helpers are Express-shaped and bring Zod; this repository's contract language is Effect Schema and its router is a hand-written function. The surface is five public endpoints and two under `/api`, all in `apps/server/src/oauth.ts`, and every request and response body is decoded by a schema before use. The MCP TypeScript SDK and the Inspector are used only as external verification clients, run with `npx` outside the repository.

Public clients only. Registration accepts `token_endpoint_auth_method: none` and nothing else; there is no client secret column because there is no client secret. PKCE with `S256` is mandatory on every authorization request, and the token endpoint compares the verifier's hash to the challenge with `timingSafeEqual` after hashing both sides to a fixed width. `resource` (RFC 8707) is accepted and, when present, must be `<origin>/mcp`.

## Tokens

| Kind | Form | Lifetime | At rest |
| --- | --- | --- | --- |
| code | 32 random bytes, base64url | 10 minutes, single use | SHA-256 hex in `oauth_tokens` with the redirect URI, the PKCE challenge, the resource and the scopes it was issued for |
| access | `fga_` + 32 random bytes, base64url | 1 hour | SHA-256 hex |
| refresh | `fgr_` + 32 random bytes, base64url | 30 days, rotated on every use | SHA-256 hex |

Single use is one statement: `UPDATE oauth_tokens SET used_at = now WHERE hash = $1 AND used_at IS NULL RETURNING`. A code presented a second time revokes every token the grant issued (RFC 6749 §4.1.2); a refresh token presented after it was rotated revokes the grant itself (§10.4). Both hold across processes because the database, not the process, decides who used the row first. `POST /oauth/revoke` (RFC 7009) revokes the whole grant and always answers 200.

Three tables: `oauth_clients` (id `oac_`, name, redirect URIs), `oauth_grants` (id `oag_`, client, person, scopes, created, last used, revoked) and `oauth_tokens` (hash, kind, grant, scopes, challenge, redirect, resource, expiry, used, revoked). A grant is the unit of consent and of revocation: Disconnect on the Agents page calls `DELETE /api/agents/oag_…`, the same button that revokes a legacy `agt_…` token, and the next request under any of its tokens is a 401. The migration for these tables is generated after this lane merges (another lane owned the previous number); the memory store carries the same contract so the tests and the stub deployment do not wait on it.

## Scopes

| Scope | What it opens | Where it is checked |
| --- | --- | --- |
| `brief` | `POST /api/tasks` with `kind: brief` | `handleTaskPost`, from the body |
| `browse` | `POST /api/tasks` with `kind: browse` | `handleTaskPost`, from the body |
| `pay` | `POST /api/wallet/pay`, signing an x402 header from the person's wallet | `requiredScope` in `callerOf` |
| `services` | `POST /api/services/run` and every `froggy_*` MCP tool call | `requiredScope`, and `invokeTool` in `mcp.ts` |

Reads (`GET /api/tasks`, `/api/services`, `/api/wallet`) and the MCP envelope (`initialize`, `tools/list`) need no scope. A missing scope is a 403 with `WWW-Authenticate: Bearer error="insufficient_scope", scope="…"` over HTTP and an `isError` tool result naming the scope over MCP. No scope approves a ticket, raises a cap, adds a payee or changes the mandate: `agentMayCall` refuses every such route to any agent credential, and `/api/oauth/consent` is reachable only under a person's own Privy token, so an agent cannot consent for the person. A task bought under a grant records `agentTokenId: null` this week; the grant id on the task row is a later change.

## Consent and redirects

`/oauth/authorize` is a page in the SPA behind the sign-in gate. It names the client from `GET /api/oauth/client/:id`, offers one switch per requested scope, and posts the decision to `POST /api/oauth/consent`. The server validates in this order: the client exists and the redirect URI matches one it registered (otherwise the page shows a refusal and nothing is redirected anywhere), `response_type=code`, a 43 to 128 character `S256` challenge, scopes within the supported set and the consented set within the requested one, `resource` if present equal to `<origin>/mcp`, then Allow or Deny. Every error after the first two goes back to the client with `error`, `state` and `iss` (RFC 9207).

Redirect matching is exact, except that a registered `http://127.0.0.1/…` or `http://[::1]/…` may present any port (RFC 8252 §7.3). Registration accepts `https` anywhere, `http` on `127.0.0.1`, `[::1]` and `localhost`, and exactly `<origin>/oauth/manual`; never a fragment.

## The manual page instead of RFC 8628

A client with no browser of its own (Hermes in a sandbox, a CLI over SSH) does not get a device-code flow. It registers `<origin>/oauth/manual` as its redirect and runs the same code and PKCE flow: it prints the authorization link, the person opens it wherever they have a browser, consents, and lands on a page that shows the code in a read-only input. The person pastes the code back; the client exchanges it with its verifier. Same guarantees as the loopback flow, no polling endpoint, no user code, two fewer endpoints to get wrong. `froggy login --manual` is this flow.

## CORS and what is out of scope

`Access-Control-Allow-Origin: *` is set on the metadata, registration, token and revocation endpoints and nowhere else; those are read from other origins by design and carry no cookie. `/mcp` itself has no CORS headers and keeps the origin check the bearer endpoint had, so a browser-based MCP client on another origin cannot reach it this week. That is recorded rather than solved: the clients this lane serves run outside a browser.

Not done here: the public `/agents` page (lane 2's), `docs/evidence/HERMES.md` (needs the live host), recording the grant on the task row, and the live checks against the deployed URL listed in the plan's lane 5.6.
