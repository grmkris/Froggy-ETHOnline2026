# Froggy: the operative plan

Written Sat 5 Sep 2026 and imported into the repository the same evening; until then it lived only on the build box. Submission is Sun 13 Sep 12:00 EDT, internal cut Sat 12 Sep 20:00 CEST. Remote `grmkris/agentic-wallet`, live at `https://app-production-58dd.up.railway.app` (Railway project `froggy`, one environment, one replica, volume at `/data`).

Three files share the work. This one is the plan: decisions, target architecture, backlog, owner steps, timeline. `STATUS.md` is what has landed, kept by the session doing the building. `DECISIONS.md` is the ledger of every place the Saturday-morning spec and this plan differ, and which of those are still open. The **State** column below was written at 18:45 CEST on Sat 5 Sep against commit `f491806`; `STATUS.md` moves faster than this file does.

## Context

Froggy is an agentic wallet: a human and an AI share one Chrome (JPEG screencast on a canvas, agent drives over CDP through `Bun.WebView`), and every spend goes through a policy engine the model cannot reach. The overnight bootstrap of 4 Sep produced a coherent single-tenant spine with loud stubs and a green gate. The FABLE51 research (the product baseline, not the final word) audited it and found what three exploration passes confirmed on Saturday morning; by Saturday evening most of the platform findings were closed:

- **Open door.** No auth on any route or socket; a missing `Origin` was trusted. _Closed in `3622c96`: Privy token as bearer on `/api/*` and as subprotocol on both sockets, missing Origin refused._
- **Single tenant by construction.** One session, one mandate, one ledger, one Chrome. _Closed in `3622c96` (workspace per DID), `edf4435` (worker process per user, ADR 0006) and `362d920` (seats, queue, idle sweep)._
- **Money is stubbed end to end.** Nothing signs; the Hedera 402 advertised `payTo 0.0.0` with an empty `extra`, which the live payer refuses; the Graph client queried one placeholder id. _Mostly closed: registry of four deployments `84dfdd7`; agent signer under policy `2f5891c`; fee payer read from the facilitator and the first real testnet settlement `e56b38d`. EVM signing remains open (P2)._
- **Ledger correctness.** Concurrent same-key spends both settled; failures consumed cap; `SpendIntent` was never decoded. _Closed: same-key concurrency `5db02e8`; Postgres ledger `35742fe`; one lock around judge-and-reserve, refused and abandoned rows, decoded intent, and a store for the frozen flag, mandate and receipts `4c251d5`._
- **The `ask` decision is a dead end.** _Half closed in `362d920`: the parking registry exists; the spend path does not yet park on it._
- **Freeze is not a kill switch.** _Mostly closed in `362d920`: one function, reaches the browser, revokes the signer. Pocket deletion waits on the pocket (2.10)._
- **SSRF.** `x402_fetch` fetched before policy. _Closed: allowlist order `5db02e8`; private network blocked per tab `edf4435`; `publicHttpUrl` and `safeFetch` with DNS and redirect checks `f491806`._
- **Client.** Bare dev-console UI, receipts lost on reconnect, no approval UI. _Open (P3)._
- **Hygiene.** Profile committed, prior-project names, docs at root, Bun pin. _Closed in `5be9b50`, `8f060ff`, `07d41c8`, `8c99fd1`. The repository is still private._

Stack verdict: aligned with the house style (AGENTS.md plus nested AGENTS.md and `.agents/skills`, `tools/graph.ts` boundary allowlist enforced as lint and as a whole-graph check, oxlint anti-slop, knip, TypeIDs, Effect Schema at the edges with SDK adapters plain, loud stubs, Railway IaC). Effect 4 RC and TS 7 are fine for this horizon; not touching them.

## Decisions locked with the owner on Sat 5 Sep

These override the FABLE51 spec where they differ. `DECISIONS.md` has the row-by-row comparison and marks what is still open.

