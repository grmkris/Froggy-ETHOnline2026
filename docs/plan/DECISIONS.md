# Decisions ledger

Written Sat 5 Sep 2026, 18:30 CEST, against commit `f491806`. One row per place where the Saturday-morning FABLE51 spec (`PRODUCT_FABLE51.md` and its companions) and the owner's Saturday-afternoon plan (`PLAN.md`) take different positions, plus the positions both share that decide the submission. Where this table and any other document under `docs/plan/` disagree, this table wins. The spec documents are left as written because they are the evidence of how each decision was reached.

**State** is what is true in the tree at HEAD. **Open** means the decision itself is still to be taken, or must be re-taken because the facts moved. A row that is decided but unbuilt is not open; that is the backlog's job.

## Architecture and platform

| # | Topic | FABLE51 spec | Owner's decision, 5 Sep | State at HEAD | Open? |
| --- | --- | --- | --- | --- | --- |
| 1 | Browser transport and isolation | puppeteer-core contexts recommended for hosting, Bun.WebView for local dev, decide after a measurement | Keep Bun.WebView; one worker process per user | Landed `edf4435` (ADR 0006); seats, queue and idle sweep `362d920` | No |
| 2 | Chrome profile | Fresh profile per session, wiped at the end, no imported cookies | Persistent profile per Privy user in a hashed directory on the volume | Landed `3622c96`, `3c860e9` | No. The spec's safety argument becomes a README disclosure ("the agent browses as you") rather than a design change |
| 3 | Navigation scope | Exact-origin allowlist plus a banking, email and exchange denylist on every navigation path | Open web; scheme and private-network hygiene only | Landed: private network blocked per tab `edf4435`; `publicHttpUrl` and `safeFetch` with DNS and redirect checks `f491806` | No |
| 4 | Hosting | The box that already answers, six Chromes, a Hetzner compose fallback | Railway single env, Railway Postgres, `checkSuites: true` | Landed; eight seats, one reserved; live URL last verified by hand on 4 Sep | No |
| 5 | Ledger persistence | Users table and persisted ledger on Day 2 | Same | Landed: Postgres ledger and migration `0000` `35742fe`; a store for the frozen flag, mandate and receipts `4c251d5` | No |
| 6 | Model | `claude-opus-5` through the AI SDK | `qwen3-max` through DashScope compatible mode, Anthropic as fallback, scripted stub without a key | Provider selection landed `56290f8`; the DashScope key on the box is rejected by every host, so the live model is stubbed | No, but blocked on a working key (owner) |
| 7 | User identity | TypeIDs throughout | The branded Privy DID is `UserId`; profile directories are its hash | Landed | No |

## Entry, users, team

| # | Topic | FABLE51 spec | Owner's decision, 5 Sep | State at HEAD | Open? |
| --- | --- | --- | --- | --- | --- |
| 8 | Entry and the guest path | Two doors: "Try it" (app-owned wallet and pocket, prefunded testnet, IP cap, TTL) live by Day 3, beside email sign-in; a phone door with a read-only screencast | Privy login only (email, Google); no guest path | Auth landed `3622c96`; no guest route exists | **Yes.** The tester funnel, the phone door, the "first stranger receipt" milestone and the pre-typed buttons in the spec all assume a door with no sign-up |
| 9 | Privy app and wallet creation | Fresh app; create-on-login off; server-created wallets with the user as owner | Reuse the existing app; wallet client-minted at login with create-on-login **on**; the server asks to be added as signer with the user's token (deviation adopted in `STATUS.md`) | Landed `2f5891c`; Railway carries no Privy variables yet because the app's allowed origins do not include the Railway domain | No |
| 10 | Who builds what | Kristjan on Chrome and hosting and every technical call; Hemang on Privy, Hedera and The Graph; Jonas on product, testers, evidence files and the video | Autonomous agent execution, one commit per task; the owner is pinged only for keys, dashboards, money and destructive actions | Three or more agent sessions have been committing since Saturday afternoon; no human lane is written down against this plan | **Yes.** Decides who owns P2 and whether Jonas's lane documents (`BUILD_IN_PUBLIC`, `TARGET_GROUPS`, `USER_FLOWS`) are live or archived |

## Custody and money

