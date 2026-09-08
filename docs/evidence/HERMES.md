# External agent connection verification

7 September 2026. OAuth recovered from the unfinished Claude worktree and integrated with the five-page workspace and schedules. [ADR 0012](../decisions/0012-mcp-oauth-authorization-server.md) describes the authorization server; [iteration 3](../plan/ITERATION_3.md) records the remaining release work.

## Simplified onboarding — 8 September 2026

The first action on Home (before a conversation) and Wallet is **Copy for your agent**. It copies this prompt, using the deployment's own origin:

```text
Read https://app-production-58dd.up.railway.app/llm.md and follow it to connect yourself to my Froggy wallet as an MCP server; then tell me what you can do.
```

A confirmation says “Copied. Paste this into your agent’s chat.” If the clipboard is denied, the same text appears in a read-only field for manual copying. Once any OAuth grant or legacy token is unrevoked, those surfaces show **1 agent connected** (linking directly to that connection) or **N agents connected** (linking to Agents). The Agents page keeps the copy action for connecting another agent; Telegram is unchanged, and the token path remains collapsed at the bottom.

`GET /llm.md` is the install-and-use document. `GET /skill.md` wraps the same text in skill frontmatter. Both are public `text/markdown`, rendered by `apps/server/src/skill.ts` with `APP_ORIGIN`; `/froggy/SKILL.md` aliases the current skill. The repository copy at `skills/froggy/SKILL.md` is generated from that source with the generic origin.

For Claude Code, the document tells the agent to save the skill and configure remote MCP:

```sh
mkdir -p ~/.claude/skills/froggy
curl -fsSL https://app-production-58dd.up.railway.app/skill.md -o ~/.claude/skills/froggy/SKILL.md
claude mcp add --transport http froggy https://app-production-58dd.up.railway.app/mcp
```

It then tells the person to authenticate from `/mcp`. Cursor receives a `mcpServers.froggy.url` entry; Inspector uses Streamable HTTP with OAuth through its local proxy. The fallback is:

```sh
curl -fsSL https://app-production-58dd.up.railway.app/froggy-cli.js -o ~/froggy.mjs
node ~/froggy.mjs login --url=https://app-production-58dd.up.railway.app --manual
node ~/froggy.mjs help
```

