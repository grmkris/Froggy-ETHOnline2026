# Target groups (FABLE51)

Written Sat 5 Sep 2026. Who we build for between now and Sun 13 Sep, who we recruit as testers, who is audience only, and who we skip. Evidence: `RESEARCH_FABLE51.md` sections 5-8, `research_FABLE51/dim-segments_FABLE51.md`, `dim-demand_FABLE51.md`, `dim-build_in_public_FABLE51.md`, `gap-event_week_graph_and_peers_FABLE51.md`, and the three-persona user panel in `research_FABLE51/panel-judgments_FABLE51.md`.

---

## 0. Summary

| Tier | Who | Role this week | Where they are | Why they reply |
|---|---|---|---|---|
| Primary | ETHOnline 2026 teams shipping x402 **sellers** on Hedera testnet, plus the July Hedera bounty alumni | Counterparties and Validation evidence | Their GitHub repos, Hedera Discord build-support, ETHGlobal Discord, x402 builders Telegram | They have endpoints and no buyer; a settlement from a stranger's agent is a HashScan link for their own submission |
| Secondary | Developers whose coding or research agent spends money (Claude Code, Cursor, OpenClaw) | Testers of the leash; the post-hackathon segment | Named Reddit threads, x402 Telegram, X replies | They have felt the money fear (the $3,400 proxy loop, the $90 co-sign story); they lack a Chrome they can watch and a policy outside the agent |
| Tertiary | Analysts and tool builders on The Graph's standardized (Messari) data | Reusers of the registry and SKILL.md; Graph-judge-shaped validation | t.me/graphhackers, Graph Discord #mcp-servers | Provenance, freshness gates and a way to pay The Graph per query without a Studio key |
| Audience | ETHOnline hackers, sponsor DevRel amplifiers, async partner judges | Reach and scoring, not usage | ETHGlobal Discord, X reply threads, Hbar Happy Hour | A HashScan link and a clip |
| Skip | 18-28 friend groups, non-crypto shoppers, trading-bot users, anyone who needs mainnet money | Not this window | | See section 7 |

Honest demand statement (goes in the README honesty box): nobody would be upset today if this vanished. The humans with a this-week need are the 5-25 peer sellers, and that need expires 13 Sep. The developer segment's cap problem is already served by OpenSpender and piprail; our new things for them are the watchable and grabbable Chrome, a policy the agent cannot edit, and receipts with provenance.

---

## 1. Segment scores (from `RESEARCH_FABLE51.md` section 7)

Five criteria, five points each: reachable this week, testnet tolerance, has the pain now, produces judge-visible evidence, can return on day 2.

| Segment | Score /25 | Note |
|---|---|---|
| x402 sellers on Hedera or Base, incl. ETHOnline peers | 23 | Individually addressable; need a buyer; die on 13 Sep |
| OpenClaw / Claude Code / Cursor agent builders | 19 | Largest pool; already have caps from OpenSpender and piprail; want the cap outside their own agent |
| Graph standardized-data analysts | 19 | Small, judge-shaped, reachable through staffed Telegram and Discord channels |
| ETHGlobal hackers | 19 | Cheapest testers this week; motivated by their own submission |
| Non-crypto shoppers and friend groups | 8 | Testnet-hostile, need a counterparty, no channel we own |
| Trading-bot users | skip | Mainnet-only to feel real; "gains" framing is toxic for a money product |

---

## 2. Three people we build for

The design panel scored every proposal as three named users. Their answers shape the funnel.

**ducnmm, author of fare402** (a pay-per-query Hedera mirror lookup, live on Railway, three Blocky402 settlements on 4 Sep, no buyer but himself). Wants, this week: a stranger's agent to pay his 402, a HashScan link and a 15-second clip he can paste into his own submission. Will answer a GitHub issue within the hour. Will not sign up for a workspace to watch someone else's Chrome. Would use a 402-probe card ("this is what your 402 looks like to a buyer") to debug. Would check a public paid-calls counter daily until the 13th.

**The r/OpenClawUseCases "$3,400 lesson learned" author** (agent loop bought proxies overnight on a corporate card with no cap). Wants the cap and the kill switch to live outside his own agent, in something he can add to its config, plus a morning message that says what it bought and what got refused. A separate web agent he has to open and watch is not his problem solved; his loss happened unattended. Will click a web link from a Reddit reply far more readily than open a Telegram bot. Would post a blocked-attempt card. The thing he would keep is a `pay` MCP tool for his own agent, which is a post-submission item.

**A PaulieB-shaped analyst** (already querying Messari standardized lending subgraphs over MCP; graph-lending-mcp). Wants provenance (deployment id plus block) on every answer, freshness gates that return "unavailable" over stale data, a reusable registry and SKILL.md, and a way for his own MCP agent to pay The Graph per query without a Studio key. Hedera and a screencast are irrelevant to him. Will answer a real question ("Spark or Compound fresher today?") and read a docs-fix PR.

---

## 3. Primary: peer x402 sellers

