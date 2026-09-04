# Agentic wallet — ETHOnline 2026 brainstorm

Status: **partially locked** (4 Sep, round 2). Research lives here; the product shape lives in [`ARCHITECTURE.md`](./ARCHITECTURE.md).
Clock: ETHOnline is **4–16 Sep 2026**. Submission **Sun 13 Sep 12:00 EDT**. Today is 4 Sep. About **nine days**.

---

## 0. Decisions locked (round 2)

These override the original “Telegram Mini App is the product” line in `summary.md`.

| Decision | Call |
|---|---|
| Primary surface | **Web app** (Harness-shaped workspace: chat + live browser + wallet pane) |
| Telegram | **Onboarding + later approvals**, not a Mini App as the product |
| Agent computer | **Own Chrome**, spawned in-process with **Bun + `Bun.WebView`**, CDP, screencast, human/agent arbitration — same bet as Harness / Invok |
| Custody | **Privy** (embedded user wallet + policy engine) |
| Sponsors | Privy, The Graph, Hedera (Arc still skipped: mainnet 16 Sep) |
| Open source | Yes. White-label is a README, not the video |

The distinctive sentence is no longer only “policy-bound spend.” It is:

> The agent gets a real browser you can watch and take over. The wallet is the leash on that browser.

---

## 1. What the team already decided (round 1, still true)

From `summary.md`, minus the Mini App assumption:

- Drop gaming. Build a **B2C agentic wallet**.
- Funded via on-ramp; agent executes swaps / payments / bookings.
- Ship **open source** with a **white-label** path later (Starbucks-style branded apps, yield on balances).
- Cap at **three sponsors**: Privy, The Graph, Hedera.
- Explore **WebMCP** so Claude can drive the wallet (now: our site *exposes* tools, and our agent *consumes* tools on other sites).
- **Session keys** / Privy policies for scoped spend.
- **x402** native; inference funded from the wallet (minirouter.sh shape).
- Graph **agentic query** (Jonas’s prior layer): ask questions, surface traders, one-click copy-trade.
- In-app **promotions/ads** via streaming payments (Superfluid / Streamflow) — still parked.

That is still too many products. Nine days. [`ARCHITECTURE.md`](./ARCHITECTURE.md) picks the demo. The rest of this file is the market + prize context.

---

## 2. What people actually want (X + web, Sep 2026)

The category is no longer “chat that can swap.” Infra already shipped that. Demand has moved to **the leash**.

### The fear everyone repeats

> Every agent is one bad prompt away from emptying the wallet.