The agent verifies access with `froggy_services`, reports capabilities and listed prices, and buys nothing as part of setup. The usage document describes all three MCP tools, idempotency, polling, approvals, refusals, failed work and uncertain payments. Client syntax was checked against the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp), [Cursor MCP configuration](https://prod.cursor.com/docs/mcp), and [Inspector documentation](https://github.com/modelcontextprotocol/inspector).

Each `/agents/:id` resolves only for its owner. It shows scopes, connection and use dates, Disconnect, and the newest 50 invocation rows. Calls to `/mcp` and `/api/mcp`, HTTP task purchases and reads (including polling and event-stream requests), service purchases, and wallet signing requests share the grant/token identity. Scope refusals and errors are recorded too. The ten-column `agent_invocations` table stores no arguments, result bodies or secrets. A row is started before execution, then completed; a failed completion write retains the started row without turning a successful purchase into a retry. Disconnect retains history; deleting account data removes it. Task payment amounts are read from settled sales, retries show no new payment, and signed headers explicitly say settlement is not confirmed. Simulated activity remains labelled. Task links open the selected service, brief or browse result.

History starts with this change: earlier calls cannot be reconstructed from `lastUsedAt`. No per-agent weekly aggregate existed, so the rows do not invent one. Real-user production MCP consent and Hermes-environment verification remain in the live checklist below.

Local verification: the Drizzle migration applied to an isolated Postgres 17 database. The shared memory/Postgres suite passed all eight contracts, including newest-50 ordering, owner isolation, persistence after disconnect, and account-data deletion. The focused server suites passed 16 tests, including signed versus settled amounts, OAuth scope refusals, and a failed history-completion write. The complete browser suite passed **107/107** with `FROGGY_E2E_PORT=3800 bun run e2e --workers=2 --timeout=90000`. The longer per-test budget accommodates the shared machine: the preceding default-budget run passed 105 tests and exhausted 30 seconds near the end of the deletion and appearance walkthroughs. Assertion timeouts and behavior checks were unchanged. The new copy, connection-count, history, OAuth retention, payment-state and task-link interactions are covered; the detail page was visually inspected at 1440 and 320 pixels.

`heavy bun run check`, standalone `bun run knip`, and `heavy bun run build` passed. Final verification used an isolated checkout containing this lane's exact candidate, so another lane's unfinished Markdown files in the shared tree were neither reformatted nor staged. Existing browser assertions were updated for the simpler onboarding and retained detail history after disconnect. The appearance-position test now waits for settings and fonts before measuring, retaining its exact position assertions.

## Local behavior

The browser checks boot Froggy with explicit stubs. They cover registration, browser consent, the manual authorization page, code exchange with PKCE, MCP tool discovery, scope refusal, listing the connection and disconnecting through Agents. Page errors and narrow-screen overflow are checked. Legacy-token setup shows the token separately from the skill and preserves it when navigating away and back.

The distributed JavaScript CLI runs under the installed Node runtime, using an isolated configuration directory. Both loopback and manual login are exercised through the real consent page, followed by credential permissions (0600), an expired access token triggering refresh, reading the service catalog, logout, credential removal and refusal of the revoked token. This is local Node verification, not a Hermes-on-Contabo claim.

OAuth unit tests cover redirect validation, mandatory PKCE, code expiry and single use, concurrent code replay, refresh rotation and replay, resource refusal, grant ownership and revocation. In particular, replay revokes the grant even when the first exchange has not yet inserted its access token.

## Postgres and verification results

Migration 0009 was applied with all preceding migrations to a disposable local Postgres 17 database. Independent connections passed OAuth client/grant/token round trips, concurrent single-use consumption, cross-user revocation refusal, grant revocation, schedule claiming and deletion of the test identity. This caught and fixed a timestamp serialization failure in the Postgres revocation query that the memory store could not expose. Reproduce with `DATABASE_URL=<disposable local database> bun tools/spikes/verify-oauth-postgres.ts` after `bun run db:migrate`.

The full `bun run check` gate passed (480 unit tests, formatting, type-aware lint, TypeScript, boundaries, agent-file validation and knip). `bun run build` passed for the server and web app. The complete Chromium suite passed all 56 tests, including both CLI login modes under Node 22.23.2. Consent screenshots at 390 and 1440 pixels were visually inspected. Follow-up verification also passed both CLI login modes, refresh, logout and revocation under Node 20.20.2. The CLI downloaded from production ran its help command under that runtime.

## Official client interoperability

The installed `@modelcontextprotocol/sdk` 1.30.0 was exercised as an external client under Node 20.20.2, without adding it or its dependencies to the repository. Against the local app with explicit stubs, its `StreamableHTTPClientTransport` discovered metadata from the 401 challenge, dynamically registered, generated PKCE, sent the browser through consent, exchanged the code, initialized MCP, listed all three tools and called `froggy_services`. No transport errors were reported. Disconnecting through Agents made the issued token receive HTTP 401. This is protocol interoperability evidence; production consent from a real person remains below.

## Production release verification

The owner authorized the push after recovery. Merge `3179edb` passed [GitHub CI](https://github.com/grmkris/Froggy-ETHOnline2026/actions/runs/34129091126), including all 56 browser tests. Railway deployment `8dda0c7a-8857-4e6d-9490-834f353d6130` succeeded on 7 September 2026 at 13:56 UTC after the migration step and application startup.

Read-only checks against `https://app-production-58dd.up.railway.app` passed:

- `/health`: HTTP 200, status `ok`, database/graph/hedera/model/privy/telegram all `live`.
- `/.well-known/oauth-authorization-server`: HTTP 200 JSON, the production issuer and endpoints, mandatory PKCE S256 and authorization-code/refresh support.
- `/.well-known/oauth-protected-resource` and its `/mcp` variant: HTTP 200 JSON identifying the production MCP resource and authorization server.
- Unauthenticated POST `/mcp`: HTTP 401 with the production `resource_metadata` challenge.
- POST `/mcp` with a nonexistent `fga_` token: HTTP 401 and `invalid_token`. This exercises the OAuth token lookup against the migrated live database.

Anonymous production browser checks also passed at 1440px and 390px with no page or console errors. The real Privy email/Google dialog opened, and its email field accepted focus. No email was submitted and no user was signed in.

## Live checks still required

1. Connect an external MCP client by URL, complete consent as a real Privy user, list tools and call `froggy_services`.
2. Disconnect through Agents; the next token-authenticated call must return 401.
3. Run `froggy login --manual` in Hermes' environment, relay the link to the owner, exchange the pasted code, read services, then log out. A paid brief is a separate live financial check.

The [owner acceptance checklist](../plan/OWNER_ACCEPTANCE.md) contains the exact remaining configuration and signed-in steps. No live Hermes, Inspector, provider payment or Telegram delivery is claimed by this record.