**Named list** (repos created 1-4 Sep unless noted; all read their issues this week): ducnmm/fare402 (live), valentin-alexandrov/hedera-x402-pay-per-inference (HCS topic), retailbox-automation/x402-work-receipts (first Blocky402 settle done), charlie-morrison/tollgate, sgladkov/inference-exchange, livevnx8/hedera-x402-paid-lookup, Linus-Shyu/Ether-Hunt (@Linus_Shyu), roderickhodgson/AgentTether, pogosiandavid115-dev/turnstile-x402-hedera, MIA-Ether/x402-agent-gateway. July bounty alumni: hitakshiA (pinout.club, live, no sign-up), Madhav-Gupta-28 (Tally, @Madhav__28), nickthelegend (Xorv), farouk-allani (Qisma), mdmudassir0143 (Mystic).

**Where.** A GitHub issue on each repo; Hedera Discord build-support (office hours Mon-Tue 14:00 UTC); ETHGlobal Discord #mentorship-help under @JulioMCruz's 4 Sep x402 offer (ask a real question, let the link ride on it); the x402 builders Telegram; X replies under @HederaCommunity, @ed__marquez and @jaycoolh posts. Never a logo account.

**First touch: Mon 7 Sep, after our own end-to-end works.** Our agent pays their endpoint on camera under a 0.5 tHBAR cap. We open the issue "Our agent paid your 402 (HashScan inside)" with the settlement transaction, a 15-second clip of the unlock in the shared Chrome, and two optional asks: stay in our default directory (testers can pay you with one click; our morning cron pays you once a day; public paid-calls counter and the clip for your README), and if your agent buys things, our 402 sells a Graph lending brief for 0.05 tHBAR, curl included. Exact text in `BUILD_IN_PUBLIC_FABLE51.md`.

**Why they return.** Incoming settlements, not logins: a "your endpoint got N paid calls today" ping and a counter row on the public receipts page they can screenshot into their own Validation section.

**What we owe them.** A 402 probe that decodes `accepts[]` and renders price, network and scheme before any payment; a clear "unsupported: eip155:8453, the pocket is Hedera testnet only this week, here is the ten-line way to add a Hedera route" card for Base sellers (most x402 volume is Base, so the first URL most people paste will be unsupported); directory rows exempt from the feature freeze, because most peer endpoints go live in the last 48 hours.

**Realistic targets.** Ten issues opened Mon-Wed, five replies, two endpoints paid by the recording on Fri 11, four by submission, one to three peers paying our 402 back.

---

## 4. Secondary: developers whose agent spends money

**Named nodes.** The r/ClaudeAI "I gave a Claude agent a domain and $90 it can't spend without me" author (351 points; 99 comments on the r/AI_Agents crosspost); the r/ethdev 25 Aug "How do we let an AI use a wallet without giving the AI unrestricted control?" thread; the r/OpenClawUseCases "$3,400 lesson learned" author; @0xblockboy's 202 bookmarkers ("authorize once, spend under a limit"); OpenClaw issue #48140 (closed "not planned": $1/tx, $10/day tiers requested); the 600-plus x402 builders Telegram.

**Honest caveat.** OpenSpender and piprail already give them per-request caps, rolling caps, a total budget, a host allowlist and an MCP entry. What they lack: a Chrome they can watch and grab, a policy the agent cannot edit stored outside the agent's machine, the Hedera rail, and receipts that say which data justified the spend.

**First touch: Tue 8 Sep**, only after a stranger has produced a receipt through the guest path. A reply into the named threads carrying the blocked card ("Privy policy <id> denied eth_signTransaction: to not in condition set. The model said yes, the wallet said no.") and the live URL, plus one fresh r/ethdev self-post the same day (the named threads are two to four weeks old; replies there reach the OP, not readers). No signup: "Try it" opens a guest workspace with a prefunded testnet pocket. Two buttons, jailbreak first: "Tell it to pay 0xevil" (a Privy denial card in about ten seconds) and "Let it buy something" (the 0.05 tHBAR brief with a receipt).

**Why they return.** The morning digest at the hour and timezone they chose (asked at Telegram pairing): the number, what it bought, what was refused with the policy id, explorer links, Freeze and Open buttons. The blocked board credits their handle each time they find a new way that does not work.

**After 13 Sep.** A `pay` MCP tool exposing pocket_pay, pocket_balance and pocket_receipts against the same hosted pocket and caps, so their own Claude Code pays through the policy. This is the first post-submission item, not a hackathon stretch.

---

## 5. Tertiary: Graph standardized-data analysts

**Where.** t.me/graphhackers (about 480 members, Graph support engineers present during hackathons; not t.me/graphprotocol), Graph Discord #mcp-servers, a PR to graphprotocol/docs and graph-client fixing the non-resolving testnet gateway host (documented `testnet.gateway.thegraph.com` does not resolve; `gateway.testnet.thegraph.com` does) with the curl transcript, a reply into @graphprotocol's builder threads.

