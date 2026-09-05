# FABLE51 planning docs: index and what changed

> **Superseded where noted.** These documents are the Saturday-morning spec and are kept as written. The owner's decisions of Saturday afternoon override them where the two differ: `DECISIONS.md` lists every such place and which are still open, `PLAN.md` is the operative plan, and `STATUS.md` is what has landed. The paragraph headed "The decision in one paragraph" below predates those decisions; read it with `DECISIONS.md` rows 1, 2 and 8 beside it.

Written Sat 5 Sep 2026. These files are the research, product and go-to-market plan for the ETHOnline 2026 entry (submission Sun 13 Sep 2026 12:00 EDT). They were produced with Claude (Fable 5.1) through parallel research and design-panel workflows on 4-5 Sep and are committed as planning artifacts, as the event rules require. They leave the existing docs untouched and describe the product independently of the code state; the engineering owner decides how each decision lands in the tree.

## Reading order

1. **`PRODUCT_FABLE51.md`** - what we build: one sentence, tagline, the wedge, the workspace, the one job and the daily job, custody and policy (the two-pocket split and the cap table), demo beats, decisions, cut list, honesty box, the eight-day plan with owners and dated cut lines, risks, open decisions.
2. **`DAY0_CHECKLIST_FABLE51.md`** - today: decisions before 10:00, measurements, accounts and keys with pass criteria, Jonas's list, repo-hygiene checks.
3. **`PRIZE_AUDIT_FABLE51.md`** - every track claim against the literal track text, the rules checklist, the overclaim watchlist, submission-form skeletons, the video rule check.
4. **`TARGET_GROUPS_FABLE51.md`** - who we build for this week, three personas, where each segment is, first touch and return loop, who we skip, funnel targets and metrics.
5. **`BUILD_IN_PUBLIC_FABLE51.md`** - Jonas's lane: channel rules, the daily artifact schedule, the two stunts, verbatim texts (peer issue, recruitment, consent, phone door), tester operations, ACQUISITION.md.
6. **`USER_FLOWS_FABLE51.md`** - every path a human can take through the product, step by step, with a status per flow (built today versus which day it lands): the two doors and the phone door, the first ten minutes, the full job, grab and freeze, the Telegram return loop, the peer seller's arc, the judge, the degraded paths, and the ten-minute script for running a tester session.
7. **`CODE_STATE_FABLE51.md`** - the implementation audited on Sat 5 Sep against this plan: what works, what is stubbed, rule and safety risks, hours to the plan, the first five tasks.
8. **`PIVOT_ASSESSMENT_FABLE51.md`** - the KIMI ideas (SquadPot, No Flake, Payback, Darepot, SecondOpinion, PAYDAY) and IDEAS.md's Allowance validated against the same evidence; decision and what we keep from them.
9. **`RESEARCH_FABLE51.md`** - the research spine: rules, winners' anatomy, technical verification (browser, custody, Telegram, Graph), market, competition, segments, channels, prize expected value, fourteen corrections to the original plan, open questions.
10. **`../research/`** - the evidence: the brief and critic, nine dimension digests, six gap studies, four pivot red-teams (`pivot-*`), six product designs, three judge panels, the synthesis and two refutations (`panel-*`).

A note on `../research/panel-refutations_FABLE51.md` and `panel-judgments_FABLE51.md`: the engineering refuter and one judge measured the proposals against the code tree as it stood on the night of 4 Sep. Their code-level points are the engineering owner's to accept or ignore; the plan above uses only their hour estimates and the rule-risk items.

## The decision in one paragraph

