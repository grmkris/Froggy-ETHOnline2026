# Prize audit (FABLE51)

Written Sat 5 Sep 2026. Every claim we intend to make on the ETHOnline 2026 submission form, tested against the literal track text in `docs/prizes.md` and the event rules verified in `RESEARCH_FABLE51.md` section 2, with the evidence a judge will look for, where it lives, the risk, and the extra points we take or skip. Sources: `research_FABLE51/dim-prizes_FABLE51.md`, `gap-privy_track_intel_FABLE51.md`, `gap-winning_submission_anatomy_FABLE51.md`, `gap-event_week_graph_and_peers_FABLE51.md`, the prize-rules lens of each `pivot-*_FABLE51.md`, and the three judge panels in `panel-judgments_FABLE51.md`.

---

## 0. Slot accounting and the tracks we enter

Up to three partner prizes per project; a partner with multiple tracks counts once. We select exactly **Privy, The Graph, Hedera** and enter five tracks:

| Partner | Track | Prize | Enter? |
|---|---|---|---|
| Hedera | AI & Agentic Payments on Hedera | $2,000 x up to 3 | Yes |
| The Graph | Best Use of Composable or Standardized Graph Products | $2,500 / $1,500 / $1,000 | Yes |
| The Graph | Best AI Tooling or AI Use Case (From Scratch) | $2,500 / $1,500 / $1,000 | Yes |
| Privy | Best financial flow | $2,500 | Yes |
| Privy | Best B2B financial product | $2,500 | Only if the Intents approval shipped; otherwise do not tick it |
| The Graph | AI Use Case (Continuity) | | No: Start Fresh; Jonas's prior Graph layer stays out of the tree |
| Hedera | Open Source: Improve the Hedera Harness | | No: different product |
| Ledger, ENS, World, Uniswap, Chainlink, Bazantic | | | No: each costs a fourth slot that does not exist; Ledger additionally requires the Ledger Key Ring CLI, so a Privy wallet does not count |

Author's expected value: Hedera 0.4 x $2k + Privy flow 0.3 x $2.5k + Graph composable 0.3 x about $1.5k + Graph AI 0.25 x about $1.5k + Privy B2B 0.1 x $2.5k, about $2.6k expected, $11.5k ceiling. The base rate for any partner prize is 8-10% of showcased projects, so the plan optimizes evidence on screen, not features.

---

## 1. Hedera: AI & Agentic Payments on Hedera

**Qualification text (verbatim):** "Host a live x402-gated service on Hedera testnet or mainnet, settled through the Blocky402 facilitator. Build a platform or agent that consumes that service and completes at least one real paid request end to end. Public GitHub repo with a README covering setup, architecture, and the payment flow. Demo video of five minutes or less showing the paid request executing."

| Bullet | Our evidence | Where a judge finds it |
|---|---|---|
| Live x402-gated service on `hedera:testnet` settled through Blocky402 | Our brief endpoint: `@x402/hedera` server-side verify and settle against `https://api.testnet.blocky402.com`, fee payer read from `/supported` at boot, payTo a real 0.0.x account, HBAR asset 0.0.0, 0.0125 tHBAR per protocol | A curl printed in README and HEDERA.md that returns a 402 from another network |
| Agent consumes it and completes a real paid request | The per-user pocket pays it (and fare402) on camera; the daily cron pays it once per tester per day | Video 0:48-1:25; HEDERA.md transaction ids |
| README with setup, architecture, payment flow | README sections plus a payment-flow diagram | README; HEDERA.md adds tx ids, HCS topic, accounts, facilitator, price, idempotency notes |
| Video at most five minutes showing the paid request executing | One unbroken take: the 402 body with the facilitator URL, the settle, the HashScan page, the HCS message | Video 0:48-1:25 |

**Extra points we take:** metered pricing per protocol rather than a flat charge (the price is fixed in the 402 before the work runs, so "metered" means priced by the requested protocol count, stated honestly); a verifiable payment audit trail on HCS (one message per settlement carrying buyer pocket, price, settlement tx, deployment ids and block; never a tester identifier); discovery via `/.well-known/x402.json` and a directory of external endpoints the pocket has paid ("budgets across providers" is literally the directory); Validation with real strangers' receipts in VALIDATION.md and ACQUISITION.md (the 15/100 weight comes from Hedera's hedera-skills rubric and is INFERRED to apply; we pursue it because the winner anatomy rewards visible evidence regardless).

**Skipped:** ERC-8004 or HCS-14 identity, A2A/ACP, Scheduled Transactions, HTS USDC settlement, a self-hosted facilitator.

