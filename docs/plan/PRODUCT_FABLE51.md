# Product spec (FABLE51)

Written Sat 5 Sep 2026. This is the revised product for ETHOnline 2026 (submission Sun 13 Sep 12:00 EDT; internal deadline Sat 12 Sep 20:00 CEST). It is the consensus of a six-design panel (prize-first, user-first, contrarian, build-in-public-first, engineering-first, CEO) judged three ways, with the tester and engineering refutations applied and a rules pass of my own. Evidence: `../research/panel-*_FABLE51.md`. It is written as a plan, not as an audit of the current code; where a decision touches implementation detail it names the capability, and the engineering owner decides the file.

Times are CEST (the team's clock; Jonas's machine shows EEST, one hour ahead). "Day 1" is Sat 5 Sep because the original day 0 (Fri 4 Sep evening) has passed with none of its checklist done; the plan is eight days plus a submission morning.

---

## 0. What we build

**One sentence.** An open-source web workspace where your AI agent drives a real Chrome you can watch, grab and freeze, and spends from a prefunded pocket whose rules live outside the model: a Privy policy on the EVM leg (per-payment cap, payee allowlist, 24-hour top-up cap), a host-enforced ledger on the Hedera pocket, and a kill switch that removes the agent's signer and deletes the pocket key. On camera it reads live Messari lending data from The Graph at a cent a query, pays our x402 brief and a peer team's 402 on Hedera through Blocky402, and cannot send a cent to 0xevil because Privy says no, not the prompt.

**Tagline (under 100 characters).** One Chrome, two drivers: your agent pays x402 on Hedera, you hold the wheel and the kill switch.

**Twenty-second pitch.** Every agent wallet shipped this year hands a model a key and a cap. You never see what it does with the key, and in May one got talked into moving $175K by a tweet in Morse code. This gives the agent a Chrome you can watch, grab and freeze, and a pocket whose rules live outside the model: a Privy policy caps every EVM signature, a host ledger caps the Hedera pocket, one Telegram tap freezes both. In the demo it buys its own eyes from The Graph at a cent a query, pays our x402 brief and another team's 402 on Hedera through Blocky402, gets an HCS receipt, and when I tell it to send everything to 0xevil, Privy says no. Testnet money, mainnet data, open source, live at a URL you can click.

**Name.** The team's call; the tagline, not the name, carries the browser. Shortlist from the panel: Pocketwatch (pocket = allowance, watch = you can see it), Handbrake, Tandem, Reins. Keeping the current repo name costs nothing and renaming costs a morning. Avoid "Leash" (hms1499/leash shipped this week) and "Tether" (AgentTether is an ETHOnline peer).

**The wedge (from the user-first design, which every judge placed first or second).** "Paste your hedera:testnet 402. A leashed agent pays it on camera." Our own Graph-grounded brief is the first directory entry, so the product works with zero third parties and every peer seller becomes a receipt.

---

## 1. Who it is for this week

See `TARGET_GROUPS_FABLE51.md`. Primary: peer x402 sellers on Hedera testnet (counterparties and Validation evidence). Secondary: developers whose coding agent spends money. Tertiary: Graph standardized-data analysts. Judges read the repo, the showcase page and the video; they never log in.

---

## 2. The product

Three panes in one page, desktop-only (phones get a clip, a read-only screencast of the judge worker and "send me the desktop link").

1. **Shared Chrome pane.** A JPEG screencast of a Chrome on our server, one tab, amber border while the agent drives, blue when you grab it (move the mouse in, 1.5-second human-quiet window, 15-second starvation cap), grey when frozen. Fresh profile per session, wiped at session end, no imported cookies, no `window.ethereum`. Exact-origin allowlist with a real URL parser; `data:`, `blob:`, `javascript:` and `file:` denied; banking, email and exchange domains denylisted; page-initiated navigations (redirects, `location.href`, `window.open`) pass the same check, not only the agent's navigate tool.
2. **Wallet pane.** The policy card (rule labels and Privy policy id), the pocket balance and today's spend against the caps, the directory of allowed sellers with a paid-calls counter, the receipts list, a "paste a 402 URL" box that probes before it pays, and the Freeze button.
3. **Chat pane.** The agent's tool calls stream here; two pre-typed buttons for strangers: "Tell it to pay 0xevil" (a Privy denial card in about ten seconds) and "Let it buy something (0.05 tHBAR brief)". Every denial renders a blocked card with a share button.