| Area | Decision |
| --- | --- |
| Spec | FABLE51 product spec is the baseline; the owner's answers below override it. |
| Isolation | Keep `Bun.WebView`. **One worker process per user session**, persistent profile per Privy user under the volume, reconnect resumes, idle kill 10 min, max 8 seats, 1 reserved for `DEMO_USER_DID`, visible queue. |
| Hosting | Railway, single env, existing project and IaC. Railway Postgres. `checkSuites: true` so IaC and live agree. |
| Auth | Privy login (email/Google) required for everything. No guest path. Reuse the Privy app whose credentials are in the owner's secrets file; add the Railway origin. |
| Custody | Per-user Privy wallet, agent P-256 authorization key as additional signer under committed policy `P_agent` (EVM leg); per-user host-held Hedera testnet pocket with host caps. Kill switch removes the signer and wipes the pocket key. |
| Payments | Hedera x402 to our brief and to any `hedera:testnet` 402 pasted or in the directory; **x402 on EVM too** (Base USDC) via Privy typed data; Graph via Studio key by default and the mainnet x402 gateway ($0.01 per query) from the demo wallet holding about $5 real USDC. |
| Approvals | In-app approval card: park the tool call, four kinds, never a tool. |
| Model | OpenAI-compatible DashScope intl (`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`), model `qwen3-max`. Per-user daily budget. |
| Agent scope | Open web (no host allowlist for navigation, scheme and SSRF hygiene only), scheduled daily digest job, WebMCP producer and consumer, injected `window.ethereum` (last). |
| Telegram | Vercel Chat SDK (`chat@4.40.0`, `@chat-adapter/telegram`, `@chat-adapter/state-pg`): pairing code, Freeze button, digest, and DM chat with the agent on the same session. |
| UI | Light consumer fintech, "super app" feel, chat-first: browser inline as a live card, pop-out to split pane and open-in-window; wallet as header strip plus tickets in the stream; name stays Froggy. |
| Hygiene | Strip every mention of the prior internal projects from code and docs (standalone project). Planning docs under `docs/plan/`, research under `docs/research/`. Repo public after that lands. |
| Execution | Autonomous, one commit per task on `main`, gate before each, ping only for keys, dashboard toggles, money, or destructive actions. Several agent sessions share the tree: `git status` and `git diff` before every task, build on what lands, never `git add -A`, stash or reset, and stage only immediately before committing. |

## Target architecture

**Process.** Main Bun process: SPA, `/api`, `/ws/app`, `/ws/browser`, `/oracle/*`, `/telegram/webhook`, a workspace registry per DID (`WorkspaceSession`, run, parked approvals, `RemoteBrowser` or null, idle timer) and the seat pool. Per active user: a spawned worker running `packages/browser/src/worker.ts` with `ipc` and advanced serialization, an env allowlist (no secrets in the process that renders hostile pages), owning one `BrowserSession` and one Chrome profile. Frames travel over the same IPC as bytes with a 2-frame credit; `freeze`, `agent.*`, `client`, `watch`, `shutdown` are the commands. `RemoteBrowser` implements the same `BrowserHandle` as the in-process session, so tools, sockets and the registry never know which they hold. _Landed._

**Money.** `session.spend()` stays the single choke point, inside a per-user lock: find, since, authorize, reserve or refuse, then settle with a frozen/aborted re-check immediately before the outbound call, then receipt. `packages/payments` declares signer ports (`EvmSigner`, pocket) as plain interfaces; `packages/wallet` provides the Privy-backed `EvmSigner`; they meet only in `apps/server/src/services.ts`. Networks are CAIP-2 literals (`eip155:8453`, `eip155:84532`, `hedera:testnet`); rules gain an optional `network` scope; provenance has `user` (address typed by the human this run); `ask_exemption` is what `allow_session` writes. _Landed except the `EvmSigner` port, network-scoped rules and `ask_exemption` (P2.2, P2.5)._