Sources: [Rifat Ahmed, Jun 2026](https://x.com/Rifat_EE/status/2070378709304160683) (18k views); [MetaMask, Jun 2026](https://metamask.io/news/what-is-an-agentic-wallet); [BeInCrypto, Jun 2026](https://beincrypto.com/ai-agents-bring-new-rules-for-crypto-wallets/).

The control set that keeps showing up, almost verbatim:

| Control | Why it exists |
|---|---|
| Per-tx cap | Stops one catastrophic send |
| Session / daily rolling cap | Stops death-by-a-thousand micropayments |
| Allowlisted tokens, chains, contracts, counterparties | Prompt injection invents addresses you have never seen |
| Time window / expiry | Session dies without a human |
| Kill switch / instant revoke | Off-chain revoke beats waiting for a mined tx |
| Human approval **above** a threshold | Autonomy for $0.01, HITL for $50 |
| Audit trail: who, which policy, expected cost, actual tx | Payment ≠ decision. People want “why it spent” |

[Coincub, Aug 2026](https://coincub.com/wallets/guides/how-programmable-wallets-can-limit-autonomous-spending/) names the same seven controls and two architectures: **on-chain session keys** (ERC-4337 + ERC-7715) vs **MPC / TEE policy engine** (Coinbase Agentic Wallets, Privy enclave).

### The UX people actually describe

Not “confirm every swap.” The opposite:

> Developers just want to connect a wallet, set a spending limit, and make API calls the same way they'd use any API key today, funded by their wallet instead of a credit card. There is no turnkey way to authorize once in a browser and have x402 execute automatically after that.
>
> — [@0xblockboy, Feb 2026](https://x.com/0xblockboy/status/2020639766963016041) (34k views, 202 bookmarks)

Same beat from Teneo: one session-key signature, then type → agent runs → payment settles, no pop-up per query. [Mar 2026](https://x.com/teneo_protocol/status/2032071142232461752).

Telegram-native version already exists as a competitor: **SingIt** — approve a budget once in Telegram, agent pays x402, **never sees a key**. [Aug 2026](https://x.com/SingItAgent/status/2092277223394857254).

### Three trust vectors (do not collapse them)

From [Philip Decker / soho_pay, Sep 2026](https://x.com/philip0x/status/2094849773300068359):

1. Trust the agent with **data**.
2. Trust the agent to **spend correctly** (not drain you).
3. Trust the **merchant / API** not to scam the agent.

A wallet that only does (2) still loses if (3) is unsolved (allowlists, receipts, refunds). Claude Commerce solves (3) for retail by **never inventing a price** and handing checkout to the host. We should steal that: the model proposes, the harness / policy signs.

### The missing “why”

Chinese CT (and Ritual discourse) compressed the stack to three questions:

- **x402** — how money moves
- **ERC-8004** — who is moving it
- **verifiable execution** — why it was allowed to

[Yuze, 4 Sep 2026](https://x.com/2038277897Zheng/status/2095904282507874400). Graph Agent0 subgraphs already index ERC-8004 identity + reputation + x402 support. That is a prize-shaped coincidence, not a distraction.

### Commerce, not just DeFi

Claude’s commerce blueprint ([repo](https://github.com/anthropics/commerce-agents), [anatomy post](https://claude.com/blog/the-anatomy-of-effective-commerce-agents), 2 Sep 2026):

- Shopping agent **does not charge**. Checkout is a card that hands off to the host.
- Merchant writes are **staged** until a person applies them.
- Safety is **code in the harness**, not a prompt.
- Writes accept only **server-issued IDs** (no hallucinated product / recipient).
- Caps are on **resulting state**, writes serialized per session.
- Skills, not a swarm of subagents. UI components **are tools**.

Accenture quote on that page: 85% of consumers open to an AI agent; ~3 in 4 would trust a personal agent more than their best friend to buy. Visa / Mastercard / Shopify are all saying the same thing: **merchant keeps the relationship**, agent is intelligence, not the storefront.

MoonPay PayBox already puts a vault **inside Claude and ChatGPT** with passkey approval, x402, and Visa TAP. [Decrypt, Jul 2026](https://decrypt.co/374687/moonpays-paybox-crypto-wallet-claude-chatgpt).

**Implication:** “wallet that chats” is table stakes. “wallet that is the checkout + leash for any agent (Telegram, Claude, Cursor)” is the product.

---

## 3. Competitive reality — do not rebuild these

Shipped in 2026, before this hackathon:

| Product | What it is | Gap we can still own |
|---|---|---|
| [Coinbase Agentic Wallets](https://www.coinbase.com/en-ca/developer-platform/discover/launches/agentic-wallets) (11 Feb) | MPC, session caps, x402, gasless Base, `npx awal` | Infra, not a consumer app |
| [Privy agent wallets](https://docs.privy.io/wallets/overview/solutions/agent-wallets) | Agent-owned **or** delegated signing + policies + x402/MPP + Agent CLI | Same — SDK |
| [MetaMask Agent Wallet](https://metamask.io/en-GB/news/introducing-metamask-agent-wallet) (6 Aug) | Guard / Beast mode, simulation, MEV, spend limits | Extension users, not Telegram |
| Binance Agentic Wallet | Daily limit, token scope, QR session, high-risk → app confirm | CEX users |
| [Cloudflare Wallets](https://finance.yahoo.com/technology/ai/articles/agent-native-economy-finds-wallet-085835345.html) (4 Aug) | Account wallet → virtual wallets per agent, x402 | Infra for sites |
| TON Tech Agentic Wallets (28 Apr) | Telegram bots spend TON inside an assigned balance | **TON, not EVM / Hedera** |
| SingIt | Telegram budget signature, agent never sees keys, x402 | Closest consumer competitor |
| MoonPay PayBox | Wallet **inside** Claude / ChatGPT | Not open source, not Graph/Hedera |
| Ramp `agents.ramp.com` | Corporate USDC spend controls + books | B2B cards, not B2C |
| Primer Vault | Desktop agentic wallet, x402 facilitator on Robinhood Chain | Desktop, not Telegram |

White space that is still real:

1. **Consumer product** (not another SDK) with the leash **visible**.
2. **Telegram-first on EVM / Hedera**, not TON.
3. **Graph as the eyes** (live, standardized, copy-trade / portfolio), **x402 as the hands**, **Privy policy as the leash**.
4. **Claude / WebMCP as a second driver** of the same wallet (one policy, many agents).
5. Open source + white-label later — **not in the 90-second demo**.

---

## 4. Prize math (max 3 sponsors)

Team cap is Privy + Graph + Hedera. That is correct. Arc mainnet is 16 Sep; submit is 13 Sep. Skip Arc as a primary.

| Track | $ | Qual that actually bites | How this product hits it |
|---|---|---|---|
| **Hedera — AI & Agentic Payments** | $2k × up to 3 | **Host a live x402-gated service on Hedera** (Blocky402) **and** an agent that pays it end-to-end | Wallet hosts a paid data/inference/query service; the **user’s agent** is the consumer. Extra points: ERC-8004, HCS audit, streamed / scheduled txs |
| **Graph — Best AI use case (from scratch)** | $2.5 / 1.5 / 1k | Graph is **load-bearing**, live provider (Studio / Market), reasoning not a raw dump. Starter kits OK; project-specific prior code is not | Agent asks in English → Subgraph MCP / Agent0 / Messari standardized schema → decision → spend. Copy-trade is the story; **one composed query** is the qual |
| **Graph — composable / standardized** | $2.5 / 1.5 / 1k | Compose ≥2 Graph products **or** a standardized schema (Messari). Mocked data DQ | Same query across lending/DEX subgraphs, or Subgraph MCP + Agent0 ERC-8004 subgraphs |
| **Privy — Best financial flow** | $2.5k | Core Privy, ≥1 wallet, **one live** flow: transfer / bridge / stablecoin / swap / Earn / onramp. Cards may be mocked | Onramp → session policy → x402 pay **or** swap. This is the B2C track |
| **Privy — Best B2B financial product** | $2.5k | Org wallet + **policies / signers / quorums / intents** + a business workflow | White-label / Starbucks / “branded treasury pocket” — **conflicts with B2C-first** unless the org is “the user’s family of agents” |

Do **not** count on: Arc, 1inch Aqua, Ledger Key Ring, ENS v2, Uniswap, World, Chainlink, Bazantic — unless they fall out of the core demo for free.

Cheap extras if the core is done:

- **ENS v2 Sepolia:** agent gets a subname + permissioned records (MCP, wallet, x402). $4.5k pool. ENSv2 must be **central**.
- **World Selfie Check:** required to **raise** a spend cap. $3.5k. Fits “abuse prevention.”
- **Uniswap stack:** the swap the policy allows. Needs `FEEDBACK.md` + form.
- **Ledger:** device confirm for anything above the session cap. Central, not bolted.
- **Bazantic recipe:** Graph + Uniswap + x402 as a reusable recipe. Continuity-only for one of their tracks.

Hedera **Harness** and **Tokenization** are different products. Do not.

Continuity vs scratch: GroundTruth / AutoToll / SuperJam exist as **prior art and portfolio**, not as a tree on this box. Default **Start Fresh**. If Jonas’s Graph layer is an existing repo, Graph Continuity is a fork — document the diff.

---

## 5. The kitchen-sink problem

`summary.md` currently wants:

```
Telegram Mini App
+ on-ramp
+ swaps
+ bookings
+ white-label Starbucks
+ yield
+ WebMCP
+ session keys
+ x402
+ paid inference
+ Graph copy-trade
+ streaming ads
```

Judges watch a **2–4 min video**. One sentence has to survive:

> I fund a pocket, I set a mandate, the agent spends inside it without asking, and cannot spend outside it even if you jailbreak the prompt.

Everything else is a **skill** behind that sentence.

### Cut list (for nine days)

| Keep in the demo | Park (README / stretch) |
|---|---|
| Privy embedded wallet + **policy** (per-tx, daily, allowlist) | White-label / Starbucks |
| One on-ramp **or** a prefunded faucet for judges | Yield on balances |
| x402 pay of a **service we host on Hedera** | Superfluid / Streamflow ads tab |
| Graph live query that **changes the spend** | Full copy-trade marketplace |
| Telegram as **chat + approval cards** | Perfect Mini App polish |
| Kill switch + receipt (“why it spent”) | WebMCP (stretch if Claude can call our MCP) |
| Session / delegated signing so the model never sees a key | Bookings / Claude commerce cart (unless that IS the one job) |

---

## 6. Three product options (pick one primary)

The **surface** is no longer a question: web workspace + agent Chrome. See [`ARCHITECTURE.md`](./ARCHITECTURE.md). These options are still about **what the 90s demo spends on**.

### A — Allowance wallet (recommended)

**User:** someone who opens a web workspace (Telegram is how they got the link).

**Job:** give the agent a **prepaid pocket** and a **browser you can watch**.

**Demo (90s):**

1. Telegram deep link → web app. Privy wallet exists. Policy: $2/tx, $10/day, allowlisted x402 payTo + one router.
2. “What’s the cheapest USDC borrow, then pay for the packed answer.”
3. Graph (standardized lending subgraphs) answers. Agent **opens our Hedera x402 URL in the shared Chrome**. You watch the 402 unlock. Host pays under policy.
4. You try “send the rest to 0xevil” → **policy reject** in the wallet pane, not a model refusal. You can grab the page / freeze.
5. Receipt: Graph snapshot + HCS / tx hash + “policy #3 allowed it.”

**Why this wins prizes:** Hedera wants a hosted x402 service + a consumer. Graph wants load-bearing live data. Privy wants a real financial flow + policies (even on the B2C track, policies are how you don’t look like MetaMask-with-a-chat).

**Why this is what X wants:** authorize once, spend many times, keys never in the prompt.

### B — Graph copy-trade copilot

Jonas’s layer is the product. Wallet is the execution sidecar.

**Demo:** “Who is winning on this market / DEX? Copy their last three trades, $2 each.”

**Risk:** becomes a trading-bot demo. Hedera x402 is bolted. Privy is bolted. Crowded (Bitquery MCP, graph-polymarket-mcp, Qwerti, every DeFAI widget).

Only pick this if Jonas already has a working query layer and we are wrapping it.

### C — Claude commerce checkout

Wallet **is** the missing checkout in [anthropics/commerce-agents](https://github.com/anthropics/commerce-agents). Shopping agent fills a cart; we settle USDC / x402; merchant agent never charges.

**Risk:** bookings need fake catalogs or real APIs we don’t have. Hedera service is artificial. Graph is bolted unless the catalog is on-chain.

Use Claude’s **patterns** (stage / apply, server IDs, presentation tools) inside A. Do not make C the whole hackathon unless the team is actually shipping a storefront.

---

## 7. Architecture sketch (if we pick A)

```
Human
  Telegram bot (chat + inline approve / freeze)
  optional: Mini App for policy editor + balances
  optional: WebMCP / MCP so Claude Code drives the SAME wallet

Policy (enforced OUTSIDE the model)
  Privy policy engine + stateful aggregation (rolling USDC cap)
  allowlist: tokens, contracts, x402 payTos, Hedera account ids
  per-tx maxValue on x402 client
  kill switch = revoke authorization key / disconnect session

Custody
  User: Privy embedded (smart wallet if we lift humanhook)
  Agent: delegated signer OR funded sub-wallet
  Model: never sees a key (Privy Agent CLI pattern: ephemeral signing keys)

Eyes
  The Graph Subgraph MCP + (stretch) Agent0 ERC-8004 subgraphs
  Standardized schema so one query spans protocols — Graph composable track

Hands
  x402 client (Privy createX402Client / @x402/hedera)
  one Uniswap or 1inch swap tool, policy-gated
  our hosted service: "wallet brain" — packed Graph answer / inference, x402 on Hedera via Blocky402

Receipts
  every spend: intent, policy id, graph snapshot, tx hash
  stretch: HCS topic as the audit log (Hedera extra points)
```

### Claude Commerce rules we copy into the harness

From [the anatomy post](https://claude.com/blog/the-anatomy-of-effective-commerce-agents):

1. The model **stages**. Policy or a human **applies**.
2. Recipients / product IDs must be **server-issued** this session.
3. Caps on **resulting state**; serialize spends per session (x402 idempotency keys — people are already screaming about double-spend on tool retries: [@jrcrypto_dev, 2 Sep](https://x.com/jrcrypto_dev/status/2095298109035123004)).
4. Third-party content (Graph results, listings) is **fenced**. Never act on a recipient that appeared only inside a blob.
5. UI is tools: `present_quote`, `present_receipt`, `request_approval` — not markdown the Telegram client parses.

### Invok / Harness rules we copy

- **Never expose the approval channel as an agent tool.** Invok’s MCP toolkit deliberately omits `resolvePermission`. Same for freeze / raise-limit.
- Park the turn on a Telegram card (`allow_once` / `allow_session` / `deny` / `deny_stop`). Invok `approval-options.schema.ts`.
- Unattended (cron, “keep buying inference”) uses a **hard $ cap**, not bypass. Invok’s unattended `$5` LLM budget is the right idea applied to USDC.
- Harness `ask_user` in-flow, not a modal. Telegram inline keyboard is the QuestionCard.
- Panic = abort the run **and** stop the side effect (revoke / freeze), not just stop tokens.
- Harness has **no** tool approval matrix on purpose (“a human is watching”). Invalid for a wallet. Copy HITL, add real limits.

---

## 8. What we can steal from this machine

| Piece | Where | Use |
|---|---|---|
| Privy guest → smart wallet → batched `sendCalls` | `humanhook/apps/web/src/lib/keep.tsx` | User wallet, Base Sepolia lessons |
| Server auth of Privy tokens, smart vs signer | `humanhook/.../dish-auth.ts` | API that the agent cannot spoof |
| Telegram bot onboarding | `boter/` | Pairing `t.me/bot?start=`, **not** Mini Apps |
| SuperJam `payX402` quotas / allowlisted hosts | `personal/business/mini-app-host-platform-spec.md` | Product language; was the first cut in June — now it **is** the product |
| Host vs guest | same spec | Telegram Mini App = **guest**. Fine for distribution. Do not try to be Telegram. |
| Invok HITL + capability allowlists | `invok` interaction-registry, gate.ts | Approval bus |
| Invok x402 design (not code) | `invok/.claude/research/x402-crypto-research.md` | Per-session USDC, per-tx, allowlist, keys in TEE |
| Starters | `starters/` | Bun/Effect/Vite **kit**. No auth, no Telegram, chain unwired. Fork only if we want FIELD/01 as the web shell; otherwise too much game/ECS for nine days. |
| GroundTruth / AutoToll | portfolio, **not cloned here** | Story, not a git submodule |
| Harness | archived; product is Invok | Pattern library only |

**Do not** start from the full starters spatial demo or the archived harness binary.

Suggested bootstrap: **new repo**, Bun + Hono (or Effect HttpApi if the team is already in that groove) + Privy + a Telegram bot. Mini App is a thin policy UI on the same API.

---

## 9. Hedera service — the prize-shaped core

Hedera’s track is unusually specific: **you must sell something over x402**, not only pay.

Candidates for **our** gated service (pick one):

1. **Packed Graph answer.** Agent pays $0.01 HBAR/USDC, gets a cross-protocol lending/DEX snapshot the wallet already queried. Qualifies Graph (we used live data) **and** Hedera (we sold it).
2. **Pay-per-call inference** (their own [PoC](https://github.com/hedera-dev/x402-inference-pay-per-request-poc)). Closest to minirouter.sh. Weaker Graph story unless the prompt is grounded in Graph.
3. **Copy-trade signal.** “This wallet’s last 3 swaps, sized to $2.” Graph-heavy, Hedera is the paywall.

Recommend **1**: it is the only one that makes Graph load-bearing **for the payment**, not a sidebar.

Facilitator: [Blocky402](https://blocky402.com/). Client: `@x402/hedera`. Extra points if we log the receipt on **HCS**.

---

## 10. Nine-day cut (only after decisions)

Day 0–1: repo, Privy login, one wallet, one policy, Telegram bot echo.

Day 2: x402 client + **hosted** Hedera service that returns a stub. Pay it once for real.

Day 3: Graph live query wired into that service (Studio API key). Agent decision uses the number.

Day 4: Swap tool behind allowlist. Jailbreak demo (reject).

Day 5: Receipts + freeze. Policy editor in Telegram.

Day 6: On-ramp or documented faucet. Demo script. FEEDBACK.md for anyone we touched.

Day 7–8: Video, README, prize checklists, extras (ERC-8004 / ENS / WebMCP) only if green.

Day 9: Submit. Do not add ads, yield, or white-label.

---

## 11. Open questions (still)

Surface, Telegram Mini App, and “does the agent get a browser?” are **closed**. Left:

1. **One job in the 90s demo?** Packed Graph answer as the 402 body (A), copy-trade (B), or a shopping cart (C)?
2. **Does the page get `window.ethereum`?** Host-pane pay tools only (safer), or a stubbed injected provider so a dapp Connect works in the video?
3. **Custody?** User wallet + delegated signer, or a funded agent sub-wallet?
4. **Chain of record?** Hedera for the 402 we host + Base for the user wallet, or Hedera-only?
5. **Jonas’s Graph layer:** wrap (Continuity) or Subgraph MCP from scratch?
6. **WebMCP in the video?** Our page exposes tools so Claude can drive us, or post-submit?
7. **Name**, and who owns Chrome vs Privy vs Hedera service?

---

## 12. Sources

### Market / wallets
- https://metamask.io/news/what-is-an-agentic-wallet
- https://metamask.io/en-GB/news/introducing-metamask-agent-wallet
- https://www.coinbase.com/en-ca/developer-platform/discover/launches/agentic-wallets
- https://docs.privy.io/wallets/overview/solutions/agent-wallets
- https://privy.io/blog/a-guide-to-building-agentic-apps-on-privy
- https://coincub.com/wallets/guides/how-programmable-wallets-can-limit-autonomous-spending/
- https://beincrypto.com/ai-agents-bring-new-rules-for-crypto-wallets/
- https://developers.binance.com/en/docs/products/agentic-wallet/welcome
- https://www.alchemy.com/overviews/agent-wallets-session-permission-model
- https://news.bitcoin.com/ton-tech-gives-telegram-bots-spending-power-with-new-agentic-wallet-standard/
- https://decrypt.co/374687/moonpays-paybox-crypto-wallet-claude-chatgpt

### X (demand)
- https://x.com/0xblockboy/status/2020639766963016041 — authorize once, x402 many times
- https://x.com/Rifat_EE/status/2070378709304160683 — one bad prompt empties the wallet
- https://x.com/teneo_protocol/status/2032071142232461752 — session key, no pop-ups
- https://x.com/SingItAgent/status/2092277223394857254 — Telegram budget, agent never sees keys
- https://x.com/philip0x/status/2094849773300068359 — three trust vectors
- https://x.com/jrcrypto_dev/status/2095298109035123004 — policy at tx layer, x402 idempotency
- https://x.com/2038277897Zheng/status/2095904282507874400 — x402 / ERC-8004 / why

### x402 / Hedera / Graph
- https://docs.hedera.com/solutions/ai/x402
- https://hedera.com/blog/hedera-and-the-x402-payment-standard/
- https://hedera.com/blog/x402-bounty-on-hedera-winners-announced/
- https://blocky402.com/docs/quickstart/
- https://github.com/hedera-dev/x402-inference-pay-per-request-poc
- https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/
- https://thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0/
- https://thegraph.com/blog/community-builder-queried-defi-lending-protocols-subgraphs-mcp/
- https://minirouter.sh/

### Claude commerce
- https://claude.com/solutions/commerce
- https://claude.com/blog/claude-for-commerce-agents
- https://claude.com/blog/the-anatomy-of-effective-commerce-agents
- https://github.com/anthropics/commerce-agents

### Local prior art
- `ARCHITECTURE.md` (this repo) — web workspace + Bun.WebView browser
- `summary.md`, `prizes.md` (this repo)
- `~/code/humanhook` — Privy smart wallets
- `~/code/invok` — HITL, capability allowlists, x402 research
- `~/code/harness` — archived; `ask_user`, shared-surface HITL
- `~/code/starters` — FIELD/01 kit
- `~/code/boter` — Telegram bot gateway
- `~/code/personal/business/mini-app-host-platform.md` — SuperJam / host vs guest / payX402