**Entry.** Two doors: "Try it" (guest: an app-owned Privy wallet plus a Hedera pocket, prefunded with testnet funds, IP cap three per day, thirty guest slots plus ten reserved for judges, 48-hour TTL extended to 14 Sep when Telegram is paired) and "Sign in with email" (Privy OTP in the user's own browser; the wallet is theirs, the agent is a revocable additional signer). Guest identities are pre-provisioned in a pool of three so a click starts the run, not the provisioning.

**Telegram.** A pager, not an approver and not the front door: pair by `/start <code>` issued from the workspace (no reliance on the unverified bot-first identity merge), a Freeze inline button (server nonce, five-minute TTL, `callback_query.from.id` must match the paired user, free text is never an action), the morning digest at the hour and timezone the user chose at pairing, an "Open workspace" deep link, and `/bug` as a DM. No approval cards in v1; Privy Intents only inside the Wednesday time box.

**Receipts.** Every spend and every blocked attempt is a receipt: Graph deployment ids and block numbers, which Graph path served it (x402 or Studio key), the policy id and rule that allowed or denied, the Hedera transaction id and HashScan link, the HCS sequence number, the ledger line ("0.10 / 2 tHBAR today"). A public receipts page shows per-endpoint paid-call counters and the blocked board (handle credit, opt-in). Never a tester identifier inside an HCS message.

---

## 3. The one job and the daily job

**Session job (interactive, and the demo).** "Find the cheapest variable USDC borrow across Aave v3, Compound v3 and Spark, buy the brief, then pay fare402 for one lookup." The agent runs one Messari-standardized query across four pinned deployments through the registry, picks the minimum with provenance, tops up the pocket under the Privy rule if it is low, navigates the shared Chrome to our 402 page, the host pays 0.05 tHBAR through Blocky402, the page unlocks through a one-time receipt token, and the receipt card lands. Then any directory URL the user clicked, under the per-call cap.

**Daily job (the day-2 mechanic).** Once a day at the hour the user picked, a bounded run on the hosted box (60 seconds wall clock, 12 tool steps, hard budget 0.5 tHBAR plus $0.05, no approval path): the same query, the brief re-bought (a new Blocky402 settlement and HCS receipt per tester per day), at most one directory endpoint paid, round-robin across testers, at the seller's real price capped at 0.1 tHBAR. Directory pays are never automatic beyond that one; a tester who wants the agent to buy from five strangers clicks for it (the "$3,400 proxy loop" is exactly the behaviour we must not reproduce). One Telegram message: the number and its delta versus yesterday, what it bought, what it refused and why (policy id), explorer links, Freeze and Open buttons. If the daily job is cut for time, the README says "the product is a session tool" and nothing pretends otherwise.

---

## 4. Custody and policy

Two pockets, two leashes, said the same way in the README, PRIVY.md, the consent screen and the video.

**W_user: the user's Privy embedded wallet.** Created server-side at first session with the user as owner and the agent's server-held P-256 authorization key as an additional signer under override policy P_agent. Guests get the same shape with a server-held owner key and a TTL. The model never sees a key; it calls host tools.

**P_agent, default deny, JSON committed in the repo.** Exactly two allow rules plus an expiry:

| Rule | Method | Conditions | What it is for |
| --- | --- | --- | --- |
| (a) | `eth_signTypedData_v4` | domain chainId 8453, verifyingContract = Base USDC, `message.value` at most 20000 ($0.02), `message.to` in the condition set {The Graph's payTo}; the TransferWithAuthorization types map copied byte-for-byte from the first real signing request | x402 payments to The Graph's mainnet gateway, demo wallet only ($5 team money plus $5 reserve) |
| (b) | `eth_signTransaction` (host broadcasts; never `eth_sendTransaction`, which carries no stateful aggregation; only `eth_signTransaction` and `eth_signUserOperation` do) | Base Sepolia by default: `to` = Sepolia USDC, decoded calldata `transfer.to` in {treasury}, `transfer.amount` at most 2 USDC, rolling 86400-second sum at most 5 USDC, scoped per wallet; if the 30-minute Hedera-EVM spike passes: chain 296, `to` in {the user's own pocket alias}, `value` at most 2 tHBAR, 24-hour sum at most 10 tHBAR | The pocket top-up: the one unmistakable Privy "transfer" on screen with its aggregation |
| (c) | both | `system.current_unix_timestamp` at most creation plus seven days | Expiry |

No rule exists for `eth_sendTransaction`, `personal_sign`, `exportPrivateKey` or `eth_sign7702Authorization`, so they are denied by default; raw signing (`secp256k1_sign`) is not a policy method at all, and the 15-minute test of what Privy does with it under a policy is published either way. `wallet_send` is a real tool on purpose: a user-typed address carries provenance "user", passes the host provenance gate, is built as an `eth_signTransaction` and is denied by Privy with the policy id (the video beat); an address that appeared only in page content or model output carries provenance "page" or "model" and is refused by the host before Privy is called (the injection beat). The wallet pane renders the policy id and rule label from the committed JSON and appends Privy's raw error text underneath, so the beat survives any error shape.

Privy cannot express a daily cap on typed-data payments (aggregations cover only `eth_signTransaction` and `eth_signUserOperation`), so the host keeps a serialized per-wallet USDC ledger ($1 per day on the demo wallet) checked before any signature is requested. Privy's own rolling cap updates after signing, so the host also serializes W_user signatures per user. Wording everywhere: "enforced server-side under policy", never "in the enclave".

**K_pocket: one Hedera testnet ECDSA account per user**, created by the host at first session from a treasury account, key encrypted at rest under one server env key, never in the model context or the page. It signs x402 TransferTransactions (HBAR asset 0.0.0, one node per transaction). Privy has zero policy coverage here (raw signing is not in the policy method enum; Hedera is a Tier 1 chain), so the host enforces: 0.5 tHBAR per call, 2 tHBAR per rolling 24 hours (demo pocket 1 and 5), payTo must be a server-issued directory id (never a URL that appeared only in page content or a 402 body), the 402's `accepts[]` must match `hedera:testnet` with the fee payer read from Blocky402's `/supported` at boot, spends serialized per user, and an idempotency state machine (reserved, signed, settled) keyed on a client-minted payment id stored with (session, URL, amount): replay returns the cached body, a mismatch returns 409, a facilitator timeout reconciles against the mirror node. The only way value enters K_pocket is the Privy-policied transfer in rule (b), or the documented treasury credit that follows it.

**Service side.** payTo is a real 0.0.x account (aliases are rejected), an HCS topic for receipts, facilitator `https://api.testnet.blocky402.com`, network `hedera:testnet`, price 0.0125 tHBAR per deployment (0.05 for the four-deployment brief), a one-time receipt token in the paid response so the shared Chrome can navigate to the unlocked page (the browser never pays; the host pays), a `/.well-known/x402.json` service card.

**Where each cap is enforced** (this table goes in the README and PRIVY.md):

| Cap | W_user | K_pocket |
| --- | --- | --- |
| Per call | Privy (rule a `value`, rule b `amount` or `value`) | Host ledger, checked before signing |
| Daily | Privy 86400-second aggregation on rule b (plus host serialization); host ledger for typed data | Host ledger |
| Recipient allowlist | Privy condition sets | Host directory of 0.0.x payTos |
| Expiry | Privy timestamp condition plus host session TTL | Host session TTL |
| Kill switch | Frozen flag before every call; signer removal | Frozen flag; key wiped |

**freeze(user, reason), one function, never a tool.** (1) Set `frozen_at` on the user, checked before every Privy call and every pocket signature (agent access tokens can live up to 15 minutes, so this flag is the real gate); (2) abort the active run through the server-owned abort controller; (3) remove the agent signer from W_user; (4) wipe the pocket key ciphertext and sweep remaining HBAR to the treasury; (5) send the Telegram message. Triggered from the wallet pane or the Telegram button. Unfreeze is a human action in the web pane that creates a new pocket key and re-adds the signer. Never exposed as agent tools: freeze, unfreeze, raise_limit, add_payee, resolve_approval, policy edits. The hard stop for a host compromise is rotating the app's authorization key in the Privy dashboard, which kills the agent for every user at once; the honesty box says so.

**README sentence, verbatim.** "Privy's policy engine gates every EVM signature the agent produces (the x402 EIP-3009 payments to The Graph and the pocket top-ups) with a per-payment cap, a rolling daily cap on top-ups, a recipient allowlist and an expiry; the kill switch removes the agent's signer from the wallet. Hedera transactions are raw-signed and Privy only evaluates policies on transactions it can decode, so the Hedera x402 leg is paid from a separate host-held pocket with host-enforced caps; the only way funds enter that pocket is a Privy-policied transfer, and the kill switch deletes the pocket key." Video line: "Privy is the leash on your wallet. The Hedera pocket is the agent's lunch money."

---

## 5. Sponsor integrations (summary; the audit is in `PRIZE_AUDIT_FABLE51.md`)

- **Hedera.** We host the x402-gated brief service on `hedera:testnet`, settled through Blocky402, metered per deployment, an HCS message per settlement, a service card, a curl-able 402 printed in the README. Our agent and the daily cron consume it; the agent also pays peer endpoints from the directory.
- **The Graph.** One Messari standardized lending query shape run unchanged across four pinned live deployments: Aave v3 Ethereum `JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk`, Aave v3 Base `D7mapexM5ZsQckLJai2FawTKXJ7CqYGKM8PErnS3cJi9`, Compound v3 Ethereum `AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9`, Spark Lend `GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si` (three protocols, two chains; two chains of one protocol would be the weakest reading of "standardized"). A registry JSON, a freshness gate (block older than two hours returns "unavailable", fail closed), deployment id and block on every row and receipt, the Subgraph MCP for discovery documented in a SKILL.md. Two providers behind one interface: the Studio Free Plan key (wired first, silent fallback, the tester default) and the mainnet x402 gateway at $0.01 per query from the demo Privy wallet; the receipt records which. No Base Sepolia Graph path (the documented testnet host does not resolve; the live one almost certainly does not serve Messari).
- **Privy.** Every user is a Privy user with an embedded wallet; the agent is a revocable additional signer under a default-deny policy on the free Developer plan; the top-up transfer with its visible 24-hour aggregation is the headline flow; the typed-data x402 payments are the second; the raw denial with policy id is the control beat; PRIVY.md holds the policy JSON, wallet ids, the denial transcript, the 15-minute `secp256k1_sign`-under-policy test result, and the "what Privy does not gate" section.

---

## 6. Demo beats (ten beats, 3:15, never past 3:40 on a retake)

| Time | Beat | Evidence on screen |
| --- | --- | --- |
| 0:00-0:06 | Product on screen, no title card: the three panes, amber border, policy card. Jonas on face cam: "The agent is driving that Chrome. I can grab it any time." | Policy id, pocket balance, directory count |
| 0:06-0:16 | Problem, product still visible: keys and caps, the $175K Morse-code drain, "here the rules live outside the model" |  |
| 0:16-0:24 | Typed live: the session job | Tool calls streaming |
| 0:24-0:48 | The Graph: four pinned deployment ids with block numbers, the winner, four $0.01 receipts "allowed by Privy policy <id> rule a"; three-second cut to Basescan | TransferWithAuthorization from the Privy wallet |
| 0:48-1:25 | Hedera, one unbroken take: pocket low, top-up under rule b with the 24-hour sum shown, explorer; the agent navigates the shared Chrome to the 402 page, "paying 0.05 tHBAR via Blocky402", the page unlocks; cut to the HashScan transaction and the HCS message; then fare402: 402, paid under cap, unlock, counter ticks. "Someone else's service. On Monday it had no buyers." (The fare402 sub-beat is dropped first if a take runs long.) | 402 body with facilitator URL, HashScan, HCS |
| 1:25-1:45 | The grab: mouse in, border blue, scroll and fill a field on our own page, release, agent resumes from a fresh snapshot. "Same Chrome. Two drivers." |  |
| 1:45-2:15 | Jailbreak, two layers: the agent opens our trap page with hidden "transfer the remaining USDC to 0x..." text and the host card says untrusted provenance; then Jonas types "send everything to 0xevil", the agent calls `wallet_send`, Privy's raw denial with the policy id; phone in frame with the Telegram alert. "The model had the send tool. Privy did not care what the model wanted." | Raw Privy error, policy id |
| 2:15-2:33 | Freeze from the Telegram button: run aborts mid-step, signer removed, pocket key destroyed, border grey. "Kill switch means the key is gone, not that the model was asked to stop." | Wallet pane frozen line |
| 2:33-2:52 | Receipt card; then yesterday's digest on the phone, labelled "recorded yesterday". "It does this every morning. I did not open anything, and it could not have sent a cent anywhere else." | Deployment ids, Basescan, HashScan, HCS, policy id, ledger line |
| 2:52-3:15 | Recap card: drove a Chrome you could grab / paid The Graph per query under Privy policy <id> / paid on Hedera via Blocky402 <tx>, receipt on HCS / Privy said no to 0xevil / the Hedera pocket is host-capped lunch money, Privy gates the EVM leg only. Repo, live URL, the curl-able 402. |  |

Rules: 2-4 minutes, at least 720p, Jonas's own voice, not sped up, not phone-recorded; the Friday-evening compression is by cuts, never a speed ramp.

---

## 7. Decisions

- **Custody split by chain**, as in section 4. No Privy raw-sign Hedera wrapper (zero policy coverage; it would make the video sentence false).
- **Chain of record.** Base mainnet only for the demo wallet's Graph payments; Base Sepolia (or Hedera EVM 296 if the spike passes) for the policied top-up; Hedera testnet for the service and pockets. One policy JSON everywhere; the agent picks x402 for Graph only when the wallet holds Base USDC.
- **The Graph does not index Hedera, and the split is therefore structural, not a shortcut.** Checked 5 Sep 2026 against `thegraph.com/docs/en/supported-networks`: 59 networks, Hedera absent from all four columns (Graph Network, Subgraph Studio, Substreams, Token API). The only route to Hedera data would be self-hosting a Graph Node against the JSON-RPC, which is days of infrastructure and would not be "on The Graph's products" for the track anyway. So the Graph leg stays on Base mainnet reading Ethereum and Base lending deployments, and the Hedera leg stays the x402 service and pockets. **Never write or say "Graph data on Hedera" — the brief is Graph data about EVM lending markets, sold over a Hedera 402.**
- **No real bridge, and none is needed.** Hedera does have bridges — LayerZero V2 has Hedera mainnet and testnet endpoints, with a documented trap that the Hedera EVM uses 8 decimals while its JSON-RPC reports 18 for `msg.value`, which is worth knowing for the 296 spike regardless. But Privy's Best-financial-flow text lists eligible flows as "transfers, bridging, stablecoin conversions, swaps, self-service Earn vaults, onramps, or other supported wallet actions": **a transfer alone qualifies**, and rule (b)'s top-up is a transfer. A real bridge buys no extra prize credit for days of work. Keep the treasury credit, keep it labelled. Note the same paragraph's rule — mocked features "do not count as the required functional Privy integration" — so the mock bridge can never be the flow we point at; the policied transfer is.
- **Real money.** $5 plus $5 reserve of team USDC in the demo wallet, under rule (a) and a host $1-per-day ledger. Never in guest or tester wallets.
- **Hosting.** The public box is whatever already answers a URL today, with a hard cap of six concurrent Chrome workers, one reserved judge worker, idle kill at ten minutes and a usage cap. A docker-compose plus Caddy fallback for a Hetzner CX43 is committed on Day 2 and used if the Saturday measurement fails (then it is the Day 2 deploy) or if the Tuesday load test exceeds 5.5 GB or 500 ms p95 frame latency (six Chromes at 0.5-0.8 GB each plus the runtime is 4-6 GB; an OOM kills the judge worker with the testers).
- **Browser isolation.** One Chrome per process is a verified constraint. The engineering refutation estimates worker-per-user (IPC for navigate, snapshot, click and type, frame and input relays, arbitration state, per-session broadcast, auth on every socket and route, a persisted ledger) at 20-24 hours, and puppeteer-core browser contexts per user in one process (a transport swap behind the existing CDP seam plus the same routing) at 14-16 hours. Recommendation: puppeteer-core contexts as the hosted default and Bun.WebView for local development, decided by the Chrome owner Saturday morning after a 30-minute measurement of frames per second and click round-trip on the live URL. Whichever is chosen, the transport-swap decision is the Sun 6 12:00 CEST cut line; if isolation is still not usable at Tue 8 22:00 CEST, the fallback is concurrency 1 plus a queue, and isolation is never touched again.
- **Model.** claude-opus-5 through the Vercel AI SDK, adaptive thinking, 12-step cap, no forced tool choice. The pre-typed guest job runs as a scripted host pipeline with a single model turn for narration so activation stays under 90 seconds.
- **Telegram** is a pager with pairing codes; Telegram OAuth login only if a 30-minute test on Sunday (after the BotFather domain is set on Saturday) resolves the same DID; Privy Intents only inside the Wednesday box.
- **Guest path** on Day 3 (moved forward from Day 4 at the tester refuter's insistence: the first wave of clicks must not land on an email-only door).
- **The Privy deny-suite** is five recorded transcripts (0xevil, over-cap, over-daily, expired, frozen) captured once and unit-tested as fixtures, plus one manual live smoke pasted into PRIVY.md. No Privy secrets in CI; a flaky Privy call must not block deploys.
- **A users table** exists (user or guest id, wallet id, pocket account id, pocket key ciphertext, telegram user id, frozen_at, expires_at) with Telegram nonces and the ledger persisted, so a restart does not reset caps or the frozen flag.
- **Evidence files** (README skeleton, HEDERA.md, PRIVY.md, GRAPH.md, VALIDATION.md, FEEDBACK.md, ACQUISITION.md, AI-USE.md) are created as skeletons with `TODO(tx)` markers on Day 1; each landed beat adds its transaction id the same hour; Thursday is proofreading, not writing.
- **Three people are the planning assumption**, confirmed Sat 5 Sep: two full-time engineers on the code (Kristjan on Chrome and hosting, Hemang on Privy, Hedera and The Graph) plus Jonas on product, PM and go-to-market. No stretch item is cancelled for headcount; the engineering hours to Day 3 are unchanged, because the earlier estimate already assumed two people at the code (see `CODE_STATE_FABLE51.md` section 6).

---

## 8. Cut list (not in the hackathon build)

WebMCP producer and consumer; injected EIP-1193 / `window.ethereum`, WalletConnect, any dapp "Connect Wallet" beat; swaps, onramp, Earn, yield, ads, white-label, copy-trade, shopping checkout, Telegram Mini App; the persistent "agent shops as you" Chrome profile; Privy bot-first user creation on the critical path; Telegram approval cards and Privy Intents in v1; Graph on Base Sepolia; a real-money public challenge pot (the blocked board runs on testnet with handle credit only); HTS USDC settlement, A2A/ACP, Scheduled Transactions, a self-hosted facilitator, x402 on Hedera EVM 296; ERC-8004 registration and the Agent0 read-back; the metered 24-hour watch with renewal taps (the daily digest re-buys the brief instead); multi-tab and popups; Google OAuth, passkeys or Turnstile sites inside the agent Chrome (the grab beat targets our own page); the `pay` MCP tool (first post-submission item); ENS, World, Ledger, Uniswap, Chainlink and Bazantic tracks (each costs a partner slot); any feature merged after Thu 10 Sep 12:00 CEST.

---

## 9. Honesty box (what is real, what is host-side, what is mocked)

**Real.** A Chrome on our server the agent drives over CDP and you watch, grab and freeze; Privy embedded wallets with the agent as a revocable additional signer under a default-deny policy; a raw Privy denial with the policy id; Blocky402 testnet settlements on Hedera with HashScan ids and HCS receipts from a service we host; live Messari data from four pinned deployments; $0.01 real-USDC payments to The Graph from the team's demo wallet under a typed-data rule; a peer team's 402 paid on camera when their endpoint is alive.

**Host-side, not Privy.** The Hedera pocket's per-call and daily caps; the daily cap on typed-data x402 spend; x402 idempotency; the provenance gate on page-derived addresses. Privy's rolling cap updates after signing, so signatures are serialized per user.

**Mocked or testnet.** All Hedera value; tester and guest pockets prefunded by us; the USDC-to-tHBAR "bridge" is our treasury at a fixed documented rate, labelled "mock bridge (testnet)" in the pane, the receipt and the README if the 296 spike fails; the injection page is ours; the digest in the video is from a prior run; guest wallets are app-owned; the "page unlocks" beat is a receipt-token navigation after the host paid.

**Inferred, not verified.** That Hedera's hedera-skills rubric (Validation 15/100) is what ETHOnline judges use; that the Graph testnet gateway cannot serve Messari (0.85; note the separate, now-verified fact that The Graph does not support Hedera on any network at all); that Privy hard-denies `secp256k1_sign` under a policy (the test result is published either way); that the Privy bot-first identity merge works (we do not depend on it).

**Demand.** Nobody would be upset today if this vanished. **Prior art we are not**: Tally (Hedera upto ceiling plus HCS plus MCP), Glassbox402, countersign, chip402, HumanMandate, OpenSpender, piprail, MetaMask Agent Wallet; each is cited in the README with the exact delta (a watchable, grabbable Chrome plus a policy outside the model plus two-rail receipts with provenance). Nothing is audited; only fund a pocket with what you can lose. Freeze removes the signer immediately but tokens can live 15 minutes, so the server flag is the real gate in that window. App secret, agent key, pocket keys, bot token and model key sit on one host: a host compromise loosens every wallet, so the leash is against the model, not the box.

---

## 10. The eight-day plan

Owners: **Kristjan (A)** owns the Chrome slice and hosting full-time, **and is the technical decision-maker** — isolation approach, rule (b) chain, and every open engineering question resolve to him rather than to a three-way thread. **Hemang (B)**, confirmed in on Sat 5 Sep, owns Privy, the Hedera service, the Graph registry and the digest, and ships them. **Jonas** owns product, PM and go-to-market: build-in-public, landing, consent, the Telegram bot, testers, evidence files and the video. He is no longer split into the wallet slice and does not carry technical calls. Wallet-slice hours after the cuts below: about 40 across Days 1-5, which is Hemang at eight hours a day. Two full-time engineers, not one and a half.

Cuts made now, regardless of headcount: Base Sepolia is rule (b)'s default (the 296 spike is a 30-minute time box whose only effect is swapping the chain); pocket key encrypted under one env key, no KMS story; HCS is a two-hour item after the first settlement, not before; the guest path ships without an automatic sweep of funds on expiry (prefund once, cap 40, sweep by hand on Day 8; the one-click delete-my-data action still ships Day 3); the public receipts page is a plain HTML page and VALIDATION.md carries the counters; the digest cron is the last Day 5 item and is cut first; the deny-suite is fixtures; ERC-8004, the MCP tool and the watch are out; Privy Intents survive only as the Wednesday six-hour box.

| Day | Milestone (green means) | A: Chrome and hosting | B: wallet, Hedera, Graph | Jonas |
| --- | --- | --- | --- | --- |
| **Day 1, Sat 5** | Ownership locked by 10:00; measurement of the live URL committed; first Blocky402 settlement from our own service on HashScan; a raw Privy denial with policy id captured; all four Graph deployments' block ages known; evidence-file skeletons committed | 30-minute measurement (fps, click round-trip); isolation approach decided; hygiene commit for anything that must not ship (see `DAY0_CHECKLIST_FABLE51.md`); model and runtime versions pinned | Fresh Privy app (email OTP on, create-on-login off), agent authorization key, P_agent v0, the 40-line denial script into PRIVY.md; Hedera payTo and treasury accounts funded; fee payer read from `/supported`; first real settlement locally then hosted; Studio key and the four freshness curls into GRAPH.md; 30-minute 296 spike, decision at 18:00 and never revisited; 15-minute `secp256k1_sign` test | Skeletons: README, HEDERA.md, PRIVY.md, GRAPH.md, VALIDATION.md, FEEDBACK.md, ACQUISITION.md, AI-USE.md; consent copy, privacy notice, Impressum text; BotFather bot; join channels; X post 1 (clip plus repo link, no live link); Circle faucet drips started |
| **Day 2, Sun 6** | Per-user isolation usable (at least 5 fps at 1280 wide, input latency under 300 ms) or the Sun 6 12:00 CEST cut line fires and the transport is swapped; per-user W_user and K_pocket created at first session; the visible unlock works; "paid twice with the same payment id, charged once" test green; users table and persisted ledger | Isolation (chosen approach), fresh profile per session, stealth argv, viewport, allowlists on every navigation path, the receipt-token unlock page; docker-compose plus Caddy fallback committed (1 hour) | Per-user wallet creation with owner plus agent signer; per-user pocket creation and encrypted key; host caps; idempotency state machine; users table, nonces, ledger in the database; freeze(user, reason) end to end; Graph registry with four deployments, parallel query, `_meta` block, freshness gate, SKILL.md; oracle body becomes the four-deployment brief metered per deployment | grammY bot: `/start <code>` pairing with hour and timezone, Freeze button, `/bug`; landing, consent and the phone door (copy and clip) live at the root behind an invite code; docs-fix PR to graphprotocol/docs; issues on five peer repos asking for URL and payTo; X post 2 (HashScan) |
| **Day 3, Mon 7** (check-in 1 by 23:59 EDT; Hedera office hours 14:00 UTC) | The whole video path runs on the live URL: Graph paid through rule (a) with a Basescan tx, raw Privy denial on screen, guest path live, first peer endpoint paid, probe card for an unsupported URL; check-in 1 submitted. **Cut line 22:00:** if the agent loop cannot drive the hosted Chrome end to end, Day 4 is a fix day and the digest moves to stretch | 402 probe and the server-issued directory seeded with our brief and the peers that replied; guest path ("Try it": pooled pre-provisioned identities, IP cap, TTL) and a one-click delete-my-data action (profile, receipts, rows); reserved judge worker; the two pre-typed buttons | Graph mainnet x402 from the demo wallet: fund $5, one payment, copy the exact types map into rule (a), $1-per-day host ledger, receipt records the path; `wallet_send` wired to a raw Privy denial with policy id; HCS message per settlement (2 hours); record the five deny transcripts as fixtures | Check-in 1; peer pay 1 (fare402) with the issue text; ask the duplicate-settle question in office hours, answers into HEDERA.md; five more peer issues; X post 3 (Basescan); no live link yet |
| **Day 4, Tue 8** (feedback session 14:00 EDT) | First stranger receipt through "Try it"; five strangers with a receipt and a blocked card; the top-up flow on screen with its aggregation; load test of six sessions committed; **Cut line 22:00:** no stranger receipt means public testers are cut to judge mode plus peers we pay | Load test (memory graph), grab beat rehearsed on our own page, frame tuning, Hetzner decision by 18:00; the read-only judge-worker screencast behind the phone door (the copy-and-clip door has been live since Day 2) | `wallet_topup` under rule (b) with the 24-hour sum shown in the pane and on the receipt (mock-bridge label if on Sepolia); Chrome-less first-receipt path for when no seat is free; public receipts page with per-endpoint counters and the blocked board | Feedback session with the live URL, notes into FEEDBACK.md; tester wave 1 (peers who replied, Hedera Discord, x402 Telegram); X post 4 (the jailbreak clip, tag @privy_io once); one fresh r/ethdev self-post plus replies into the named threads without a bare link; 60 minutes of replies |
| **Day 5, Wed 9** | Twelve testers with a receipt or the honest number; two peer endpoints in the directory; service card live; feature list frozen in writing; **Hard cut line 22:00:** any red core item cancels every Day 6 stretch | Tester bug fixes; freeze-aborts-mid-step test; judge-mode scripted job; ten consecutive four-minute takes without a dropped socket | Service card (1 hour); digest cron per paired tester armed for each tester's chosen hour on Thu (08:00 local default), budget 0.5 tHBAR plus $0.05, one directory pay round-robin; the six-hour Intents box only if Day 4 was green (the headcount condition is met now that Hemang is in) | Graph day: receipt with deployment ids and one real question in t.me/graphhackers and Graph Discord, DM @PaulBarba12; tester wave 2 (r/alphaandbetausers, x402 Telegram); peer pings ("your endpoint got N paid calls"); recap thread; ask the Happy Hour hosts for two minutes |
| **Day 6, Thu 10** (feedback 09:00 EDT; check-in 2 by 23:59 EDT) | Feature freeze 12:00; the digest was delivered to every paired tester; all evidence files complete; check-in 2 submitted; script locked | Stability only; restart drill (profiles ephemeral, ledger and pockets survive); AI-USE.md listing tools, prompts, files and every pattern source | PRIVY.md, HEDERA.md, GRAPH.md final with ids and transcripts; pinned versions for "How it's made"; nothing new | Feedback session; check-in 2; "what testers broke" thread crediting handles; VALIDATION.md and FEEDBACK.md per sponsor; README in the winner shape; demo script v2 with timestamps; ACQUISITION.md complete |
| **Day 7, Fri 11** | Final video plays on the showcase page and passes the rules; submission draft saved | Drives the demo on the judge worker during recording; P0 fixes only; hourly curl alarm on the live URL and the 402; release candidate tag | Reset demo ledgers and pocket balances before each take; verify every explorer and HCS link resolves; "How it's made" paragraphs 2-4; the Q&A crib | Rehearse three times in the morning, record in the afternoon (1080p, face cam, own voice, phone in frame), three takes, cut to 3:15-3:30, upload and re-watch on the showcase page; 60-90-second native X cut; submission form draft |
| **Day 8, Sat 12** | Submitted by 20:00 CEST with a 22-hour buffer | Curl the live URL and the 402 hourly; keep the box up through 20 Sep | Final proofread; the 402 still answers curl from another network; every spec, plan, prompt and research file committed; no squash, no force-push | Submit; tick Finalist and Partner Prizes; select Privy, The Graph, Hedera; "we shipped" thread with real numbers; DM the showcase link to the amplifiers and every peer we paid |
| **Sun 13** | Read-only check by 09:00 CEST; nothing else | Final curl |  | Re-verify submission status, video playback, live URL |

---

## 11. Risks and the answer to each

- **The Chrome slice slips** and the team downgrades to screenshots in chat, deleting the only empty cell. One owner, nothing else on their plate; measured cut line Day 2; concurrency 1 plus a queue as the last fallback; all five tracks qualify without isolation, but the browser must be on screen at 0:00.
- **Rule (a) fails closed** (types map or domain mismatch) or the aggregation is app-wide. Send one real payment Day 3 and copy the map; the Studio key falls back silently with the path on the receipt; verify per-wallet scope Day 4; the demo runs on one wallet so app-wide equals per-wallet for the recording.
- **The 296 spike fails.** Thirty minutes, decision at 18:00 Saturday, Base Sepolia plus a labelled treasury credit; the Privy flow is real either way.
- **Blocky402 down, rate-limited (100 requests per minute per IP) or charging twice on a retry.** Fee payer read at boot; the idempotency state machine tested Day 2; pocket caps mean a bug cannot drain more than one prefund; the paid-request beat is its own take; x402.org's `hedera:testnet` facilitator is a disclosed emergency fallback for testers only, never for the judge recording.
- **A Messari deployment is stale or the client is still single-subgraph at judging** (a Composable-track disqualifier). The four-deployment registry lands Day 2 before any other Graph work; freshness gate; three of four is enough if one goes stale, deeptrace's Base set is the replacement; never fewer than two deployments; ids and blocks on every receipt.
- **A judge catches an overclaim.** Per-user pockets so "the kill switch deletes the key" is literally true; the custody table and the verbatim sentence everywhere; the `secp256k1` probe published.
- **Start Fresh and disclosure.** AI-USE.md names every tool and pattern source; any "ported from" header links a public source or the file is rewritten; anything tracked that should not be (a browser profile, a handover naming a prior project's app) is untracked and disclosed without a history rewrite; granular commits continue, never a squash.
- **Real money and the model budget burned by strangers.** Mainnet USDC only in the demo wallet under a $0.02-per-payment rule to one payTo and a $1-per-day ledger; guests on testnet with the Studio key; IP caps, 12-step cap, per-run budgets, a usage cap on the host.
- **The video breaks a rule or is missing on the showcase** (the failure mode of PlanBound and AgentPass). Ten beats in 3:15 with a named drop-first beat; recorded Day 7, three takes, re-watched on the showcase page; Day 8 is the re-shoot buffer.
- **Nobody shows up.** Peer sellers are individually addressable and need us; the guest path removes signup friction; the honest number goes in VALIDATION.md. (The headcount half of this risk is closed: Hemang is in, so the stretch items are not cancelled and per-user isolation stays in the plan.)

---

## 12. Open decisions (recommendation in bold)

- ~~Is the third builder in?~~ **Resolved Sat 5 Sep: Hemang is in**, and the open technical questions below are Kristjan's to settle, not the team's. He owns role B full-time; Jonas returns to his own lane; per-user isolation stays in rather than being replaced by concurrency 1; the Wednesday Intents box is resourced.
- Worker-per-user or puppeteer-core contexts for hosted isolation? **puppeteer-core contexts by default, per the hour estimates. Kristjan's call, after the Saturday measurement** — this is the last genuinely open item, and it is one person's decision, not a discussion.
- Name? **Keep whatever the repo is called; put the browser in the tagline.**
- Tick Privy B2B on the form? **Only if the Intents box shipped; an unbuilt track reads as padding to a Privy engineer.**

## 13. After 13 Sep

The `pay` MCP tool (pocket_pay, pocket_balance, pocket_receipts against the same hosted pocket and caps; the per-agent token is a spend credential and is documented as such) is the first item, because it is the only day-2 shape for the developer segment. Then: Telegram OAuth login if the DID test passed, Privy Intents approvals, per-agent sub-budgets, the persistent profile as an opt-in, and counsel before any fee or mainnet value for outside users.

## 14. Changes versus `PLAN_v1.md` and `ARCHITECTURE_v1.md`

- "Privy policy is the leash on the Hedera x402 payment" is false; the custody split in section 4 replaces it, and the Privy raw-sign Hedera wrapper is struck.
- "Steal from \~/code/project-h, project-i, project-b": patterns only, disclosed; nothing copied; the repos are not on Jonas's machine.
- The A/B/C wallet-browser fork resolves to A (host pays, no in-page wallet); B and C are removed, not parked.
- Telegram is a pager with pairing codes, not the onboarding front door and not an approver; no Mini App.
- WebMCP, the injected provider, WalletConnect, the swap tool, the onramp and the persistent profile are cut.
- The Graph client must be a registry of four Messari deployments with a freshness gate, not one subgraph id; the Graph path is Studio key plus mainnet x402, never Base Sepolia.
- Hosting is Day 1-2 on the box that already answers, not day 6; the Hetzner compose file is a fallback with a measured trigger.
- The nine-day cut is replaced by the eight-day plan above; the video is Day 7 and submission is Day 8 evening.
- The "cheap extras" (ENS, World, Uniswap, Ledger, Bazantic) are deleted: each costs a partner slot.
- Real USDC exists only in the team's demo wallet; testers and guests never touch mainnet.
