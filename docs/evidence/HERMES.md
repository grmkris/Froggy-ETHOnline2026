# External agent connection verification

7 September 2026. OAuth recovered from the unfinished Claude worktree and integrated with the five-page workspace and schedules. [ADR 0012](../decisions/0012-mcp-oauth-authorization-server.md) describes the authorization server; [iteration 3](../plan/ITERATION_3.md) records the remaining release work.

## Local behavior

The browser checks boot Froggy with explicit stubs. They cover registration, browser consent, the manual authorization page, code exchange with PKCE, MCP tool discovery, scope refusal, listing the connection and disconnecting through Agents. Page errors and narrow-screen overflow are checked. Legacy-token setup shows the token separately from the skill and preserves it when navigating away and back.

The distributed JavaScript CLI runs under the installed Node runtime, using an isolated configuration directory. Both loopback and manual login are exercised through the real consent page, followed by credential permissions (0600), an expired access token triggering refresh, reading the service catalog, logout, credential removal and refusal of the revoked token. This is local Node verification, not a Hermes-on-Contabo claim.

OAuth unit tests cover redirect validation, mandatory PKCE, code expiry and single use, concurrent code replay, refresh rotation and replay, resource refusal, grant ownership and revocation. In particular, replay revokes the grant even when the first exchange has not yet inserted its access token.

## Postgres and verification results

Migration 0009 was applied with all preceding migrations to a disposable local Postgres 17 database. Independent connections passed OAuth client/grant/token round trips, concurrent single-use consumption, cross-user revocation refusal, grant revocation, schedule claiming and deletion of the test identity. This caught and fixed a timestamp serialization failure in the Postgres revocation query that the memory store could not expose. Reproduce with `DATABASE_URL=<disposable local database> bun tools/spikes/verify-oauth-postgres.ts` after `bun run db:migrate`.

The full `bun run check` gate passed (480 unit tests, formatting, type-aware lint, TypeScript, boundaries, agent-file validation and knip). `bun run build` passed for the server and web app. The complete Chromium suite passed all 56 tests, including both CLI login modes under Node 22.23.2. Consent screenshots at 390 and 1440 pixels were visually inspected. Node 20 was not exercised on this machine.

## Live checks still required

At recovery, the hosted `/mcp` and `/.well-known/oauth-authorization-server` returned HTML from the SPA. The new OAuth code and migration were not deployed. `/health` was healthy with all six integrations live.

After deployment:

1. Confirm both metadata documents return JSON; an unauthenticated POST to `/mcp` returns 401 with its `resource_metadata` challenge.
2. Connect an external MCP client by URL, complete consent as a real Privy user, list tools and call `froggy_services`.
3. Disconnect through Agents; the next token-authenticated call must return 401.
4. Run `froggy login --manual` in Hermes' environment, relay the link to the owner, exchange the pasted code, read services, then log out. A paid brief is a separate live financial check.

No live Hermes, Inspector, provider payment or Telegram delivery is claimed by this record.