**UI.** "The conversation is the ledger." Header strip (balance, today versus cap meter, driving badge, Freeze), chat column with the live browser card inline (one 2px driving ring everywhere: amber breathing for the agent, blue solid for the human, dotted grey when frozen), receipts as perforated tickets (body: what and why; stub in mono: rule id, tx id, HCS sequence, ledger line), approval as a ticket whose stub holds the four buttons and a countdown, a details drawer for the mandate editor, history, Telegram and delete. Fonts: Bricolage Grotesque (display and money), Onest (body), IBM Plex Mono (machine facts). Light warm-paper tokens in `packages/ui/src/styles/globals.css`, Motion springs, reduced motion honoured. _Not started._

## Backlog

Hours are single-agent estimates. Every task ends with `heavy bun run check` green (a 75 exit means retry, not failure) and its own commit; `bun run e2e` for anything visible. **Reuse, do not rewrite:** `authorize()` (`packages/wallet/src/policy.ts`), the ledger serialisation idiom (`packages/wallet/src/ledger.ts`), `BrowserSession` and its arbitration, screencast and snapshot, `ChatRunRegistry` replay (`apps/server/src/runs.ts`), `createPainter` latest-frame-wins (`apps/web/src/hooks/use-browser-socket.ts`), `std()` (`apps/server/src/std.ts`), `Workspaces` and `freeze()` (`apps/server/src/workspaces.ts`, `freeze.ts`), `bearerFromRequest` and `authenticate` (`apps/server/src/auth.ts`).

### P0. Baseline and hygiene (Day 1, Sat 5)

| # | Task | Gate | State |
| --- | --- | --- | --- |
| 0.1 | Take the concurrent session's commits, run the gate on HEAD, record deltas in `STATUS.md`. | gate green on HEAD | done |
| 0.2 | Pin Bun 1.4.2 everywhere; drop the hand-written `Bun.WebView` types. | check green on 1.4.2 | done `8c99fd1` |
| 0.3 | Name scrub of every prior-project mention; `tools/check-names.ts` in `check`. | names check exits 0 | done `8f060ff` |
| 0.4 | Doc move with history to `docs/plan/` and `docs/research/`; index. | `git log --follow` works | done `07d41c8`; pre-spec files archived 5 Sep evening |
| 0.5 | Railway IaC: `checkSuites: true`, `preserve()` for new variables, volume 10 GB, `.railway/README.md`. | plan shows only intended diffs | done `3c860e9` |
| 0.6 | Repo public after 0.1 to 0.4. Secret grep of history first. | owner clicks | **open: still private at 18:10** |
| 0.7 | Memory notes for future sessions. | — | done |

### P1. Platform: isolation, kill switch, hygiene, model (Days 1 to 3)

