# Decisions ledger

Written Sat 5 Sep 2026, 18:30 CEST; updated 20:55 CEST against commit `92aacab` with the answers from that evening's planning session (rows marked **Decided (grill)**). One row per place where the Saturday-morning FABLE51 spec (`PRODUCT_FABLE51.md` and its companions) and the owner's Saturday-afternoon plan (`PLAN.md`) take different positions, plus the positions both share that decide the submission. Where this table and any other document under `docs/plan/` disagree, this table wins. The spec documents are left as written because they are the evidence of how each decision was reached.

**State** is what is true in the tree at HEAD. **Open** means the decision itself is still to be taken, or must be re-taken because the facts moved. A row that is decided but unbuilt is not open; that is the backlog's job.

## Architecture and platform

| # | Topic | FABLE51 spec | Owner's decision, 5 Sep | State at HEAD | Open? |
| --- | --- | --- | --- | --- | --- |
| 1 | Browser transport and isolation | puppeteer-core contexts recommended for hosting, Bun.WebView for local dev, decide after a measurement | Keep Bun.WebView; one worker process per user | Landed `edf4435` (ADR 0006); seats, queue and idle sweep `362d920` | No |
| 2 | Chrome profile | Fresh profile per session, wiped at the end, no imported cookies | Persistent profile per Privy user in a hashed directory on the volume | Landed `3622c96`, `3c860e9` | No. The spec's safety argument becomes a README disclosure ("the agent browses as you") rather than a design change |
| 3 | Navigation scope | Exact-origin allowlist plus a banking, email and exchange denylist on every navigation path | Open web; scheme and private-network hygiene only | Landed: private network blocked per tab `edf4435`; `publicHttpUrl` and `safeFetch` with DNS and redirect checks `f491806` | No |
| 4 | Hosting | The box that already answers, six Chromes, a Hetzner compose fallback | Railway single env, Railway Postgres, `checkSuites: true` | Landed; eight seats, one reserved; live URL last verified by hand on 4 Sep | No |
| 5 | Ledger persistence | Users table and persisted ledger on Day 2 | Same | Landed: Postgres ledger and migration `0000` `35742fe`; a store for the frozen flag, mandate and receipts `4c251d5` | No |
| 6 | Model | `claude-opus-5` through the AI SDK | `qwen3-max` through DashScope compatible mode, Anthropic as fallback, scripted stub without a key | Live: `qwen3.8-max` through Alibaba's Token Plan host `6bcf688`, verified with a live request; the key was valid all along, the host and model name were wrong (`c35bc0a`) | No. The grill's "fresh DashScope key" answer is superseded by that fact |
| 7 | User identity | TypeIDs throughout | The branded Privy DID is `UserId`; profile directories are its hash | Landed | No |

## Entry, users, team

| # | Topic | FABLE51 spec | Owner's decision, 5 Sep | State at HEAD | Open? |
| --- | --- | --- | --- | --- | --- |
| 8 | Entry and the guest path | Two doors: "Try it" (app-owned wallet and pocket, prefunded testnet, IP cap, TTL) live by Day 3, beside email sign-in; a phone door with a read-only screencast | Privy login only (email, Google); no guest path | Auth landed `3622c96`; no guest route exists | **Decided (grill):** none. Email OTP is the door; the demo account holds the reserved seat via `DEMO_USER_DID`; testers sign in |
| 9 | Privy app and wallet creation | Fresh app; create-on-login off; server-created wallets with the user as owner | Reuse the existing app; wallet client-minted at login with create-on-login **on**; the server asks to be added as signer with the user's token (deviation adopted in `STATUS.md`) | Landed `2f5891c`; Privy is live on the deployed URL (`/health`, 5 Sep 20:50); the first real login exposed and fixed a render loop `30f4223` | No |
| 10 | Who builds what | Kristjan on Chrome and hosting and every technical call; Hemang on Privy, Hedera and The Graph; Jonas on product, testers, evidence files and the video | Autonomous agent execution, one commit per task; the owner is pinged only for keys, dashboards, money and destructive actions | Three or more agent sessions have been committing since Saturday afternoon | **Decided (grill):** no fixed human lanes. Kristjan, Hemang and Jonas all work with agents and sync; the lane documents stay as spec input, not assignments |

## Custody and money

