# Status against the plan

Updated Sat 5 Sep 2026, 22:50 CEST. The plan is `PLAN.md` beside this file (phases P0–P6, imported from the build box on 5 Sep); `DECISIONS.md` lists what is still open; this file records what has landed in the tree and where it deviates.

## Landed on Sat 5 Sep by the Opus session (commits `3622c96`..`5db02e8`)

| Plan item | State | What landed | Still open |
| --- | --- | --- | --- |
| 1.7 auth | done | Privy access token on every `/api/*` route (bearer) and both sockets (subprotocol, `packages/protocol/src/handshake.ts`); missing `Origin` refused; `e2e/auth.spec.ts` | token cache, `DEMO_USER_DID` |
| 1.3 per-user sessions | partial | `apps/server/src/workspaces.ts`: one `WorkspaceSession` + one in-process `BrowserSession` per DID, `MAX_BROWSERS` (0 = unlimited), hashed profile directories | worker process per user (`Bun.WebView` is one Chrome and one profile per process, so in-process sessions share a profile), queue, idle kill, `freeze()` as one function, parked approvals |
| 1.4 ledger | partial | Postgres ledger keyed on the DID (`packages/wallet/src/ledger-postgres.ts`), `users` table, migration `0000`, `preDeployCommand` as a shell string, `database=stub` mode; same-key concurrent spends settle once (ownership + in-process join); HBAR priced from the mirror-node exchange rate, fails closed | rolling-cap read is still outside the reserve critical section for different keys; `refused`/`abandoned` rows; runtime decode of `SpendIntent`; frozen/aborted re-check before the outbound call; receipts and mandates persisted |
| 1.5 outbound hygiene | done (`f491806`) | `x402_fetch` consults the host allowlist before the first request | private-IP/scheme checks, redirect re-validation, `browser_navigate` scheme check, `x-payment-response` decoded as base64 `SettleResponse` |
| 1.6 model | open | — | placeholder-prefix bug in `model.ts`, DashScope wiring, daily budget |
| 2.3 Graph registry | mostly done | four pinned Messari deployments, `_meta` freshness gate (2 h), deployment ids and blocks on evidence, `GRAPH_SUBGRAPH_ID` removed | x402 gateway provider paid by the demo wallet; the oracle body as the metered four-deployment brief |
| 2.4 Privy | partial | wallet minted by Privy at login and owned by the user; the agent is added as an additional signer under `docs/privy-agent-policy.json` (rule a only: typed-data `TransferWithAuthorization` to The Graph, Base mainnet USDC, ≤ $0.25), authorised by the user's access token; freeze revokes the signer; `tools/privy-agent-key.ts` | the signing call itself (typed data through the agent key), rule b top-up + aggregation, a policy-owner key, `wallet_send` producing a raw Privy denial |
| 2.1 Hedera live | open | — | `extra.feePayer` from `/supported`, response header decode, first settlement |

## Deviations from the plan, adopted

- The Privy wallet is client-minted at login (`createOnLogin: "all-users"`) and user-owned; the server asks to be added as a signer with the user's token. This replaces the plan's server-created wallet, so the owner step "embedded-wallet creation on login **off**" is reversed: leave it **on**.
- `UserId` is the branded Privy DID, not a TypeID. Profile directories are the hashed DID.
- The policy's per-payment cap is $0.25 rather than the spec's $0.02; the mandate's own per-transaction rule stays the binding number on screen. Tighten the JSON when the Graph payment path lands.

## Landed by this session (Sat 5 Sep)

