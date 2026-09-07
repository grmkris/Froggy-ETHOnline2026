# External agent connection verification

7 September 2026. OAuth recovered from the unfinished Claude worktree and integrated with the five-page workspace and schedules. [ADR 0012](../decisions/0012-mcp-oauth-authorization-server.md) describes the authorization server; [iteration 3](../plan/ITERATION_3.md) records the remaining release work.

## Local behavior

The browser checks boot Froggy with explicit stubs. They cover registration, browser consent, the manual authorization page, code exchange with PKCE, MCP tool discovery, scope refusal, listing the connection and disconnecting through Agents. Page errors and narrow-screen overflow are checked. Legacy-token setup shows the token separately from the skill and preserves it when navigating away and back.

The distributed JavaScript CLI runs under the installed Node runtime, using an isolated configuration directory. Both loopback and manual login are exercised through the real consent page, followed by credential permissions (0600), an expired access token triggering refresh, reading the service catalog, logout, credential removal and refusal of the revoked token. This is local Node verification, not a Hermes-on-Contabo claim.

OAuth unit tests cover redirect validation, mandatory PKCE, code expiry and single use, concurrent code replay, refresh rotation and replay, resource refusal, grant ownership and revocation. In particular, replay revokes the grant even when the first exchange has not yet inserted its access token.

## Postgres and verification results

Migration 0009 was applied with all preceding migrations to a disposable local Postgres 17 database. Independent connections passed OAuth client/grant/token round trips, concurrent single-use consumption, cross-user revocation refusal, grant revocation, schedule claiming and deletion of the test identity. This caught and fixed a timestamp serialization failure in the Postgres revocation query that the memory store could not expose. Reproduce with `DATABASE_URL=<disposable local database> bun tools/spikes/verify-oauth-postgres.ts` after `bun run db:migrate`.

The full `bun run check` gate passed (480 unit tests, formatting, type-aware lint, TypeScript, boundaries, agent-file validation and knip). `bun run build` passed for the server and web app. The complete Chromium suite passed all 56 tests, including both CLI login modes under Node 22.23.2. Consent screenshots at 390 and 1440 pixels were visually inspected. Node 20 was not exercised on this machine.

## Production release verification

The owner authorized the push after recovery. Merge `3179edb` passed [GitHub CI](https://github.com/grmkris/agentic-wallet/actions/runs/34129091126), including all 56 browser tests. Railway deployment `8dda0c7a-8857-4e6d-9490-834f353d6130` succeeded on 7 September 2026 at 13:56 UTC after the migration step and application startup.

Read-only checks against `https://app-production-58dd.up.railway.app` passed:

- `/health`: HTTP 200, status `ok`, database/graph/hedera/model/privy/telegram all `live`.
- `/.well-known/oauth-authorization-server`: HTTP 200 JSON, the production issuer and endpoints, mandatory PKCE S256 and authorization-code/refresh support.
- `/.well-known/oauth-protected-resource` and its `/mcp` variant: HTTP 200 JSON identifying the production MCP resource and authorization server.
- Unauthenticated POST `/mcp`: HTTP 401 with the production `resource_metadata` challenge.
- POST `/mcp` with a nonexistent `fga_` token: HTTP 401 and `invalid_token`. This exercises the OAuth token lookup against the migrated live database.

## Live checks still required

1. Connect an external MCP client by URL, complete consent as a real Privy user, list tools and call `froggy_services`.
2. Disconnect through Agents; the next token-authenticated call must return 401.
3. Run `froggy login --manual` in Hermes' environment, relay the link to the owner, exchange the pasted code, read services, then log out. A paid brief is a separate live financial check.

No live Hermes, Inspector, provider payment or Telegram delivery is claimed by this record.