| # | Task | Gate | State |
| --- | --- | --- | --- |
| 1.1 | Contracts: `WorkerCommand`/`WorkerEvent`, `BrowserStatus` plus `queued`, `BrowserState.queue`/`frozen`, `ServiceModes.database`/`telegram`, TypeIDs `ApprovalId` (`apr`), `PaymentId` (`pay`), `DirectoryId` (`dir`), `PocketId` (`pkt`), `JobRunId` (`job`), `SpendStatus` plus `abandoned`/`refused`, `PublicHttpUrl`, `Network` as CAIP-2, `Provenance` plus `user`, `run.status` message. | typecheck; `url.test.ts` | partial: worker protocol, queue state, CAIP-2, `user`, `PublicHttpUrl` landed (`edf4435`, `362d920`, `09bac94`, `f491806`); `SpendStatus` additions `4c251d5`; the five TypeIDs (`ApprovalId` mid-edit at 18:45) and `telegram` mode open |
| 1.2 | Browser worker: `BrowserHandle`, freeze gate on `agent.*`, cast only while watched, private-network blocklist per tab, graceful `Browser.close`, thin `worker.ts`, `worker-host.ts` with env allowlist, `RemoteBrowser` with deadlines and crash reporting. | protocol test; manual spawn | done `edf4435`, ADR 0006 |
| 1.3 | Registry: seats (`MAX_BROWSERS=8`, `RESERVED_BROWSERS=1` for `DEMO_USER_DID`), FIFO queue with published positions, idle sweep (`BROWSER_IDLE_MS`), `freeze(userId, reason)` as the one function, `InteractionRegistry.park()` three-way race, `startRun()` extracted for Telegram reuse. | pool, race and freeze tests; two accounts get two screencasts on Railway | done `362d920` except `startRun()` extraction (with P4) and the two-account check on Railway |
| 1.4 | Choke point: per-user lock around find/since/authorize/reserve; `refused` rows; in-flight same-key join; replay returns settlement and cached body; `abandoned` versus `failed`; `SpendIntent` decoded at runtime; frozen/aborted re-check before `settle()`; receipts and mandates through a `Store`; migration `0001`; Railway `preDeployCommand`. | `session.test.ts` concurrency and replay cases | done: same-key concurrency `5db02e8`; Postgres ledger `35742fe`; one lock around price, policy and reservation, `refused` rows under their own key, `abandoned`, decoded intent, and a store for the frozen flag, mandate and receipts `4c251d5` (ADR 0005 amended) |
| 1.5 | Outbound hygiene: `safeFetch` (DNS refuse private, manual redirects re-validated, 15 s, 1 MB), `x402_fetch` order URL check then directory then probe, `browser_navigate` validates before IPC, `x-payment-response` decoded as base64 `SettleResponse`. | private literal, `.internal`, redirect-into-private refused | done: allowlist before first fetch `5db02e8`; private network blocked in the worker `edf4435`; `publicHttpUrl`, `safeFetch` with DNS and three re-checked redirects, `browser_navigate` scheme check, `SettleResponse` header on both sides `f491806` |
| 1.6 | Model provider chosen from placeholders (`openai-compatible`, `anthropic`, `stub`); DashScope wiring; daily budget (`MODEL_RUNS_PER_DAY`, `MODEL_STEPS_PER_DAY`, demo exempt); scripted model reaches `spend()`. Verify one live tool-calling turn against qwen3-max. | model tests; live turn produces a tool call | partial `56290f8`: provider selection, DashScope wired, scripted model pays the oracle. **Blocked:** the DashScope key on the box is rejected by every host; no live turn yet; daily budget open |
| 1.7 | Auth polish: token-to-DID cache, `DEMO_USER_DID`, `database` chip, Privy dashboard origin, `VITE_PRIVY_APP_ID` on Railway. | `auth.test.ts` | partial: auth `3622c96`, `DEMO_USER_DID` and `database` chip landed, `VITE_PRIVY_APP_ID` preserved in IaC `61fdf1e`; token cache and the Privy dashboard origin open |
| 1.8 | Env, IaC, Docker for every new variable; ADR 0006. | docker build boots, migrates, spawns a worker | partial: seat variables, model variables, volume, ADR landed; `TELEGRAM_*`, `POCKET_KEK`, `MODEL_*` budget open |

### P2. Money: Hedera, Graph, Privy, approvals, directory, jobs (Days 1 to 5; the three qualifications first)

