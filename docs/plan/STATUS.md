# Status against the plan

Updated Sat 5 Sep 2026, 21:05 CEST. The plan is `PLAN.md` beside this file (phases P0–P6, imported from the build box on 5 Sep); `DECISIONS.md` lists what is still open; this file records what has landed in the tree and where it deviates.

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

## Blockers for the owner

- ~~The DashScope key is rejected by every DashScope host.~~ **Resolved 5 Sep (`6bcf688`).** The key is fine; the host and model were wrong. It is Alibaba's _Token Plan_ endpoint, not DashScope: `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` with `qwen3.8-max`. `dashscope-intl.aliyuncs.com` answers `invalid_api_key` for this key and has no `qwen3-max`. `~/code/harness` (`packages/kernel/src/agent/providers/alibaba.ts`) is the authority. Verified with a live request; Railway variables updated.
- `DEMO_USER_DID` needs the judge account's Privy DID before the reserved seat means anything.
- Three untracked directories (`.claude/`, `.codex/`, `.grok/`) holding a workspace tool's skill file appeared in the tree on 5 Sep, not written by this session; they are left untracked and kept out of the formatter.