**First touch: Wed 9 Sep (Graph day).** The receipt with four pinned deployment ids and block numbers, the registry JSON and SKILL.md, the docs PR, and one real question: "Spark or Compound fresher today?" DM @PaulBarba12 asking whether the pocket may pay graph-lending-mcp data.

**Why they return.** The registry and SKILL.md are reusable in their own agents; the $0.01-per-query x402 payment from a Privy wallet under a typed-data rule is the sentence the Graph AI track itself uses.

---

## 6. Audience, not testers

- **ETHGlobal hackers** in #mentorship-help and the Hedera partner channel: cheapest testers this week, but they die after 13 Sep; ask a real technical question, do not post a recruitment paragraph in a mentoring channel.
- **Amplifiers who reply to builders mid-event** (verified): @HederaCommunity, @ed__marquez, @jaycoolh, @narb_s, @JulioMCruz, the Hbar Happy Hour hosts @Mauii_MW and @filhetu, @thehbarbull, @graphprotocol reply threads. Tag them only with a real artifact (HashScan link, Basescan link, policy denial) in hand. Sponsor org accounts (@privy_io, @hedera_devs org replies, @BlockyDevs) do not amplify mid-event; tag @privy_io exactly once with the policy JSON.
- **Async partner judges** (Privy engineer, Graph Foundation reviewer, Hedera DevRel) read the repo, the showcase page and the video; they never log in. Everything they must see is listed in `PRIZE_AUDIT_FABLE51.md`.

---

## 7. Skip this window, with reasons

- **18-28 friend groups / non-crypto consumers.** Scored 8/25; need a counterparty, Telegram and a reason to stake play money; the pivots that target them fail on gambling law and on testnet-theatre (see `PIVOT_ASSESSMENT_FABLE51.md`).
- **Non-crypto shoppers and "agent clicks checkout".** OpenAI retired Instant Checkout, Operator and Atlas are gone, Claude in Chrome blocks financial sites; no merchant takes testnet money.
- **Trading and copy-trading users.** Mainnet-only to feel real; the research says "gains" framing is virality-toxic for a money product.
- **Anyone who needs real money in their own wallet this week.** Opt-in mainnet mode for outside testers is the one element that moves the team from software provider to holding a means of access to crypto-assets on behalf of a client (MiCA Art. 3(1)(26) on its face); real USDC stays in the team's demo wallet only.
- **Farcaster, Product Hunt, BetaList, Show HN before submission.** No ETHOnline conversation on Farcaster; the other venues require a no-signup try link and are post-submission.

---

## 8. Funnel numbers and metrics

**Comparator.** Sippy (ETHOnline 2025 finalist, WhatsApp wallet with real USDC in Colombia): 294 users, 46% activated, 4 monthly-active wallets, 18% retention. A testnet product recruited through crypto-dev channels with no sponsor amplification should expect less.

**Targets by Sat 12 Sep** (written into VALIDATION.md whatever the real numbers are):

| Metric | Target | Definition |
|---|---|---|
| Starts | 25 | "Try it" or sign-in that created a pocket |
| First receipts | 12 | A settled Blocky402 payment from a stranger's pocket |
| Blocked cards from strangers | 5 | A Privy denial or host provenance refusal credited to a non-team handle |
| Day-2 returns | 3 | Pressed "Open workspace" on the digest, answered the poll, or replied; Freeze is reported separately, not counted |
| Peer endpoints paid | 2 by recording, 4 by submission | Settlement tx to a non-team payTo |
| Peers paying our 402 | 1-3 | Settlement tx from a non-team payer |

**Activation.** Time from the "Try it" click to the first receipt card, target 90 seconds (guest identities pre-provisioned; the pre-typed job runs as a scripted pipeline with one model turn for narration; the Chrome-less path runs when no seat is free).

**Attribution.** Every link carries `?src=<channel>` stored on the session so `ACQUISITION.md` fills itself; the team's own clicks are excluded.

**Capacity.** Six concurrent Chrome workers, one reserved for judges, idle kill at ten minutes, thirty guest slots for testers and ten reserved for judges, counter reset at submission.

---

## 9. Phone versus desktop

Most clicks from X arrive on a phone; the workspace is a 1280x800 screencast you grab with a mouse. The landing detects a phone and offers a different door: the 30-second clip full-screen, a read-only tap-to-expand screencast of the judge worker running the scripted job, and "Send me the desktop link" (which is also the Telegram pairing). The interactive workspace is desktop-only and the landing says so.

## 10. Consent and data

Every tester sees, before the first job: you are talking to an AI (EU AI Act Art. 50); testnet only; what the agent does without asking (browse, read, quote, pay directory 402s up to 0.5 tHBAR); what parks (anything else); what is impossible (exceed the daily cap, pay a non-directory payTo, export a key); what we store (session id, Privy user id or guest id, receipts, a Chrome profile wiped at session end) and how to delete it. The landing carries a minimal privacy notice and an Impressum (a missing Anbieterkennzeichnung is a standard Abmahnung target in Germany; GDPR Art. 13 duties attach at the first sign-in). Not legal advice. Never write a tester identifier into an HCS message; the topic is immutable and public.