| # | Task | Gate / evidence | State |
| --- | --- | --- | --- |
| 2.0 | Owner's keys and spikes; spike scripts under `tools/spikes/` (`privy-deny`, `privy-policy`, `hedera-topic`, `hedera-settle`, `graph-freshness`). | HEDERA/PRIVY/GRAPH.md skeletons hold ids and transcripts | partial: two funded Hedera testnet accounts (pocket `0.0.9700388`, payee `0.0.10377647`) and a Graph Studio key are on the box and on Railway; the Privy keys and the spike scripts do not exist; the DashScope key is rejected |
| 2.1 | **Hedera live settlement.** `GET /supported` at boot (fail closed), `extra.feePayer` in the 402, response header as base64 `SettleResponse`, requirement selected by network, payer distinct from payTo, `/health` reports `hedera: live`. | HashScan SUCCESS ids (local and hosted) in HEDERA.md | done `e56b38d`: fee payer read from `/supported` at boot, `HEDERA_PAY_TO` split from the pocket, first real settlement 0.05 HBAR SUCCESS (`hashscan.io/testnet/transaction/1788625330.599677104`); `SettleResponse` header `f491806`. HEDERA.md does not exist yet, so the id lives in the commit message and here |
| 2.2 | Domain rules: network-scoped caps and allowlists, `ask_exemption`, `Failure`, `policyId` and `ledgerLine` on receipts, `Evidence.deployments[]`, `quoteFor(asset)`; default rules per network; ask above $1. | policy tests | partial: CAIP-2 and `user` provenance `09bac94`; scoping, exemption, receipt fields open |
| 2.3 | **Graph registry.** Four Messari deployments, `_meta` freshness gate, `studioProvider` and `x402Provider` behind one interface, `servedBy` on rows and receipts, fixture per deployment, oracle body as the metered brief, `skills/graph-lending/SKILL.md`. | four fresh blocks from the hosted URL in GRAPH.md | live `84dfdd7`, `e56b38d`: three protocols at one block through the Studio key (Spark, Aave v3 Ethereum, Compound v3); Aave v3 Base is unindexed on the network and reported unavailable, so the registry serves three of four; x402 provider, metered brief, SKILL.md open |
| 2.4 | **Privy wallets, policy, signer.** `P_agent` from constants (rules a, a′, b, c) owned by a policy-owner key; `privyAgentSigner` implementing `EvmSigner`; `SignerRefusal` decoded; `wallet_send` provenance; a real raw denial with policy id. | denial card with policy id on the deploy; fixtures | partial `2f5891c`: client-minted wallet, agent added as signer under `docs/privy-agent-policy.json` (rule a only, cap $0.25), freeze revokes. Signing call, rules b and c, owner key, raw denial open |
| 2.5 | **EVM x402 via typed data.** `ExactEvmScheme(signer)` (EIP-3009), `multiPayer` by network, Graph `paidFetch` through `session.spend` for the demo wallet. Verify against the testnet gateway first; `@x402/evm` fallback. | Basescan tx and the exact types map in PRIVY.md; a $0.03 attempt denied | open |
| 2.6 | **Pocket, payment state machine, HCS, service card.** Pocket account per user from the treasury, AES-GCM sealed under `POCKET_KEK`; `PaymentRecord` reserved/signed/settled/failed with mirror-node reconciliation; one HCS message per settlement; one-time receipt token so the shared Chrome navigates to the unlocked page; `/.well-known/x402.json`. | paid-twice-charged-once test; pocket per user; HCS sequence; curl-able card | open |
| 2.7 | **Approvals.** On `ask` publish `approval.request`, park; `allow_once`, `allow_session` (writes `ask_exemption`), `deny`, `deny_stop` (freezes), timeout; jobs get `approval_unavailable`. | race test; e2e round trip | partial `362d920`: registry, ownership check, re-send to a reconnecting tab. Spend path does not park yet |
| 2.8 | **402 probe and directory.** `probe.ts`, `POST /api/directory/probe`, `x402_probe` tool, per-user `DirectoryEntry` rows, `x402_fetch` pays only directory URLs, allowlist rebuilt from the directory. | unsupported card; peer 402 paid on camera | open |
| 2.9 | **Top-up under rule b.** `signTransaction` plus minimal JSON-RPC, `wallet_topup`, treasury credits the pocket at a documented rate, `mockBridge: true` on the receipt; third top-up denied by aggregation. | Basescan transfer; aggregation result in PRIVY.md | open |
| 2.10 | **Freeze end to end.** Policy rules wiped with the owner key, signer removed, pocket deleted to treasury, worker frozen. Unfreeze is human-only and rebuilds. | mirror node shows the pocket deleted; no signer | partial `362d920`: flag, abort, approvals denied, browser frozen, signer revoked. Rules wipe, pocket delete, unfreeze open |
| 2.11 | **Daily job runner** (cut first). `runDailyFor(userId)` on a derived job mandate, 60 s and 12 steps, one directory pay, `Digest` to a sink; `runTurn()` shared with chat. | job tests | open |