| # | Topic | FABLE51 spec | Owner's decision, 5 Sep | State at HEAD | Open? |
| --- | --- | --- | --- | --- | --- |
| 11 | Custody split | Privy policy on the EVM leg; a host-held Hedera pocket with host caps; the kill switch removes the signer and deletes the pocket key | Same | Agent signer under policy `2f5891c`; freeze revokes the signer `362d920`; the pocket is one shared host account, see row 34 | No |
| 12 | The Privy headline flow | The rule (b) top-up transfer with its visible 24-hour aggregation is the headline; typed-data x402 to The Graph is second; the raw denial with policy id is the control beat | The plan names 2.5 (EVM x402 via typed data) "the Privy signed flow" on Day 3 and puts the top-up (2.9) on Day 4. The 4 Sep handover's headline, a Privy-signed Hedera payment, is dead under the custody split | Typed-data signing under the agent key is built `a438252` and awaits USDC on Base to run live; the top-up is not built; the committed policy has rule (a) only, at $0.25 | **Decided (grill):** both, top-up first. Rule (b) top-up with the 24 h aggregation leads (2.9) and is built before the typed-data flow is verified live (2.5). The raw denial to 0xevil stays the control beat |
| 13 | Rule (b) chain | Base Sepolia by default; a 30-minute Hedera-EVM 296 spike with a decision at 18:00 Sat | Base Sepolia; no spike scheduled | Nothing built (2.9) | No (Base Sepolia) |
| 14 | Real money | About $5 plus $5 reserve of team USDC in the demo wallet only, for the mainnet Graph gateway | Same | Not funded; an owner step, with `GRAPH_PAY_PER_QUERY` to flip afterwards | No |
| 15 | The Graph | Four Messari deployments, freshness gate, Studio key and mainnet x402 behind one interface, the path recorded on every receipt | Same | Twelve deployments across Ethereum, Arbitrum, Polygon and BSC on live evidence `785d85e`; pay-per-query through the gateway's x402 endpoint built `e365eef`, awaiting USDC; the metered brief open | No |
| 16 | The Hedera service | Blocky402 on `hedera:testnet`, fee payer read from `/supported`, an HCS message per settlement, a service card, a curl-able 402 | Same | Fee payer from `/supported`, payee split from the pocket, first real testnet settlement `e56b38d` (0.05 HBAR, SUCCESS, `hashscan.io/testnet/transaction/1788625330.599677104`); an HCS note per settlement on topic `0.0.10381647` `87f6976`; the service card and the payment state machine open | No |
| 17 | Approvals | A host `ask` band; no Telegram approval cards; Privy Intents only inside a Wednesday time box | An in-app approval card that parks the tool call; never a tool | Landed: registry `362d920`, the spend parks on `ask` `539d0a3`, the card `41dbe07`, the round-trip e2e `3763463` | No |
| 18 | Directory and 402 probe | A paste-a-402 box that probes before it pays; a server-issued directory seeded with our brief and peer sellers | Same (2.8) | Landed `8bf511f`: probe, per-user directory, host and payee onto the allowlists; e2e `068113d` | No |
| 19 | Daily digest job | Day 5, cut first | Same (2.11) | Landed `7b1cb1d`: per-user schedule, minute scheduler, bounded run, digest to a sink | No. In the video, recorded the day before (grill) |
| 20 | Freeze | One function: flag, abort, remove the signer, wipe the pocket, notify | Same (2.10) | Flag, abort, deny parked approvals, freeze the browser, revoke the signer landed `362d920`; unfreeze re-grants; zeroing the pocket balance and the policy-owner key open | No |

## Surface

| # | Topic | FABLE51 spec | Owner's decision, 5 Sep | State at HEAD | Open? |
| --- | --- | --- | --- | --- | --- |
| 21 | UI | Desktop three panes; phones get a clip and a read-only screencast | Light consumer fintech, chat-first; the browser as an inline live card with pop-out; the wallet as a header strip and tickets in the stream (P3, eleven tasks) | 3.0 to 3.9 and 3.11 landed (`41dbe07`, `32d5569`, `46367d2`, `3763463`, `068113d`); 3.10 waits on the top-up | **Decided (grill):** all eleven |
| 22 | Telegram | A pager only: `/start <code>` pairing, a Freeze button, the digest, a deep link; no DM chat | Vercel Chat SDK: pairing, Freeze, digest **and** DM chat with the agent (P4) | Landed `c2759e0` with DM chat (ADR 0007); live once the owner sets the bot token | **Decided (grill):** pager plus DM chat, in scope |
| 23 | WebMCP | Cut | Stretch (6.1, 6.2) | Producer landed `146b3e3`; registration unverified because no browser on the box exposes the API; consumer open | No (stretch) |
| 24 | Injected `window.ethereum` | Cut | Stretch (6.3), last | Open | No (stretch) |
| 25 | Name | Keep the repo's name; the tagline carries the browser | Froggy stays | — | No |

