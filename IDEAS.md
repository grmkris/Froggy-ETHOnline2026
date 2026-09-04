# Round 3 — winning-idea iteration (research-synthesized)

Status: research synthesis, 4 Sep 2026. Based on 8 parallel research tracks
(viral mechanics, pain points, invisible-blockchain patterns, agentic-commerce
landscape, ETHGlobal winner patterns, prize-board fit, build-in-public playbooks,
competitive scan). Earlier rounds: [`summary.md`](./summary.md),
[`PLAN.md`](./PLAN.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## TL;DR — the recommendation

**Keep the shared-browser + wallet-leash architecture. Change the *story*: from
"agentic wallet" to a consumer product with a name like _Allowance_ —**

> **Give your AI $20. Watch it work. It can't spend a cent past your limit.**

Hero use case for the demo and the user-acquisition wedge: **the subscription
killer** — the agent logs in, survives the retention dark-pattern maze, cancels
the thing, and the wallet revokes the merchant's ability to ever charge you
again. Viral engine: the leash itself, as public spectacle ("Break the Leash"
challenge + a public agent ledger) during the build-in-public week.

Every research track converged on this. Details below.

---

## 1. What the research converged on

Eight independent research tracks, same answer from different angles:

**The direction is validated — the "empty cell" is real.** Every agent wallet
that shipped in 2026 (Coinbase Agentic Wallets, MetaMask Agent Wallet, MoonPay
PayBox, Skyfire, Payman, Nevermined, Catena, Locus — $70M+ combined funding) is
*developer infrastructure or B2B*. Chat checkout (OpenAI/ACP, Google UCP,
Copilot Checkout) is crowded, subsidized, and *retreating* (OpenAI scaled
Instant Checkout back in March 2026). Agent browsers (Atlas, Comet) are
single-player and have **no spend limits** — and Comet got prompt-injected into
buying from a fake store. Nobody ships: *consumer UX × shared live browser ×
wallet-enforced spend policy*. We do.

**The leash is the headline, not the plumbing.** Privy (160M+ accounts,
$15B+/mo) already makes policy engines commodity infra. Judges and users don't
care that policy exists — they care about the *moment*: the agent tries to
overspend, the wallet says no, the human grabs the wheel. Lobstar Wilde (Feb
2026: agent accidentally sent a stranger ~$40K) and the Grok/Bankr exploit
(~$150K drained) made "AI emptied the wallet" a felt fear. We are "the product
that would have saved Lobstar Wilde."

**Invisible-blockchain playbook is solved — copy Polymarket, not Starbucks.**
Email/passkey login silently provisions the wallet (Privy docs literally have a
Polymarket recipe). Balances are "dollars," never "USDC." The chain appears
only as opt-in magic (Pudgy QR trick) — for us: normies see an AI that pays
for things; the X audience sees onchain policy receipts. Starbucks Odyssey died
because the *value* was invisible, not the chain. Celsius died hiding *risk*.
We hide plumbing, never risk, and keep caps tiny ($5–20).

**The pain point with the best math is subscription cancellation.**
US adults pay ~$219/mo for subscriptions and think it's $86; $252/yr wasted on
forgotten subs; FTC's click-to-cancel rule was vacated July 2025 so dark
patterns persist; 63% say canceling is harder than signing up. Rocket Money
charges $7–14/mo and claims $2.5B saved — but it only *tracks and nags*; it
cannot survive a gym's retention maze or revoke a merchant's charging ability.
The agent *acts*, the wallet *enforces*. That's the 10x claim, and it demos in
90 seconds. Runner-up wedge: **group settling** ("chase friends for money") —
Telegram-native, spreads per group created, stablecoin settlement is genuinely
10x better than "go Venmo them."

**This is exactly what wins ETHOnline.** ETHOnline 2024's Web3Auth track: all 7
winners were consumer apps hiding the wallet. Bangkok 2024: 4 of 10 finalists
were games, 2 Telegram bots. Privy's own past bounties *required* a
consumer-facing app. AI-agent tracks dominate 2025–26. Judging = working MVP +
UX + deep sponsor integration + 3–4 min video where money moves on screen.

---

## 2. The idea, sharpened

### Product (working name: **Allowance**)

A web app where you give an AI a budget and chores. You watch it work in a
real browser — live screencast, you can grab the page any time. It physically
cannot overspend: the wallet enforces per-transaction caps, daily limits, and
per-merchant allowances at signing time, not as a prompt rule.

Three money chores at launch (pick **one** as hero, keep others as bullets):

| Chore | Role | Why |
|---|---|---|
| **Cancel my subscriptions** | Hero demo + acquisition wedge | Biggest felt pain, proven WTP, cinematic demo, wallet adds what Rocket Money can't (revoke merchant charging) |
| Split the group dinner | Viral loop | Telegram-native, spreads per group, stablecoin settlement is the real 10x |
| Watch for price drops / refunds | Retention hook | Refare proves $218/trip value; needs more integrations, so it's v1.1 |

### The 90-second demo (this is the pitch)

1. "Meet my AI. It has $20. Watch." — shared browser, agent logs into a gym
   account.
2. Agent survives three retention dark patterns live ("Are you SURE? Here's a
   discount!") — the room laughs because everyone has lived this.
3. Cancellation confirmed. Then the beat no incumbent can do: the wallet
   **revokes the merchant's charging allowance**. "It can never charge me
   again."
4. Cut to the receipt posted to the public ledger. End card: "Give your AI an
   allowance."

### Positioning lines (from the competitive scan)

- "Training wheels for the agent economy — everyone else builds rails for
  machines; we build trust for people."
- "Watch your agent work live. Grab the wheel anytime. It can't spend a cent
  past your limit — enforced by the wallet, not by hope."

---

## 3. Alternatives considered and ranked

| # | Idea | Verdict |
|---|---|---|
| 1 | **Allowance** (leash + shared browser + money chores) | **Build this.** Empty cell, best demo, best sponsor fit, leash = viral hook |
| 2 | Group-expense settling agent (Telegram-first, stablecoin settlement) | Strong viral loop, weaker sponsor/judge wow. **Fold in as feature #2**, not the hero |
| 3 | "Freysa-flip" — public adversarial game: try to make our agent overspend | Not a product, but **the perfect launch stunt** — see §5 |
| 4 | Agentic shopping / checkout assistant | Dead zone: OpenAI/Google/Amazon own it and are retreating; Amazon v. Perplexity made unattended agents legally radioactive |
| 5 | x402 service provider / agent infra | Sponsors want it (Hedera $6k), but it's the crowded infra layer with $70M+ competitors. Fails "consumer" constraint |
| 6 | Trading/copy-trading agent (Graph query layer from round 1) | Trading arenas are now crowded (Alpha Arena), fails consumer relatability, and "gains" framing is virality-toxic for a money product |

The round-1/2 architecture (Bun + shared Chrome + CDP screencast + Privy
policies + Telegram onboarding) survives intact. What changes is the framing
and the first chore.

---

## 4. Sponsor prize strategy (from the prize board + sponsor messaging)

| Sponsor | Prize | Play | Effort |
|---|---|---|---|
| **Privy** | $2,500 "Best financial flow" | Policy-leashed agent spending = their exact current narrative ("enforced at signing time"). Lead target. | Core build |
| **Ledger** | $3,500 "AI Agents x Ledger" | Human-in-the-loop approval = our "grab the wheel" moment. | Medium |
| **The Graph** | $5,000 AI track | Subgraph/Token API indexes the public agent ledger (every decision + receipt). Viral asset and prize asset are the same thing. | Medium |
| **Hedera** | $6,000 x402 track | Requires *hosting* a live x402-gated service — bend only if time allows; otherwise skip. | High |
| **Continuity angle** | Graph/World/Arc continuity pools | The team's Cannes 2026 "Ground Truth" repo may unlock continuity prizes — check eligibility. | Low |

Rule from past winners: stack 2–3 overlapping bounties by design; narrow and
deep beats ambitious and incomplete.

---

## 5. Build-in-public plan (viral hooks, day-by-day)

The 2025–26 proven formats: Alpha Arena ($10k per LLM, public leaderboard),
Project Vend (watch an AI run a shop and fail), Freysa (pay to attack an AI's
one rule), fly.pieter.com (daily GIF + revenue screenshots). Common thread:
**real stakes + radical transparency + a countdown.**

1. **"$20 Survival Week"** — from day 1, the agent has a real $20 budget and
   must pay for real things (domain, API credits, coffee). Public live balance
   page. Daily update posts with receipts. The countdown ends at submission.
2. **"Break the Leash" bounty** — invite X to prompt-inject the agent into
   overspending. Every attempt blocked live by the Privy policy; each block is
   a tweet. Small escalating prize if anyone succeeds. Product demo *is* the
   spectacle (and demos the sponsor tech).
3. **The deadpan public ledger** — every agent decision auto-posted:
   "13:42 — tried to buy a $200 tungsten cube — BLOCKED by leash." Indexed by
   The Graph. Content engine + prize integration in one artifact.
4. **"Grab the wheel" clips** — screen-recorded moments where the human seizes
   the browser mid-task. Claude-Plays-Pokémon format, but with money.
5. **Waitlist with missions** — Robinhood-style queue (refer to move up); top
   referrers set tomorrow's chore for the agent. Audience-authored content.

Anti-patterns: no gains/trading framing, no ragebait, no big balances
(screenshots of money feel scammy; screenshots of *rules* feel clever).

---

## 6. Seven-day build sketch

| Day | Build | Public |
|---|---|---|
| 1 (Fri 4) | Bun workspace, Privy email login → embedded wallet, policy engine wired ($20 cap, per-merchant allowances) | Announce stunt: "$20 Survival Week starts now" + live balance page |
| 2 | Shared Chrome: CDP screencast, human/agent arbitration ("grab the wheel") | Clip: agent browses, human yanks control |
| 3 | Agent loop: subscription-cancellation flow against 2–3 real targets (gym, streaming, news) | Clip: dark-pattern maze run |
| 4 | Wallet enforcement: revoke merchant charging; receipts → public ledger (Graph indexing) | "Break the Leash" bounty opens |
| 5 | Telegram onboarding (bot deep link → magic link) + group-split flow | Group-split clip; waitlist opens |
| 6 | Polish, Ledger/human-approval moment, x402 if cheap, buffer | Best-of clips; bounty finale |
| 7 (Sun 13) | Freeze by ~08:00 EDT. Record 3–4 min video. Submit by 12:00 EDT | Submission post + thread recap |

Cut list if slipping (in order): Hedera x402 → Ledger → group split →
everything except hero demo.

---

## 7. Post-hackathon extension path

- **Allowances as a primitive**: kids' allowances, team budgets, creator
  payouts — same leash, new policies. Natural consumer expansion with a real
  pain (parents) and no new tech.
- **White-label** (already the round-1 plan): branded "give your customers an
  AI with a budget" for banks/fintechs — Privy's B2B track narrative.
- **Chore marketplace**: community-contributed chore playbooks (cancel X,
  claim Y refund), monetized per success — the Refare success-fee model,
  generalized.
- **The ledger becomes the moat**: public, indexed agent-behavior data is
  reputation infrastructure for the agent economy (ERC-8004 angle, Graph
  continuity).

## 8. Risks

- **DoNotPay precedent**: FTC fined overclaimed consumer AI ($193K, Jan 2025).
  Market demonstrated actions ("watch it cancel"), never lawyer-isms.
- **Amazon v. Perplexity**: unattended agents in logged-in sessions are legally
  contested. Our human-present, human-takeover design is the defensible form —
  say so explicitly in the pitch.
- **Scope creep**: round 1 listed ~6 products. The cut list in §6 is law.
- **Real money**: keep all caps at $5–20. Regulatory blast radius scales with
  amount, not cleverness.