### P3. Product UI (Days 2 to 5, video path first)

Nothing in P3 has started; the app is the bootstrap three-pane dark UI. How much of this fits before the Thu 10 12:00 freeze is an open question in `DECISIONS.md`.

| # | Task | Gate |
| --- | --- | --- |
| 3.0 | Foundation: light tokens, fonts, `MotionConfig`, `packages/ui` allowlist plus `motion` and `lucide-react`, shadcn adds, `ticket`, `chrome-bar`, `driving-ring` primitives; drop the dark class and scanlines. | check and e2e green; screenshot reviewed |
| 3.1 | Sign-in gate with `PENDING` and `FAILED` identity states. | gate e2e with the Privy fake |
| 3.2 | Header strip: `WalletStrip`, `LeashMeter`, `DrivingBadge`, `FreezeButton`; `use-app-socket` as a pure reducer. | reducer tests; frozen e2e |
| 3.3 | Stream model: `StreamItem` (message, receipt, approval, run-status, queue, error) sorted by time; tool-call cards; reasoning disclosure; error and budget cards. | stream tests |
| 3.4 | Live browser card: `BrowserPainter`, letterbox-aware pointer mapping, chrome bar, driving ring, sticky compact mode, snapshot card, keyboard access. | letterbox tests; click accuracy on a square pane |
| 3.5 | Approval ticket: four buttons in order, countdown, resolves on every tab. | approval e2e |
| 3.6 | Tickets: `ReceiptCard`, `DenialCard`, `GET /api/receipts` backfill on welcome. | reload keeps receipts |
| 3.7 | Details drawer: policy card and mandate editor, history, Telegram pairing, delete-my-data. | edit lowers the threshold in the approval e2e |
| 3.8 | Pop-out: inline, split, window; `BroadcastChannel` claim and release. | pop-out e2e |
| 3.9 | States: queue card, starting skeleton, disconnected banner, budget, phone read-only strip. | queue e2e with one seat |
| 3.10 | `ProbeCard`, `DirectoryCard`, `TopUpCard`, `PocketCard`. | renders from a Base-only 402 fixture |
| 3.11 | E2E suite: gate, approval, pop-out, queue, frozen, runtime. | `bun run e2e` green in CI |

### P4. Telegram via Chat SDK (Day 5, after P1 to P3 core)

Open. Whether it is in scope or stretch is an open question in `DECISIONS.md`.

| # | Task | Gate |
| --- | --- | --- |
| 4.1 | Verification: install `chat@4.40.0` and adapters, read the shipped docs, confirm no hard `zod` import, smoke-construct with memory state. | notes in `docs/decisions/0007-chat-sdk.md` |
| 4.2 | Pager: `TelegramPager` behind one interface with a loud stub; webhook outside the `/api` auth group; `/start <code>` pairing; Freeze button with a single-use nonce; `onDirectMessage` starts a run on the user's session and streams back; `ask` during a Telegram run deep-links to the workspace; digest at the user's hour. | pairing and nonce tests; manual pair, Freeze, DM |

### P5. Evidence, README, submission (continuous; consolidate Day 6)

Open. README in winner shape (one sentence and tagline, problem, what it does with a screenshot, demo beats with timestamps, where each integration lives, on-chain evidence table, run locally with the curl-able 402, honesty box, not in scope, AI use, team). `HEDERA.md`, `PRIVY.md`, `GRAPH.md`, `AI-USE.md` as skeletons with `TODO(tx)` markers, filled the hour each beat lands. Video Day 7 (2 to 4 minutes, 720p or better, human voice, product on screen at 0:00, explorer pages in the back half). Submit Day 8 by 20:00 CEST; select Privy, The Graph, Hedera.