## Rules, evidence, schedule

| # | Topic | FABLE51 spec | Owner's decision, 5 Sep | State at HEAD | Open? |
| --- | --- | --- | --- | --- | --- |
| 26 | Prior-project disclosure | An `AI-USE.md` naming every pattern source with a public link, or rewrite the files | Strip every mention; a standalone project; `AI-USE.md` discloses AI tooling without naming repositories | Scrub landed `8f060ff` with `tools/check-names.ts` in the gate; `AI-USE.md` not written | No; the plan records the rules risk as the owner's call |
| 27 | Evidence files | Eight skeletons on Day 1 (README shape, HEDERA, PRIVY, GRAPH, VALIDATION, FEEDBACK, ACQUISITION, AI-USE) | Same (P5) | Skeletons with `TODO(tx)` marks in `docs/evidence/` `79a38d7`; README updated | No |
| 28 | Repository visibility | Public before submission | Public after P0 | Still **private** | **Decided (grill):** public on submission day, Sat 12, after a history secret scan; posts before then carry clips, never a repo link |
| 29 | Privy B2B track | Tick only if the Intents box ships | Same | — | Decided at submission |
| 30 | Cut lines | Sun 6 12:00 isolation swap; Mon 7 22:00 agent loop; Tue 8 22:00 public testers; Wed 9 22:00 stretch | Sun 22:00 isolation; Mon 22:00 loop; Wed 22:00 stretch; Thu 12:00 freeze; video Fri; submit Sat 20:00 | By Saturday evening the platform, the UI, approvals, directory, digest, Telegram, HCS and the model were live or built; left: the top-up and pocket balance, rules (b) and (c), the payment state machine, the service card, the budget, evidence, video | **Decided (grill):** one continuous run from Saturday evening, no dated cut lines, nothing dropped. Fixed external dates: check-in 1 Mon 7, feedback Tue 8 14:00 EDT, check-in 2 and feature freeze Thu 10, video Fri 11, public and submit Sat 12 by 20:00 CEST |
| 31 | What the product is this week | A hackathon wedge: "paste your `hedera:testnet` 402, a leashed agent pays it on camera", with our Graph brief as the first directory entry | A chat-first super-app feel, persistent profile, open web, Telegram DM chat, WebMCP: the seed of the Friday vision | — | **Decided (grill):** wedge on camera, seed underneath. Judge-facing scope is the leash story; architecture already landed stays; nothing new for the super-app until every beat is green on the live URL |

## Added in the planning session (5 Sep evening)

| # | Topic | FABLE51 spec | Decision | State at HEAD |
| --- | --- | --- | --- | --- |
| 32 | Optional demo beats | Peer 402, digest, Telegram freeze and the grab are all in the spec's ten beats | **All four are in the video**: peer 402 paid from a pasted URL (2.8), daily digest recorded the day before (2.11), Freeze from a Telegram button (P4), grab mid-action | 2.8, 2.11 and P4 landed; the on-camera runs are `TODO(tx)` in `docs/evidence/` |
| 33 | Graph deployment set | Four deployments | Decided "swap in a live Base deployment"; **superseded by `785d85e`**: twelve deployments on four chains, Base candidates rejected on evidence with the reasons in the registry | Done; `GRAPH.md` documents it |
| 34 | Pocket model | One Hedera account per user with a sealed key; "the kill switch deletes the key" | **One host account, per-user ledger balances.** Top-up credits the balance, spends draw it down, freeze zeroes it and revokes the signer. No account creation, key sealing or `POCKET_KEK`. Wording: "freeze zeroes your allowance", never "deletes the key" | Open (2.9, 2.10) |
| 35 | Drop order when a line goes red | Named drop-first beats | **Nothing is cut.** | — |
| 36 | Coordination | Kristjan merges; Jonas and Hemang in their lanes | Hemang's and Jonas's agents work in their own clones, `git pull --rebase` before push, small commits. Sessions sharing this box's tree commit by pathspec (`git commit -- <paths>`) and claim a task in `STATUS.md` before starting it | In force |
| 37 | Video owner | Jonas | **Decided on Thursday.** Script from the demo beats on Thu, rehearse Thu evening, record Fri | — |

## Decided in the planning session, 5 Sep evening