- P0.2 `8c99fd1`: Bun 1.4.2 pinned everywhere; hand-written `Bun.WebView` types removed.
- P0.4 `07d41c8`: planning docs moved to `docs/plan/`, research to `docs/research/`, links rewritten, `docs/README.md` index.
- P0.3 `8f060ff`: every prior-project name scrubbed from code and docs; `tools/check-names.ts` in `bun run check`.
- P0.5 `3c860e9`: Railway runbook, profile volume 10 GB (applied), model variables preserved. `checkSuites` is true live.
- P1.6 `56290f8`: model chosen by configuration (`selectModelProvider`), DashScope wired, the scripted model pays the oracle so a keyless run reaches the ledger and a receipt.
- P1.1 `09bac94`: CAIP-2 network ids (`eip155:8453`, `eip155:84532`, `hedera:testnet`), Base mainnet USDC known, `user` provenance.
- P1.2 `edf4435`: one browser worker process per user (`packages/browser/src/{worker,worker-host,worker-serve,remote}.ts`, `packages/protocol/src/worker.ts`), env allowlist, frame credits, cast-only-while-watched, private-network blocklist per tab, freeze reaches the browser, ADR 0006. Real spawn verified on the build box.
- P1.3: seats and queue (`MAX_BROWSERS=8`, `RESERVED_BROWSERS=1` for `DEMO_USER_DID`, position on `BrowserState.queue`, automatic seating with the queued start replayed), idle sweep (`BROWSER_IDLE_MS`), `freeze.ts` as the one kill-switch function (mandate → run → parked approvals → browser → Privy signer), `interactions.ts` parking registry with the three-way race, `approval.resolve` honoured for the owning user only, open cards re-sent to a reconnecting tab, `POST /api/chat` answers 423 while frozen.
- P1.5 `f491806`: `publicHttpUrl` (scheme, credentials, literal private/loopback/link-local/CGNAT addresses, `.internal`/`.local` names), `safeFetch` (DNS refuse-private, manual redirects re-checked per hop, 15 s, 1 MB), both tools validate before anything is sent; `x-payment-response` is the base64 `SettleResponse` envelope on both sides.
- P2.7 `539d0a3` (code; message on `9c2150c`): `ask` parks the tool call on a card through `InteractionRegistry`, outside the session lock; the answer is judged again with `approved`; `allow_session` writes an `ask_exemption` rule; `deny_stop` freezes with the answerer's token; timeout/aborted/unavailable are denial codes; `Receipt.approval` records the id and resolution. The in-app card itself is P3.5.
- P3.0–3.6 `41dbe07`: the light workspace. Header strip (spent vs the widest rolling cap, driving dot, one stub chip, Freeze with confirm on unfreeze), the stream with receipts filed under the turn that produced them (server stamps `runId`/`at` on every assistant message), the live page as an inline card with a driving ring and a compact strip while it is scrolled away, tickets for receipts and approvals, the details drawer (policy, history, wallet), sign-in states (loading/failed/ready). Reducer, stream model, painter and letterbox mapping are unit-tested; e2e updated.
- P3.7 `32d5569`: mandate editor in the drawer (`mandate.update`), `DELETE /api/me` wipes store rows, the workspace and the profile directory (`Store.forget`, `Workspaces.forget`); `e2e/policy.spec.ts`.
- P3.8–3.9 `46367d2`: pop-out to a split pane (draggable, remembered width) and to `/browser` in its own window (`BroadcastChannel` claim/release, the tab drops its browser socket meanwhile); queue/starting/crashed overlays; phone is watch-only; `e2e/pop-out.spec.ts`.
- P3.5/3.11 `3763463`: approval round trip e2e (`e2e/approval.spec.ts`), plus policy and pop-out specs; 19 e2e green.
- P2.11 `7b1cb1d`: daily digest — schedule per user (migration 0001, `GET/PUT /api/digest`, drawer control), minute scheduler (`scheduler.ts`, tested), `runDailyFor` on the same loop with `interactive: false`, one minute / twelve steps / five cents / one paid request, report to a sink.
- P4 `c2759e0`: Telegram via the Chat SDK (ADR 0007): pairing codes (`/api/telegram`, `/start CODE`), digest card, approval card wired into the same `InteractionRegistry`, `/freeze` and a freeze button, DM chat on the shared `turn.ts` loop recorded into the run; `run.started` app message; migration 0002; live only with token + webhook secret. Owner: BotFather token, secret, `setWebhook`, `TELEGRAM_BOT_USERNAME`.
- P2.8 `8bf511f`: 402 probe (`packages/payments/src/probe.ts`, per-option reasons), `x402_probe` tool, per-user directory (migration 0003, `GET/POST/DELETE /api/directory`, `POST /api/directory/probe`), adding an entry puts host and payee on the mandate's allowlists (`session.allow`/`disallow`), Directory tab in the drawer with paid counts.
- P5 skeletons `79a38d7`: `docs/evidence/{HEDERA,GRAPH,PRIVY,AI-USE}.md` with what is live and `TODO` marks for the on-camera beats; README picture and surfaces updated.
- P3.11 `068113d`: `e2e/directory.spec.ts`; 21 e2e green.
- P6.1 `146b3e3`: WebMCP producer — four tools on `navigator.modelContext` when present (three read-only, `pay_402` consequential and routed through an ordinary agent turn), descriptors unit-tested, drawer reports availability. No browser on this box exposes the API, so registration itself is unverified.
- P2.5 `a438252`: Privy-signed EVM x402 — `privyTypedDataSigner` under the agent key, `evmPayer` via `@x402/evm` for Base and Base Sepolia, both x402 dialects on buyer and seller, payer chosen per offer, `Receipt.failure` carries the signer's refusal verbatim. Unverified live: needs a signed-in wallet with the agent granted, and USDC on Base for a settlement.
- P2.6 (partial) `87f6976`: HCS audit trail — `liveHcsWriter` (creates a topic at first use when none is pinned), one note per settlement on both sides, `Settlement.hcsSequence` on the receipt and the ticket stub. Verified live: topic `0.0.10381647`, notes #1 sold and #2 paid, settlement `0.0.7162784@1788632323.333261031` (pocket −0.05 HBAR, payee +0.05, facilitator paid the fee). Pocket-per-user and reconciliation remain.
- P2.3 second half `e365eef`: pay-per-query Graph — `GraphTransport` on the live client (`studio` or `x402`), `GRAPH_PAY_PER_QUERY`, one `paid-request.ts` choke point shared by `x402_fetch` and the Graph transport, one payment per deployment per minute. Needs USDC on Base in a signed-in wallet to run live.
- Deploy: the check-suite gate had held everything since `3763463` (CI red on an unformatted STATUS, then a name-check line; doc-only commits are skipped by Railway's watch paths). `13baf25` deployed at 17:58 UTC with migrations 0001–0003 applied; live `/health` shows `telegram=stub`.

## Blockers for the owner (as of Sat 5 Sep, 23:30 CEST)

Everything below is a key, a dashboard toggle, money, or a click that no session can do.

1. **`DEMO_USER_DID`** — the judge or demo account's Privy DID, so the reserved browser seat and the pay-per-query demo know whose wallet is the demo wallet. Set on Railway.
2. **USDC on Base** in the demo wallet (about $5) — needed for the first Privy-signed x402 payment to The Graph's gateway and any Base seller. Then set `GRAPH_PAY_PER_QUERY=true` on Railway and add `https://gateway.thegraph.com/api/x402/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk` to the demo account's directory (Details → Directory → Probe → Add). Without funds the signature still happens and the facilitator refuses; that refusal lands on the receipt.
3. **Telegram** — a bot from @BotFather; on Railway set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET_TOKEN` (any long random string) and `TELEGRAM_BOT_USERNAME`; then register the webhook: `curl "https://api.telegram.org/bot$TOKEN/setWebhook" -d url="https://app-production-58dd.up.railway.app/telegram/webhook" -d secret_token="$SECRET"`. Pair from Details → Wallet → Telegram.
4. **Privy dashboard** — confirm the Railway origin is in allowed origins and that a real login mints the embedded wallet and grants the agent signer (the wallet strip says "agent signer: granted"). A policy-owner key for wiping rules on freeze (plan 2.10) is still to create.
5. **Repo public** — after a last look at `docs/plan/` (the FABLE51 files are kept as written).
6. Not blockers, for the record: `HEDERA_HCS_TOPIC_ID=0.0.10381647` is set locally and on Railway (created by the server on 5 Sep); the three untracked `.claude/`, `.codex/`, `.grok/` directories are a workspace tool's and stay untracked.

## Lanes (Sat 5 Sep, 21:00 CEST)

Two sessions share this tree tonight. Each claims a task here before touching code and commits by pathspec; a task listed under one session is not picked up by the other unless it stays unclaimed for an hour after that session's last commit.

- **Session A** (the planning session, `session_011fhisYdtVt2vh8DtW4MkPU`): 2.4 remainder (rules b and c in the policy, `wallet_send` reaching Privy for a raw denial), 2.9 top-up under rule (b) with the per-user pocket balance and its tickets (3.10), 2.10 remainder (freeze zeroes the balance), 1.6 daily budget, then 2.6 second half (payment state machine, unlock token, service card), evidence `TODO(tx)` fills as beats land, the history secret scan script.
- **Session B** (the building session that landed everything above): unclaimed at 21:00; P6.2 WebMCP consumer and 6.3 injected provider are the only stretch items left, after the owner blockers above are cleared.
