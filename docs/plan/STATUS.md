# Status against the plan

Updated Sat 5 Sep 2026, 18:00 CEST. The plan is `~/.claude/plans/please-review-this-repo-typed-chipmunk.md` on the build box (phases P0–P6); this file records what has landed in the tree and where it deviates.

## Landed on Sat 5 Sep by the Opus session (commits `3622c96`..`5db02e8`)

| Plan item | State | What landed | Still open |
| --- | --- | --- | --- |
| 1.7 auth | done | Privy access token on every `/api/*` route (bearer) and both sockets (subprotocol, `packages/protocol/src/handshake.ts`); missing `Origin` refused; `e2e/auth.spec.ts` | token cache, `DEMO_USER_DID` |
| 1.3 per-user sessions | partial | `apps/server/src/workspaces.ts`: one `WorkspaceSession` + one in-process `BrowserSession` per DID, `MAX_BROWSERS` (0 = unlimited), hashed profile directories | worker process per user (`Bun.WebView` is one Chrome and one profile per process, so in-process sessions share a profile), queue, idle kill, `freeze()` as one function, parked approvals |
| 1.4 ledger | partial | Postgres ledger keyed on the DID (`packages/wallet/src/ledger-postgres.ts`), `users` table, migration `0000`, `preDeployCommand` as a shell string, `database=stub` mode; same-key concurrent spends settle once (ownership + in-process join); HBAR priced from the mirror-node exchange rate, fails closed | rolling-cap read is still outside the reserve critical section for different keys; `refused`/`abandoned` rows; runtime decode of `SpendIntent`; frozen/aborted re-check before the outbound call; receipts and mandates persisted |
| 1.5 outbound hygiene | partial | `x402_fetch` consults the host allowlist before the first request | private-IP/scheme checks, redirect re-validation, `browser_navigate` scheme check, `x-payment-response` decoded as base64 `SettleResponse` |
| 1.6 model | open | — | placeholder-prefix bug in `model.ts`, DashScope wiring, daily budget |
| 2.3 Graph registry | mostly done | four pinned Messari deployments, `_meta` freshness gate (2 h), deployment ids and blocks on evidence, `GRAPH_SUBGRAPH_ID` removed | x402 gateway provider paid by the demo wallet; the oracle body as the metered four-deployment brief |
| 2.4 Privy | partial | wallet minted by Privy at login and owned by the user; the agent is added as an additional signer under `docs/privy-agent-policy.json` (rule a only: typed-data `TransferWithAuthorization` to The Graph, Base mainnet USDC, ≤ $0.25), authorised by the user's access token; freeze revokes the signer; `tools/privy-agent-key.ts` | the signing call itself (typed data through the agent key), rule b top-up + aggregation, a policy-owner key, `wallet_send` producing a raw Privy denial |
| 2.1 Hedera live | open | — | `extra.feePayer` from `/supported`, response header decode, first settlement |

## Deviations from the plan, adopted

- The Privy wallet is client-minted at login (`createOnLogin: "all-users"`) and user-owned; the server asks to be added as a signer with the user's token. This replaces the plan's server-created wallet, so the owner step "embedded-wallet creation on login **off**" is reversed: leave it **on**.
- `UserId` is the branded Privy DID, not a TypeID. Profile directories are the hashed DID.
- The policy's per-payment cap is $0.25 rather than the spec's $0.02; the mandate's own per-transaction rule stays the binding number on screen. Tighten the JSON when the Graph payment path lands.

## Landed by this session

- P0.2 `8c99fd1`: Bun 1.4.2 pinned everywhere; hand-written `Bun.WebView` types removed.
- P0.4: planning docs moved to `docs/plan/`, research to `docs/research/`, links rewritten, `docs/README.md` index.