Rows 6, 8, 10, 12, 19, 21, 22, 28, 30, 31 and 32 to 37 above. In one paragraph: the product on camera is the leash story and nothing else is judged; everything already landed stays; scope is all of P1 to P5 including the digest, Telegram with DM chat and all eleven UI tasks, with only P6 as stretch; no guest path; the Privy top-up under rule (b) is the headline and lands before the typed-data flow is verified; the pocket is a per-user balance on one host account; one continuous run with nothing dropped; repo public on submission day; three humans and their agents on their own clones.

## Still open

- Who records the video: Thursday.
- Whether to tick Privy B2B on the form: only if the Intents box shipped; decided at submission.

## Blocked on the owner (from `STATUS.md`, 5 Sep evening)

- `DEMO_USER_DID` on Railway, so the reserved seat and the pay-per-query demo know the demo wallet.
- About $5 USDC on Base in the demo wallet; then `GRAPH_PAY_PER_QUERY=true` and the gateway URL added to the demo account's directory.
- Base Sepolia USDC and a little Sepolia ETH in the same wallet, for the rule (b) top-up beat.
- Telegram: a bot from BotFather, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET_TOKEN`, `TELEGRAM_BOT_USERNAME` on Railway, then `setWebhook`.
- Privy dashboard: a policy-owner authorization key, so freeze can wipe the rules and rule (b) can be added to the policy.
- Repo public on Sat 12, after the history scan.

## Iteration 2, decided in the team grilling on Sun 6 Sep

Recorded vote by vote in `docs/sync/telegram-grilling-session.md`; the plan is `docs/plan/NEXT_ITERATION.md`, marked proposed until the group confirms it. Where a row below disagrees with a row above, this block wins.

| Row above | What changed on 6 Sep | Who |
| --- | --- | --- |
| 11, 20, 34 | **Freeze is removed entirely.** No kill switch in the header, on Telegram or in the API; Stop ends the run, "Stop the agent" on a ticket ends the run and withdraws open cards, Disconnect revokes an agent token. The pocket is no longer zeroed by anything. Landed `ee4b8dd`. | Kristjan, Jonas and Hemang agree |
| 11, 34 | **One Hedera account per person**, funded from a treasury HBAR float at the mirror-node rate when the person tops up dollars; opened on the person's own Privy key if Monday's `raw_sign` spike passes, else custodied and labelled. The single host pocket stays only until that lands. | all three |
| 14, 16 | **Everything on mainnet.** `HEDERA_NETWORK` is configuration (`780861e`); the default stays testnet. The fallback if Blocky402 mainnet refuses without a key: **none** (Kristjan, terminal, 6 Sep 20:24 CEST); Jonas had preferred a labelled fallback, Hemang was silent; if Monday's settlement is refused the team decides then. | Kristjan; Jonas's preference noted |
| 8, 21 | Login is Google and email only; the wallet option is gone (`e253cfb`). The Agents tab connects an outside agent with a token and a skill (`e61978b`). | Kristjan |
| 15 | The Graph track is the Composable/Standardized products track; the brief answers borrow and supply across the twelve Messari deployments; access through the server API key, the Base x402 upstream paid by the treasury. | Kristjan, Hemang; Jonas "or whatever fits" |
| 31 | The product on camera is a personal agent buying tasks from Froggy: `POST /api/tasks` behind a 402, agent tokens, the served CLI and the skill (`363faf5`, `ae7a9a9`). | all three |
| new | Pasted-address interpretation is in scope in full: classify, propose, execute with approval; Base via Privy swap from the person's session, Hedera via SaucerSwap, Linea propose-only. | Kristjan; Jonas and Hemang agree |
| new | The MetaMask Card purchase is the second beat: Linea only, CCTP v2 from the Privy wallet when funds are short, sealed card store and masked autofill, 3DS as a ticket, pre-funded fallback. | Kristjan; others defer |
| new | Prices: brief $0.05, browse $0.50 for 40 steps; the quote is the price; no refunds on failed paid work, the receipt says so. Real-money cap €100. | Kristjan |
| 36, 37 | No ownership split: one agent run executes the plan nightly; Kristjan handles keys, money, dashboards and the card; Jonas with Kimi and Hemang with Claude test. Video owner still to name. | Kristjan, Hemang |
| new | **Open for Monday: who custodies the person's Hedera key.** Spike 1.8 showed Privy's `raw_sign` refuses Ethereum and Solana wallets but signs for a cosmos-type wallet, which became Hedera account `0.0.10396162` and paid a transfer signed only through Privy; a raw-bytes rule takes no conditions, so Privy cannot cap that leg. Today (task 1.5, live) Froggy opens the account and seals the key under `HEDERA_KEK`; the alternative is a cosmos-type Privy wallet per person, about three hours. | run recommends Privy custody; not decided |