Do not pivot. Build the agentic wallet: a web workspace where the agent drives a real Chrome you can watch, grab and freeze, and spends from a prefunded pocket whose rules live outside the model (a Privy policy on the EVM leg, a host ledger on the Hedera pocket). The wedge this week is "paste your hedera:testnet 402, a leashed agent pays it on camera", with our own Graph-grounded lending brief as the first directory entry. Primary testers are the peer x402 sellers on Hedera testnet; secondary are developers whose coding agent spends money. Sponsors stay Privy, The Graph, Hedera (three slots; four tracks, five if the Intents approval ships). From the KIMI rounds we take the receipt-card discipline, the no-pot adversarial stunt, the paid-verdict endpoint as the shape of our Hedera brief, and dated kill checks, and nothing else.

## The twelve changes versus `PLAN_v1.md` and `ARCHITECTURE_v1.md`

1. **Custody is split by chain.** Privy gates every EVM signature (typed-data x402 to The Graph, the pocket top-up with a 24-hour aggregation); the Hedera x402 leg is paid from a per-user host-held pocket with host caps, funded only by a Privy-policied transfer. "Privy is the leash on the Hedera payment" is false and the raw-sign wrapper is struck.
2. **Real USDC exists only in the team's demo wallet** ($5 plus $5 reserve) under a $0.02-per-payment rule to one payTo; testers and guests never touch mainnet.
3. **The Graph is a registry of four Messari deployments** (Aave v3 Ethereum and Base, Compound v3, Spark) with a freshness gate, queried through the Studio key with the mainnet x402 gateway as the demo path; one subgraph id is the Composable track's stated disqualifier; no Base Sepolia Graph path.
4. **The Hedera service sells the Graph brief**, metered per protocol, settled through Blocky402 with the fee payer read at boot, an HCS message per settlement, a service card and a curl-able 402 in the README.
5. **Telegram is a pager**, paired by code from the workspace: Freeze button, morning digest, deep link. Not the front door, not an approver, no Mini App; the bot-first identity merge is off the critical path.
6. **A no-signup guest path** (app-owned Privy wallet plus pocket, prefunded testnet, capped) beside email login, live by Day 3; judges use the same URL on a reserved worker.
7. **Fresh Chrome profile per session**, one tab, stealth flags, allowlists on every navigation path; the persistent "agent shops as you" profile is cut for the hackathon.
8. **Hosting is Day 1-2 on the box that already answers**, capped at six concurrent Chrome workers, with a Hetzner compose file as a measured fallback; not day 6.
9. **The tester funnel is jailbreak-first**: two buttons, a Chrome-less first receipt when no seat is free, a phone door, opt-in directory pays, directory rows exempt from the freeze because peers ship late.
10. **Cut entirely:** WebMCP, the injected provider, WalletConnect, swaps, onramp, Mini App, ERC-8004, Intents in v1, the metered watch, the MCP pay tool (first post-submission item), and every fourth-sponsor track (ENS, World, Ledger, Uniswap, Chainlink, Bazantic).
11. **Start Fresh hygiene** is a checklist item with pass criteria: disclose every pattern source in AI-USE.md, rewrite any "ported from" file that lacks a public source, untrack anything local, a fresh Privy app, granular commits, never a history rewrite.
12. **The eight-day plan replaces the nine-day cut**: video Friday, submission Saturday 20:00 CEST with a 22-hour buffer, and four dated cut lines (Sun 6 12:00 isolation transport swap, Mon 7 22:00 agent loop or fix day, Tue 8 22:00 public testers and concurrency-1 fallback, Wed 9 22:00 all stretch).

## Status

- Research, pivot assessment, product spec, prize audit, target groups, build-in-public plan, the Day 1 checklist and the implementation audit are complete and committed. The audit puts the plan's Day 3 milestone about 155 hours away, so `CODE_STATE_FABLE51.md` section 6 re-cuts Days 3-5.
- One open decision is the team's: worker-per-user versus puppeteer-core contexts for hosted isolation (recommendation: puppeteer-core, decided after the Saturday measurement). The third-builder question is resolved — Hemang is in as of Sat 5 Sep and owns role B.
- Everything marked INFERRED in the docs is a fact we could not verify with a fetch or a probe; each has a fallback written next to it.