**Risks.** Reads as "agent wallet with caps" next to Tally (Hedera bounty winner, Aug 2026), Glassbox402 (last Hedera winner), countersign and chip402 unless the shared Chrome is on screen at 0:00 and the third-party pay is real. Blocky402 outage or the 100-requests-per-minute-per-IP limit during recording (record that beat as its own take). A double charge on a retried fetch (the idempotency state machine, tested Day 2). A hollow or alias payTo (we use a portal-created account id). The pocket is not Privy-gated: say it plainly, twice. Copying a proof-of-concept that points at x402.org's facilitator would silently lose the literal "settled through the Blocky402 facilitator" qualifier: the facilitator URL is on screen in the 402 body and named in "How it's made".

---

## 2. The Graph: Best Use of Composable or Standardized Graph Products

**Qualification text (verbatim):** "Either compose two or more of The Graph's products, or build meaningfully on a standardized schema (for example the Messari Standardized Subgraphs). Consume live data from a Graph provider... Mocked, local-only, or static datasets do not qualify. Simply querying one Subgraph with no composition or standardization does not qualify... Make the standards leverage clear: show what became easier because a shared schema or composed product was used."

| Bullet | Our evidence |
|---|---|
| Standardized schema | One Messari lending query shape (`markets { name canBorrowFrom isActive inputToken{symbol} totalBorrowBalanceUSD rates{rate side type} }`, side BORROWER, type VARIABLE) run unchanged across four pinned deployments: Aave v3 Ethereum, Aave v3 Base, Compound v3 Ethereum, Spark Lend (three protocols, two chains; Aave-only on two chains would be the weakest reading) |
| Compose two or more products | The Subgraph MCP (`https://subgraphs.mcp.thegraph.com/sse`) for discovery, documented in SKILL.md, plus the gateway (Studio key and mainnet x402) for queries |
| Live provider, no mocks | Studio Free Plan key (the tester default) and the mainnet x402 gateway; the receipt records which |
| Not a single subgraph | Four deployment ids on screen at 0:24-0:48 and on every receipt |
| What became easier | GRAPH.md: one query, one parser, one registry; adding Spark was one JSON line; freshness gate returns "unavailable" over stale data (the provenance and fail-closed behaviour Graph praised at Lisbon 2026) |

**Risks.** A single-subgraph client at judging is this track's stated disqualifier: the four-deployment registry lands before any other Graph work. A deployment goes stale mid-week (Zerolend already is; Explorer shows the Messari deployments as "last updated 2 years ago" and live sync must be probed Day 1 with `_meta { block { number } }`); Spark is the spare and deeptrace's Base set (Aave v3 Base, Seamless, Moonwell) is the fallback. The shape is crowded (atlas had 86 deployments); our differentiator is that the standardized answer drives a payment. We do not author a standardized subgraph or a Substreams module, which the track also rewards, so placing is uncertain.

**Extra:** the Subgraph MCP as the second product; deployment id and block on every receipt; the graphprotocol/docs and graph-client fix PR for the non-resolving testnet host, cited in FEEDBACK.md; the Agent0 ERC-8004 read-back explicitly not claimed.

---

## 3. The Graph: Best AI Tooling or AI Use Case (From Scratch)

**Qualification text (verbatim):** "Use The Graph as a load-bearing part of the project... the agent/app uses The Graph (Subgraphs, the Subgraph MCP, or Substreams) as its source of blockchain data... Consume live data from a Graph provider, for example querying Subgraphs with an API key from Subgraph Studio... Do meaningful work with the data: reasoning, decisions, automation, or a natural-language interface, not just printing a raw query result... Open-source the code with a clear README or SKILL.md." The description also says "let your agent pay per query autonomously with x402".