### P6. Stretch, only after P0 to P5 are green (Days 6 to 7)

| # | Task | Gate |
| --- | --- | --- |
| 6.1 | **WebMCP producer**: `get_balance`, `get_policy`, `list_receipts`, `pay_402` registered on the page's model context once authenticated; `pay_402` goes through the same tool, policy and approval path. | DevTools WebMCP panel lists four tools; `pay_402` produces a ticket |
| 6.2 | **WebMCP consumer**: `BrowserSession.pageTools()` over CDP, static `page_tools` and `page_tool_call` tools, outputs fenced, page tools can never move money. | our oracle page registers `describe_offer`; the agent lists and calls it |
| 6.3 | **Injected `window.ethereum`**: EIP-1193 and EIP-6963 provider on allowlisted origins only, every request an approval ticket, `to` is provenance `page` unless allowlisted, infinite approve always refused, freeze emits `disconnect`. Testnet only. | test dapp lists Froggy; allowlisted transfer yields a ticket; unlisted address refused |

## Owner steps (dashboard, keys, money) with pass criteria

State at 18:45 on Sat 5 Sep: step 2 done except the HCS topic, step 3 done, step 6 blocked on a rejected key, the rest not started. Items 1 to 3 gate the three tracks.

1. **Privy dashboard (existing app):** add the Railway origin to allowed origins; email and Google login on; embedded-wallet creation on login stays **on** (deviation adopted, see `STATUS.md`); create two P-256 authorization keys (agent signer, policy owner); mint the key quorum and `P_agent`; set `PRIVY_*` on Railway and `VITE_PRIVY_APP_ID` at build time. Pass: `privy-deny.ts` prints a denial naming the policy id.
2. **Hedera portal:** done for two ECDSA testnet accounts (pocket `0.0.9700388` pays, payee `0.0.10377647` receives; one shared pocket for now, not one per user); an HCS topic is still to create. Pass: mirror-node balances; Blocky402 `/supported` prints a `0.0.x` fee payer and the boot log matches.
3. **Subgraph Studio:** done; the key is on the box and on Railway. Three of four deployments answer; Aave v3 Base has no allocations on the network. A new key is rejected for about a minute after creation (propagation, not a bad key).
4. **Funding:** demo Privy wallet gets about $5 USDC on Base mainnet plus Base Sepolia USDC and a little Sepolia ETH; `TREASURY_EVM_ADDRESS` set. Pass: Basescan balances.
5. **BotFather:** bot token and `/setdomain`; `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET_TOKEN`.
6. **Model:** a DashScope key that the intl compatible-mode host accepts for `qwen3-max`. The key on the box at 18:00 was rejected by every host (`invalid_api_key`, "token expired").
7. **`POCKET_KEK`:** 32 random bytes base64, Railway only.
8. **`DEMO_USER_DID`:** the judge or demo account's Privy DID.
9. **Repo public.**

## Timeline and cut lines (CEST)

As written on Saturday morning. Saturday's actual state at 18:45: P0 done except the repo flip; 1.2 to 1.5 landed, most of it a day early; 1.6 wired but no live model turn; the first real Hedera settlement is on chain and The Graph answers live through the Studio key; Privy keys, the pocket, EVM signing and every UI task are untouched. The cut lines are re-dated in the planning session recorded in `DECISIONS.md`.