| # | Topic | FABLE51 spec | Owner's decision, 5 Sep | State at HEAD | Open? |
| --- | --- | --- | --- | --- | --- |
| 11 | Custody split | Privy policy on the EVM leg; a host-held Hedera pocket with host caps; the kill switch removes the signer and deletes the pocket key | Same | Agent signer under policy `2f5891c`; freeze revokes the signer `362d920`; the pocket is not built (2.6) | No |
| 12 | The Privy headline flow | The rule (b) top-up transfer with its visible 24-hour aggregation is the headline; typed-data x402 to The Graph is second; the raw denial with policy id is the control beat | The plan names 2.5 (EVM x402 via typed data) "the Privy signed flow" on Day 3 and puts the top-up (2.9) on Day 4. The 4 Sep handover's headline, a Privy-signed Hedera payment, is dead under the custody split | Neither flow is built; the committed policy has rule (a) only, at $0.25 rather than $0.02 | **Yes.** Which flow the video and the Privy submission form lead with, and therefore which is built first |
| 13 | Rule (b) chain | Base Sepolia by default; a 30-minute Hedera-EVM 296 spike with a decision at 18:00 Sat | Base Sepolia; no spike scheduled | Nothing built (2.9) | No (Base Sepolia) |
| 14 | Real money | About $5 plus $5 reserve of team USDC in the demo wallet only, for the mainnet Graph gateway | Same | Not funded (owner step 4) | No |
| 15 | The Graph | Four Messari deployments, freshness gate, Studio key and mainnet x402 behind one interface, the path recorded on every receipt | Same | Live through the Studio key `84dfdd7`, `e56b38d`: Spark, Aave v3 Ethereum and Compound v3 at one block; Aave v3 Base is unindexed on the network and reported unavailable; x402 provider and the metered brief open | No |
| 16 | The Hedera service | Blocky402 on `hedera:testnet`, fee payer read from `/supported`, an HCS message per settlement, a service card, a curl-able 402 | Same | Fee payer from `/supported`, payee split from the pocket, first real testnet settlement `e56b38d` (0.05 HBAR, SUCCESS, `hashscan.io/testnet/transaction/1788625330.599677104`); HCS, the service card and per-user pockets open | No |
| 17 | Approvals | A host `ask` band; no Telegram approval cards; Privy Intents only inside a Wednesday time box | An in-app approval card that parks the tool call; never a tool | Parking registry landed `362d920`; the spend path does not park on `ask` yet and no card renders (2.7, 3.5) | No |
| 18 | Directory and 402 probe | A paste-a-402 box that probes before it pays; a server-issued directory seeded with our brief and peer sellers | Same (2.8) | Open | No |
| 19 | Daily digest job | Day 5, cut first | Same (2.11) | Open | No |
| 20 | Freeze | One function: flag, abort, remove the signer, wipe the pocket, notify | Same (2.10) | Flag, abort, deny parked approvals, freeze the browser, revoke the signer landed `362d920`; policy-rules wipe, pocket delete and unfreeze open | No |

## Surface

| # | Topic | FABLE51 spec | Owner's decision, 5 Sep | State at HEAD | Open? |
| --- | --- | --- | --- | --- | --- |
| 21 | UI | Desktop three panes; phones get a clip and a read-only screencast | Light consumer fintech, chat-first; the browser as an inline live card with pop-out; the wallet as a header strip and tickets in the stream (P3, eleven tasks) | Nothing landed; the app is the bootstrap three-pane dark UI | **Yes.** How much of P3 fits before the Thu 10 12:00 freeze, and in what order |
| 22 | Telegram | A pager only: `/start <code>` pairing, a Freeze button, the digest, a deep link; no DM chat | Vercel Chat SDK: pairing, Freeze, digest **and** DM chat with the agent (P4) | Open; package versions verified, nothing installed | **Yes.** In scope or stretch |
| 23 | WebMCP | Cut | Stretch (6.1, 6.2) | Open | No (stretch) |
| 24 | Injected `window.ethereum` | Cut | Stretch (6.3), last | Open | No (stretch) |
| 25 | Name | Keep the repo's name; the tagline carries the browser | Froggy stays | — | No |

## Rules, evidence, schedule

| # | Topic | FABLE51 spec | Owner's decision, 5 Sep | State at HEAD | Open? |
| --- | --- | --- | --- | --- | --- |
| 26 | Prior-project disclosure | An `AI-USE.md` naming every pattern source with a public link, or rewrite the files | Strip every mention; a standalone project; `AI-USE.md` discloses AI tooling without naming repositories | Scrub landed `8f060ff` with `tools/check-names.ts` in the gate; `AI-USE.md` not written | No; the plan records the rules risk as the owner's call |
| 27 | Evidence files | Eight skeletons on Day 1 (README shape, HEDERA, PRIVY, GRAPH, VALIDATION, FEEDBACK, ACQUISITION, AI-USE) | Same (P5) | None exists | No |
| 28 | Repository visibility | Public before submission | Public after P0 | Still **private** at 18:10 on 5 Sep | No; the owner clicks |
| 29 | Privy B2B track | Tick only if the Intents box ships | Same | — | Decided at submission |
| 30 | Cut lines | Sun 6 12:00 isolation swap; Mon 7 22:00 agent loop; Tue 8 22:00 public testers; Wed 9 22:00 stretch | Sun 22:00 isolation; Mon 22:00 loop; Wed 22:00 stretch; Thu 12:00 freeze; video Fri; submit Sat 20:00 | Isolation, the ledger fixes and the first Hedera settlement landed on Saturday, a day early; Privy signing, the UI and a live model turn have not started | **Yes.** Re-date against Saturday's actual state |
| 31 | What the product is this week | A hackathon wedge: "paste your `hedera:testnet` 402, a leashed agent pays it on camera", with our Graph brief as the first directory entry | A chat-first super-app feel, persistent profile, open web, Telegram DM chat, WebMCP: the seed of the Friday vision | — | **Yes.** The root question; every open row above follows from it |

## Open, in the order to take them

1. Row 31, the framing: wedge or seed of the super app. Sets the bar for every cut.
2. Row 8, the guest path: in or out, and what replaces the tester funnel if out.
3. Row 10, who builds what: human lanes against an agent-executed plan.
4. Row 12, the Privy headline: top-up with aggregation, or typed-data x402.
5. Row 21, the UI: which of the eleven P3 tasks survive, in what order.
6. Row 22, Telegram: in scope or stretch.
7. Row 30, the cut lines, re-dated once 1 to 6 are settled.

## Blocked on the owner, independent of every row above

- An HCS topic id for settlement receipts; the two Hedera testnet accounts are funded and in use.
- A DashScope key the intl compatible-mode host accepts; the one on the box is rejected.
- The Railway origin in the Privy app's allowed origins, then the Privy variables on Railway.
- `DEMO_USER_DID` for the reserved seat.
- About $5 USDC on Base mainnet into the demo wallet, once 2.4 prints its address.
- The repository flipped to public.