| Bullet | Our evidence |
|---|---|
| Load-bearing | The standardized answer decides which market the brief highlights, whether the pocket tops up, and what the Hedera 402 sells; no Graph data, no spend |
| Live data | The demo Privy wallet pays the mainnet x402 gateway $0.01 per query under a typed-data policy (the track's own sentence, Basescan tx on screen), with the Studio key as the silent fallback and the tester default |
| Meaningful work | Natural-language ask, minimum-rate reasoning with provenance, then an action |
| Open source | README plus `skills/graph-lending/SKILL.md` and `registry.json` so any agent can reuse the query set |
| Pool | From Scratch: no prior Graph code in the tree, stated in README |

**Risks.** The most crowded track on the board (about 0.2 probability of placing). A typed-data types-map mismatch makes every payment fail closed (copy the map from the first real signing request; the Studio fallback keeps the track alive). $5 of real USDC in a hackathon wallet (Privy cap $0.02 per payment, one payTo, host $1 per day). Peers already declaring Graph AI plus Hedera this week: Ether-Hunt, AgentTether.

**Extra:** x402 pay-per-query from a Privy wallet under a typed-data rule (nobody else pairs the two); SKILL.md and registry as reusable tooling; receipts that say which path served the answer; the docs fix.

---

## 4. Privy: Best financial flow

**Qualification text (verbatim):** "Integrate Privy as a core part of the product. Create or use at least one Privy wallet. Complete at least one functional financial flow using a generally available Privy feature. Eligible flows include transfers, bridging, stablecoin conversions, swaps, self-service Earn vaults, onramps, or other supported wallet actions... Features requiring commercial or guided onboarding may be mocked, but they do not count as the required functional Privy integration... Clearly explain how Privy improves the user experience."

| Bullet | Our evidence |
|---|---|
| Core Privy | Every user is a Privy user with an embedded wallet (email OTP); the agent is a revocable additional signer under an override policy; all on the free Developer plan (policy engine and delegated access verified in the pricing matrix) |
| At least one wallet | Created at first session |
| A completed functional GA flow on camera | The agent-initiated top-up transfer signed as `eth_signTransaction` under rule (b) with the 24-hour aggregation visible ("transfers" is on the eligible list), plus the x402 USDC payments to The Graph signed as EIP-3009 typed data under rule (a). A denial alone is not a completed flow; the top-up completes on screen at 0:48-1:25 with its explorer link |
| Working demo and source | Live URL and repo |
| How Privy improves UX | One login, no popup per payment, no key in any prompt, the policy card is the UI, freeze is one tap; PRIVY.md holds the policy JSON, policy id, wallet ids, the raw denial transcript and the `secp256k1_sign` test |

**Risks.** Privy slots often go unawarded (1 of 4 at ETHGlobal New York 2026); judges reward clean use of the exact named feature in a polished UI, so the top-up must be unmistakably a Privy wallet action with its policy id on screen. The nearest Telegram-plus-Privy analogue (Deport The Dip) won nothing. If the 296 spike fails the transfer runs on Base Sepolia to the treasury (still a Privy transfer) and the tHBAR credit is labelled "mock bridge (testnet)" on screen and in the README; a labelled transfer that is not what happened would be the disqualifying overclaim. Never claim a Privy daily cap on typed-data x402 payments. A stateful aggregation without per-wallet scope sums across the app; verify scope on Day 4.

**Extra:** stateful aggregation on screen; the typed-data policy from Privy's own x402 recipe; `wallet_send` exposed on purpose so the denial is Privy's default deny, not a missing tool; the honest "why Privy does not gate Hedera" section; Telegram OAuth login if the Saturday DID test passes.

---

## 5. Privy: Best B2B financial product

**Qualification text (verbatim):** "Demonstrate a business or organization use case... Implement at least one functional B2B workflow, such as a payment, approval..." and "at least one Privy control, such as policies, signers, key quorums, or intents".

**Our position.** Framing: "allowance management for a team's agents": one owner-funded wallet, per-agent signers with policies, per-agent pockets and ledgers, receipts with policy ids, above-cap requests parked for a human. Controls: policies (including stateful) and signers; intents only if the Wednesday six-hour box lands (agent proposes, Privy intent, Telegram Approve authorizes with the owner key, Privy executes, intent-id transitions in the README). Costs no partner slot.

**Recommendation.** Tick this track only if the Intents approval shipped. The Allowance red team called an unbuilt claim "padding" and past Privy judges verified the exact feature; a README paragraph is not "at least one functional B2B workflow". Zero video seconds either way.

---

## 6. Event rules checklist (each is a disqualifier or a silent zero)

| Rule | What we do | Owner |
|---|---|---|
| Video 2-4 minutes (auto-rejected outside), at least 720p, human narration (no TTS or AI voice), not sped up, not phone-recorded | Ten beats in 3:15, never past 3:40 on a retake; 1080p OBS capture; Jonas's own voice and face cam; compression by cuts; the phone appears in frame, it does not record | Jonas |
| Product on screen early, an explorer page in the back half, per-sponsor evidence file, live URL alive after 13 Sep (the four things that separated winners from losers in the anatomy study) | Product at 0:00, Basescan at 0:24-0:48, HashScan and HCS at 0:48-1:25, HEDERA.md / GRAPH.md / PRIVY.md, box kept up through 20 Sep with an hourly curl | Jonas, A |
| Start Fresh: all work begins after kickoff; prior project-specific code, designs or assets are not allowed unless from public libraries or starter kits, and any reuse must be disclosed in writing; undisclosed prior work is a disqualification with a possible ban | README "Prior art and what we reused" and AI-USE.md name every pattern source; nothing copied from prior private repos; any "ported from" header links a public source or the file is rewritten; a fresh Privy app rather than one inherited from an earlier project; Jonas's prior Graph layer stays out; no Continuity registration | A, Jonas |
| Commit history: "Submissions with large single commits or missing histories may be disqualified" | Granular commits from now on so any early bulk commit is one of many, never a squash or a history rewrite; a dated README note explains any bootstrap commit; anything tracked that should not ship (for example a browser profile directory) is untracked and disclosed | A |
| AI-tool usage must be documented; spec-driven work must include all spec files, prompts and planning artifacts | AI-USE.md plus `docs/` and `research_FABLE51/` committed; the `IDEAS*.md` and `*_FABLE51.md` files stay in the repo | Jonas |
| Check-ins Mon 7 Sep and Thu 10 Sep by 23:59 EDT | Repo, one-liner, screenshot of the hosted app; consequences of missing them are undocumented, so do not test it | Jonas |
| Feedback sessions Tue 8 Sep 14:00 EDT and Thu 10 Sep 09:00 EDT | Attend with the live URL; notes into FEEDBACK.md | Jonas |
| Showcase: tagline at most 100 characters, description, "How it's made", live URL, source URL, video; tick Finalist and Partner Prizes; select up to three partners and name the tracks | Drafted Day 7, submitted Day 8 by 20:00 CEST; the hard cutoff is Sun 13 Sep 12:00 EDT with no grace | Jonas |
| Partners judge asynchronously from repo, showcase and video only | Everything above must be visible without logging in; the curl-able 402 and the policy JSON are in the README | all |

---

## 7. Overclaim watchlist (never say these)

- "Privy is the leash on the Hedera payment" or "one leash across two chains". Privy does not evaluate raw signatures.
- "Enforced in the enclave" for any cap. Say "enforced server-side under policy".
- "Privy caps the daily x402 spend". Aggregations do not cover typed data; the daily cap is a host ledger.
- "The kill switch deletes the key" unless pockets are per user.
- "Twenty strangers ran this" before N exists. VALIDATION.md carries the real number, however small.
- "A real bridge". The tHBAR credit is our treasury at a fixed rate, labelled.
- "We found no product that does this". Say "we found none that combines a watchable, grabbable Chrome with a policy outside the model; Tally, Glassbox402, countersign, chip402, HumanMandate, OpenSpender, piprail and MetaMask Agent Wallet are the nearest".
- "Single-subgraph" anything. Four deployments or the Composable track is not entered.

---

## 8. Submission-form skeletons

**Tagline (under 100 characters).** "One Chrome, two drivers: your agent pays x402 on Hedera, you hold the wheel and the kill switch."

**Description (150-350 words), in this order.** The problem in two sentences (keys and caps; the Morse-code drain; the $3,400 proxy loop). What it does in three bullets (a Chrome you can watch, grab and freeze; a pocket whose rules live outside the model; a job that pays The Graph per query and a Hedera x402 service through Blocky402). Demo beats with timestamps. Where each integration lives with file paths. On-chain evidence (Basescan, HashScan, HCS topic, policy id). Run it locally. Honesty box. Not in scope. AI use. Team. Testers and what they broke.

**How it's made (400-900 words), in this order (the Glassbox402 and BookerBob shape).** Stack with pinned versions. "Hedera, where it settles": network, facilitator URL, price, payTo, an HCS topic id, a transaction id, idempotency. "The Graph is why it spent": the four deployment ids, the query, the registry, the freshness gate, which path served the demo. "Privy is the leash, on the EVM leg": the policy JSON with ids, the raw denial, what Privy does not gate. "The browser": one Chrome per process, one CDP call in flight, the grab arbitration, fresh profiles. The hackiest part (say it). Prior art we are not. Prior art and what we reused.

**Per-partner text.** For each track, map every qualification bullet to a repo path or a video timestamp, in the order the track lists them; quote the bullet, then the evidence. Hedera: name Blocky402, `hedera:testnet`, the price, the payTo. The Graph: name the four deployment ids and "single-subgraph = not entered". Privy: name the policy id, the method each rule covers, and the sentence about the Hedera leg.

---

## 9. Video rule check (run before upload)

Length between 2:00 and 4:00. Resolution at least 1280x720. A human voice, no synthetic narration, no music over text-only slides. No speed ramp anywhere. Product visible in the first ten seconds. A 402 body, a settle and an explorer page in one unbroken sequence. The Privy transfer completes on screen and the denial shows the policy id. Every amount labelled mainnet or testnet. The digest labelled "recorded yesterday". Repo URL, live URL and the curl-able 402 on the end card. Re-watch it on the showcase page after upload, not only in the editor.