| Day | Must be green | Cut line |
| --- | --- | --- |
| Sat 5 | P0 complete; 1.1, 1.6 (model live), 2.1 (first Blocky402 settlement), owner steps 1 to 3 started | — |
| Sun 6 | 1.2 to 1.4 (worker isolation on Railway, ledger fix), 2.2 to 2.3 (Graph live), 3.0 to 3.2 | **Sun 22:00:** if worker isolation is not usable, ship one seat plus queue and never touch isolation again |
| Mon 7 (check-in 1) | 2.4 to 2.5 (Privy wallet and real signed flow), 2.7 approvals, 3.3 to 3.6 | **Mon 22:00:** if the agent loop cannot drive the hosted Chrome end to end, Tue is a fix day and 2.11 and P4 move to stretch |
| Tue 8 (feedback 14:00 EDT) | 2.6 (pocket, HCS, unlock), 2.8 directory, 3.7 to 3.9, first stranger with a ticket | — |
| Wed 9 | 2.9 top-up, 2.10 freeze, 3.10 to 3.11, P4 Telegram | **Wed 22:00:** any red core item cancels all of P6 |
| Thu 10 (check-in 2) | feature freeze 12:00; P5 evidence complete; restart drill | — |
| Fri 11 | video (three takes), release tag, hourly curl on `/health` and the 402 | — |
| Sat 12 | submit by 20:00 CEST | — |

## Verification (end to end, no stub can stand in)

- `heavy bun run check` and `bun run e2e` green on every commit; CI green on every sha (deploy gated by `checkSuites: true`).
- Two Privy accounts on the Railway URL get two workers, two profiles, two screencasts; the second cannot see the first's receipts; `curl` without a token gets 401 on `/api/*` and on both upgrades.
- Restart drill: redeploy; profiles, mandates, receipts, frozen flags and idempotency survive; a queued user sees a position.
- Money: HashScan SUCCESS for our brief with payer distinct from payTo and an HCS sequence; four fresh Graph blocks on a receipt; Basescan `TransferWithAuthorization` from the Privy wallet under `P_agent`; `wallet_send` to `0xdead` gives a raw Privy denial with policy id, and a page-sourced address gives `untrusted_provenance` before any Privy call; same payment id twice settles once; freeze mid-run aborts the run, freezes the worker, removes the signer, deletes the pocket on the mirror node.
- UI: approval ticket round trip from two tabs; pop-out to split and to a window; click accuracy on a square pane; reload keeps tickets; phone shows the read-only strip.
- Telegram: `/start CODE` pairs, Freeze tap stops a live run, a DM turn appears in the web app.

## Risks

- **Concurrent sessions.** Several agent sessions commit to this tree, minutes apart. Before every task, `git status` and `git diff` first; never `git add -A`, never stash or reset; stage only immediately before committing, because a neighbour's `git commit` takes whatever is in the index (the archive move of 5 Sep travelled in `4c251d5` this way).
- **Bun.WebView worker IPC** was new ground and has landed; the 35 s deadlines, credit scheme and `disconnect` exit are the guards.
- **Privy rule b aggregation** semantics are inferred (field path `transfer.to`, per-wallet scope); the spike proves them before the JSON is committed.
- **EVM x402 payload shape** inferred from the spec; testnet gateway check first, `@x402/evm` fallback.
- **Blocky402** rate limit or double charge on retry: state machine plus reconciliation; record the paid beat as its own take.
- **qwen3-max tool calling** through compatible mode: unverified until a working key lands; the scripted model remains the keyless fallback.
- **Rules risk** from stripping prior-project mentions: the owner's call; `AI-USE.md` still discloses AI tooling and generic pattern sources without naming repos.

## Calls made without asking (veto any)

- `UserId` stays the branded Privy DID (no `usr_` TypeID plus lookup table).
- Profile directories use the hashed DID rather than the raw DID in the path.
- Research digests got the same name scrub as everything else and live under `docs/research/`.
- `motion` and `lucide-react` join `packages/ui`'s allowlist; `pg` enters the process via `@chat-adapter/state-pg`; `@hiero-ledger/sdk` pinned to 2.85.0.
- Approval labels map to the existing literals (`allow_once`, `allow_session`, `deny`, `deny_stop`); no protocol rename.
- Fonts: Bricolage Grotesque, Onest, IBM Plex Mono; light theme only, no toggle.
