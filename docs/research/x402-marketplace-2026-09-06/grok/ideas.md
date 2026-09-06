> **Raw Grok research, not an accepted plan.** Read the [reviewed synthesis](../deep-research.md) and [corrections](../methods.md) first. Source counts, dates, X access labels and implementation assumptions are not all verified. The current team plan defers remote MCP and retains fixed-price billing.

# Froggy x402 capability marketplace — product, architecture, competition

**Lane:** distinctive product concepts, use-case combinations, marketplace architecture, competition\
**Date:** 2026-09-06\
**Author:** Grok Build (research only; no paid calls, no implementation)\
**Access date for all sources unless noted:** 2026-09-06

## Judgment

Froggy should not try to become another open x402 catalog, another BlockRun MCP, or another AgentCash wallet. Those products already exist, they already sit on Claude Code, and they already settle USDC on Base. A listing count is not demand, and an unpaid 402 is not delivery.

The only product that is both *distinctive* and *hackathon-coherent* is a **curated, dual-entry capability desk**: one policy and receipt system that a human uses through Froggy chat (with a shared browser) and that Claude Code / Hermes uses through remote MCP. Billing that the judges can see should be **Hedera x402 via Blocky402**. Identity and spend controls should be **Privy wallets + policies**, not a local `wallet.json`. The third prize partner should be **The Graph From Scratch AI track**, used as a load-bearing live data source, not as a logo.

That trio is the only combination that is (a) on the official ETHOnline 2026 prize page, (b) eligible under Start from Scratch, and (c) not a superficial wrap of someone else’s catalog. Consuming Exa, BlockRun, CoinGecko, or ElevenLabs as *upstream* is allowed and is **not** a fourth prize selection. Card/Link commerce is optional later, not the marketplace.

The kill question is real: a developer can already `claude mcp add blockrun` or `claude mcp add agentcash` and buy images, search, and inference. Froggy only wins if the demo shows something those two cannot: **a human watching the same session, a Hedera receipt for work that may have executed on Base, and a Privy policy that can refuse the spend.** If the treasury remains bookkeeping rather than a working Hedera-paid path, the Hedera story is cosmetic and should not be submitted.

---

## Native X tools actually available and used

**No native X/Twitter MCP tools were connected in this session.** `search_tool` against railway and workspace tooling returned documentation, session, and infrastructure tools only. There was no `x_keyword_search`, `get_thread`, bookmarks, or similar Grok X API.

**Substitute used:** `web_search` (which sometimes returns full X post bodies plus metrics) and `web_fetch` / page open of `x.com` URLs.

**X conversations inspected (web fetch of original posts; replies are partial because X served a login wall):**

| ID | URL | What was visible | Limitation |
|---|---|---|---|
| X1 | https://x.com/browser_use/status/2085458556388524481 | Founder/product post, 38.2K views, 112 likes, 25 replies, 19 reposts | Replies not fully loaded; “relevant people” only |
| X2 | https://x.com/CoinbaseDev/status/2085463734684959116 | Quote of X1; 3K views, 25 likes, 8 replies | Same login-wall truncation |
| X3 | https://x.com/bc1beat/status/2066564588691472889 | BlockRun founder promotion, 6.2K views, 44 likes, 9 replies | Same; replies are promotional (“bullish”) |

Thread fetches are **partial**. Do not treat engagement as demand. Do not treat founder volume claims as independently verified.

---

## 1. Competitive landscape (what already exists)

### 1.1 Browser Use — shared-browser inspiration, not a marketplace

Browser Use Cloud now sells **browser time as an x402 credit top-up**, not a capability catalog. Docs: USDC on Base, EIP-3009, no ETH for gas, default SDK cap $1.00 per payment, wallet-as-account or top-up of an existing API-key project. Mid-task credit drain **terminates** the task with `INSUFFICIENT_CREDITS`; the worker does not pause for another x402 payment. A 503 path exists where payment is verified but **not settled** if credits cannot be granted. Link/card checkout (2026-09-03) is a **one-time virtual card after human phone approval**; the agent never holds the Link token. Froggy was told not to integrate Link. Take the pattern, not the product: human approval before irreversible spend, shared visual session, prepaid credits rather than unbounded per-call signing.

Canonical: https://docs.browser-use.com/cloud/guides/x402\
Canonical: https://browser-use.com/posts/pay-with-link\
Canonical: https://browser-use.com/posts/x402-launch

X discussion around the launch is mostly promotional. One reply (visible in the CoinbaseDev “relevant people” panel, not a full thread) argued that x402 removes API keys but not CDP-facilitator centralization. Another asked whether the receipt proves the task finished. Those are the right questions for Froggy too.

### 1.2 BlockRun / ClawRouter / blockrun-mcp — the default “just connect it” substitute

BlockRun is already the thing a Claude Code user would install instead of Froggy:

- One `claude mcp add blockrun` command, ~20 `blockrun_*` tools (chat, image, video, music, speech, Exa, search, markets, RPC, Modal sandbox, phone).
- Wallet is a local file under `~/.blockrun/`; USDC on Base or Solana; x402 v2.
- Marketplace lists partner services (Surf, Exa, ElevenLabs, Sora, Seedance, Modal, 0x, Predexon) with **payment going to the partner treasury**.
- Chat billed at provider cost plus a **$0.001/request** fee; media and Live Search carry **5%**.
- Discovery: `GET https://blockrun.ai/.well-known/x402` (a 200 discovery document, not a 402 — this matches the coordinator’s unpaid probe).
- Async: video/image poll routes are **free after create**; docs say video/music timeout is **not charged**.
- XRPL gateway **sunset 2026-08-29** (returns 404). That is a real product retraction, not a rumor.

Canonical: https://blockrun.ai/docs\
Canonical: https://blockrun.ai/marketplace\
Canonical: https://blockrun.ai/docs/x402/endpoints\
Canonical: https://github.com/BlockRunAI/blockrun-mcp

Founder promotion (X3, 2026-06-15) claimed 3M paid x402 txs and 10M LLM calls. That is **founder promotion**, not an inspected ledger. GitHub issues on `blockrun-mcp` are sparse and not product-quality reports. First-party troubleshooting admits `spawn npx ENOENT` PATH failures, RPC timeouts, and that spend-confirmation elicitation **does not work** on Windsurf/Codex/Gemini CLI (those clients proceed without asking).

**Implication:** BlockRun already owns “pay for any model/tool from Claude Code.” Froggy duplicating that catalog is a loss.

### 1.3 AgentCash — generic x402 fetch MCP

AgentCash is a **local wallet + `fetch` tool** that pays any x402 URL. Wallet at `~/.agentcash/wallet.json`. Tools: `get_balance`, `list_accounts`, `discover_api_endpoints`, `check_endpoint_schema`, `fetch`. Browser Use documents AgentCash as a first-class way to buy Browser Use sessions. AgentCash’s own launch post (2026-07-07) claimed 250+ APIs and 250k requests “in the last few weeks,” plus “74 million agentic payments” on x402 — **vendor claims**, not reconciled here.

Canonical: https://agentcash.dev/blog/introducing-agent-cash\
Canonical: https://docs.browser-use.com/cloud/guides/x402-agent-wallets\
Canonical: https://www.npmjs.com/package/agentcash (npm page was bot-challenged on fetch; tool list also appears in search-index)

**Implication:** If Froggy’s remote MCP is “pass a URL, we pay the 402,” AgentCash already is that, with less policy and no Hedera. Froggy’s MCP must return a **named capability + artifact + receipt**, not a generic fetch.

### 1.4 x402 Bazaar and other catalogs — inverted marketplaces

Coinbase Bazaar is a public CDP Facilitator index. Search is unauthenticated. Listing is created by the **first settled payment** through CDP, not by an application form. Quality ranking uses 30-day unique payers and call volume. Curation is a separate editorial tier with availability probes. Resources with 30 days of no settlement drop out.

Canonical: https://docs.cdp.coinbase.com/x402/buyer/discover-services\
Canonical: https://docs.cdp.coinbase.com/x402/seller/get-discovered

Independent snapshot (cp0x, 2026-07-11 catalog): 25,443 resources; **10,028** from one spam domain; ~262k paid calls / ~$26k confirmed 30-day volume on that facilitator; top 10 domains ~70% of calls; **58% of unique-payer metric attributed to wallet farms**; ~10 seller domains per real buyer. Median active price $0.01. `exact` is 99.96% of listings; `upto` is 11 listings. **Hypothesis supported by this snapshot, not by Froggy’s own crawl:** open catalogs are supply-side spam machines.

Canonical: https://cp0x.com/blog/wheres-the-money-in-x402-an-analysis-of-coinbases-bazaar-catalog

gold-402 (hand-curated, 526 entries as of page fetch): 67–79% of free catalogs failed a live-402 probe in July 2026; a **16-service paid-delivery sample** (2026-07-30) found 8 delivered as advertised, 0 took money and returned nothing, $0.054 spent. Authors explicitly say that sample is too small to treat as a finding. The direction still matters: **friction is before payment (dead front doors), not after.**

Canonical: https://github.com/Haustorium12/gold-402

Other substitutes named by x402-foundation README: x402scan, Agentic.Market, Pay.sh, Ampersend discover, x402-list.com. Bazantic (ETHOnline sponsor, $3k) deploys x402/MPP gateways + MCP + “Recipes.” Selecting Bazantic as a prize partner is a fourth sponsor and is out of scope; using it as an upstream is optional and not a prize claim.

### 1.5 Hedera-native x402 work already shipped (testnet)

Hedera’s own prize copy says x402 on Hedera is “still short of one thing: actual services you can pay for.” That is an official admission, not a slight. Prior bounty winners (announced 2026-08-31, testnet) already occupy pieces of the design space Froggy might reinvent:

| Project | What it actually did | Why it matters |
|---|---|---|
| **Pinout** | x402 payment → metered session; burn by second/token; **on-chain refund of unused remainder**; HCS checkpoints + HIP-991 settlement; Pinout Compute rents GPU/CPU by the second | Async + refund is a solved *pattern* on Hedera testnet |
| **Tally** | First non-EVM `upto` scheme; ceiling signed off-chain; settle actual usage; HCS-auditable bills | Quote/cap/settle without paying the ceiling |
| **Xorv** | Marketplace for **idle Claude/Codex/Grok subscription quota**, paid per job in USDC over x402; HTS + HCS | Resale of upstream keys — legal/ToS risk, not a Froggy default |
| **Qisma** | `exact-multi`: one Hedera CryptoTransfer splits to aggregator + three upstreams atomically | Native Hedera multi-party split with **no escrow contract** |

Canonical: https://hedera.com/blog/x402-bounty-on-hedera-winners-announced/\
Canonical: https://hedera.com/blog/hedera-and-the-x402-payment-standard/\
Canonical: https://ethglobal.com/events/ethonline2026/prizes/hedera

---

## 2. ETHOnline 2026 sponsor verification (official pages only)

**Official prize index:** https://ethglobal.com/events/ethonline2026/prizes\
**Accessed:** 2026-09-06, full page.

Partners on that page (11): The Graph $15k, Hedera $15k, Arc $10k, World $7k, 1inch $7k, ENS $5k, Uniswap Foundation $5k, Ledger $5k, Privy $5k, Chainlink $3k, Bazantic $3k.

**Three-partner rule:** ETHGlobal beginner workshops (Lisbon 2026, New York 2026, Cannes 2026) state you may **select at most three partner companies**; selecting a company qualifies you for that company’s prizes on your track. You may *use* other stacks without selecting them. Continuity vs Start from Scratch is exclusive. Source: workshop transcripts (YouTube), not the ETHOnline rules HTML (that page was not successfully fetched as a standalone document). Treat as **high-confidence operational practice**, not as a screenshot of `ethglobal.com/rules`.

**Start from Scratch (provided constraint):** Graph AI From Scratch text: net-new during the hackathon; “Open-source starter kits are fine; **project-specific prior code is not.**” Hedera Agentic Payments is **not** labeled Continuity (Continuity is a separate $1k Hedera prize). Privy has **no Continuity prize** on this event.

### Recommended three selections (and why not the others)

| Slot | Partner / prize | Why it is load-bearing | Kill if |
|---|---|---|---|
| 1 | **Hedera — AI & Agentic Payments** ($6k, up to 3 × $2k) | Must host a **live x402-gated service on Hedera testnet/mainnet settled through Blocky402**, and a platform/agent that consumes it with one real paid request. Extra points: metering, directory, ERC-8004/HCS-14, HCS audit, HTS fees, scheduled/streamed payments. | The only Hedera tx is a bookkeeping top-up, or Blocky402 is not in the path. |
| 2 | **Privy — Best B2B financial product** ($2.5k) *or* **Best financial flow** ($2.5k) | B2B fits Froggy’s org wallet, budgets, allowlists, approvals. Requires: Privy as core, at least one Privy wallet, a **business workflow**, and **at least one Privy control** (policies, signers, key quorums, or intents). Financial-flow alternative: funding/spending that hides chains. Privy Cards may be **mocked** and do **not** count as the required live integration. | Privy is only an invisible signer with no policy/approval UI. |
| 3 | **The Graph — Best AI Tooling or AI Use Case (From Scratch)** ($5k) | Load-bearing Graph: live Subgraph / Subgraph MCP / Substreams from a Graph provider (Studio or The Graph Market). Mocked/local/static data **does not qualify**. Tooling must be reusable; an app must **reason** on the data, not print a raw query. x402 pay-per-query is explicitly in-scope. | Graph is Froggy’s existing 0.05 HBAR oracle only, or a static JSON fixture. |

**Do not select as prize partners (using them as upstream is fine):**

- **Ledger:** Key Ring CLI must be central; hardware in a remote hackathon is a schedule risk.
- **World AgentKit:** Continuity-only.
- **Bazantic:** would be a fourth partner; Recipe-vs-raw-API A/B is a different product.
- **Arc / Circle Agent Stack:** extra chain and extra SDK for a 12-day window.
- **1inch Aqua, Uniswap, ENS, Chainlink confidential workflows:** orthogonal to a capability desk unless they become the *point* of the demo.

No odds are offered. Continuity eligibility for prior Froggy code is **not assumed**; Start from Scratch implies a **net-new public repo** for the marketplace, even if the founder’s existing prototype informs it.

---

## 3. Three ways to buy a capability (compare, then pick one default)

| Path | What the user pays | What Froggy pays upstream | When it is honest | When it is a lie |
|---|---|---|---|---|
| **A. Native Hedera service** | HBAR or HTS USDC on Hedera, Blocky402 facilitator, 402 from a Froggy or partner host on Hedera | Nothing, or Hedera-native compute/data | Graph-like oracle, HCS receipt, Pinout-style meter, Tally `upto` | Calling it “Hedera” while the 402 is Base USDC |
| **B. Hedera-paid wrapper around Base providers** | Hedera 402 to Froggy’s seller | Froggy server pays Base USDC (x402) or an API key | User never sees Base; Hedera receipt is the customer bill; wrapper discloses markup and upstream | Treasury “top-up” that does not move value; user billed on Hedera for a call that never settled upstream |
| **C. Server API-key upstream** | Hedera 402 to Froggy | Froggy’s Exa/Graph Studio/OpenAI key | Cheapest, most reliable upstream; still a paid Froggy service | Pretending the user paid Exa/BlockRun on-chain |

**Recommendation:** default **B for commodity capabilities** (image, search, TTS) and **A for the Graph-shaped demo object** (a Froggy-hosted, Hedera-gated data/result service that *uses* The Graph live). C is an implementation detail of B, not a third user-visible rail.

Hedera’s Qisma pattern (atomic CryptoTransfer to aggregator + upstreams) is the native-A upgrade if multiple Hedera sellers exist. They do not, at demo quality, today.

Current Froggy treasury top-up is **bookkeeping, not a bridge**. Until a Hedera 402 actually funds or authorizes the Base payer, path B is a slide.

---

## 4. Quote / reserve / execute / settle / result

x402 v2 already names the pieces. Froggy should not invent a fourth scheme.

| Stage | Protocol object | Who must see it | Failure |
|---|---|---|---|
| **Quote** | HTTP 402 `accepts[]` (`scheme`, `network`, `amount`, `asset`, `payTo`, timeout, extra) | Chat UI + MCP tool descriptor | Stale hardcoded prices (BlockRun docs: do not hard-code; read the 402) |
| **Reserve / cap** | `upto` (authorize max, settle actual); `batch-settlement` (deposit + vouchers); Pinout session credits | Policy engine (Privy + Froggy allowlist) | Paying `exact` for metered work |
| **Execute** | Upstream POST/GET; async job id | Shared browser or artifact pane | Mid-job credit drain (Browser Use terminates) |
| **Settle** | Facilitator `/settle`; Hedera: Blocky402; Base: CDP | Receipt with tx / HashScan link | Browser Use 503: verified but **not settled** if credit grant fails — copy this fail-closed behavior |
| **Result** | Bytes + schema + `X-Payment-Response` / receipt | MCP artifact + chat | Paid 200 with empty/wrong body — gold-402’s 16-sample found 0 theft but 8/16 mismatch vs advertised |

**Payment flows** (https://docs.x402.org/schemes/overview): `authorization` (verify, serve, then settle — default), `upfront` (`exact` only), `escrow` (deposit then claim). `upto` and `batch-settlement` are authorization-only.

**Refunds:** not a first-class x402 `exact` feature. They appear as (1) **do not settle** on handler failure (Browser Use 503; BlockRun video timeout; some gold-402 listings skip settle on 4xx), (2) **cooperative refund** of idle `batch-settlement` channels, (3) **Pinout unused-credit refund** on Hedera, (4) Tally/HIP-991 bonded disputes. Froggy should implement (1) on day one and (3) if the Hedera service is metered.

**Resale terms:** Xorv publishes a marketplace for idle AI subscription quota. That is a **ToS and fraud surface**. Froggy should not resell Claude/Codex/Grok seats. Wrapping Exa/BlockRun as Froggy’s own Hedera SKU is **principal resale**: Froggy is the merchant of record, must disclose it, and must eat upstream failure.

**Provider identity:** Bazaar `payTo` is a wallet, not a legal entity. ERC-8004 / HCS-14 are Hedera extra-credit, not a trust oracle. **Do not let the agent pay arbitrary 402 URLs.** Curated directory + allowlist + per-capability schema. Uncontrolled paid requests are how Bazaar spam becomes a drained wallet.

**Async:** BlockRun already has create/poll with settlement on completion for video. Froggy’s gap (stated, not re-tested) is async lifecycle. Smallest version: job id, status, artifact URL, receipt attached only on success.

---

## 5. Why a user would not just connect BlockRun or AgentCash

This is the product question. Counterarguments included.

| Claimed Froggy edge | Is it real today? | Counterargument | Test that kills it |
|---|---|---|---|
| **Shared Chrome** | Stated as existing | Browser Use *is* a shared/hosted browser, paid with x402 or Link | If the demo never shows the human and agent looking at the same page while a paid call runs, this edge is unused |
| **Cross-chain payment orchestration** | Hedera payer + Base payer exist; **top-up is bookkeeping** | AgentCash/BlockRun already multi-rail Base+Solana; user who holds USDC on Base does not need Hedera | If the user must pre-fund Base USDC anyway, Hedera is a prize sticker |
| **Accountable execution** | Budgets, allowlists, approvals, receipts stated | Privy policies exist for exactly this; BlockRun has `BLOCKRUN_BUDGET_LIMIT` and optional elicitation | If MCP clients spend without a visible receipt/artifact, AgentCash is simpler |
| **Curated directory** | Stated | gold-402 and CDP curated tier already curate; BlockRun marketplace is a finite partner list | If Froggy’s directory is Bazaar search, it inherits spam |
| **Dual entry (chat + remote MCP)** | Remote MCP still needs work | BlockRun MCP *is* the Claude Code entry; AgentCash *is* the generic entry | If remote MCP is late or stdio-only, Claude Code users will install BlockRun |
| **First user need not understand chains** | Privy embedded wallets can hide them | Coinbase Agentic Wallet already funds with Apple Pay | If onboarding still says “send HBAR to testnet,” this fails |

**Honest differentiation (hypothesis):** Froggy is the **policy and evidence plane** between a person and many paid tools, including tools their coding agent is not allowed to call raw. BlockRun optimizes for an autonomous agent with a hot wallet. AgentCash optimizes for “pay this URL.” Browser Use optimizes for “drive a site.” None of them combine **Hedera settlement + Privy org policy + human-visible session + Graph-backed fact** in one receipt.

If that combination cannot be demoed in five minutes, ship a thinner product or pick different prizes.

---

## 6. End-to-end scenarios (hypotheses)

These are **designed stories**, not observed user behavior. Costs are order-of-magnitude from unpaid 402s and public price sheets, not settled invoices. Coordinator’s unpaid 402s (Exa 0.007 USDC Base, BlockRun image 0.053501, short inference 0.002, ElevenLabs 0.002, CoinGecko 0.01, Froggy Graph oracle 0.05 HBAR testnet) are **price challenges only**.

Human boundary legend: **auto** = under budget + allowlisted; **ask** = over threshold or new vendor; **watch** = shared browser must stay visible.

### Chat entry (person talks to Froggy)

**S1. Brief → image artifact**\
Trigger: “Make a 1:1 icon of a frog at a kiosk.”\
Steps: map to curated `image.generate`; quote 402; Privy policy auto if ≤ $0.10; Hedera wrapper pays; store PNG.\
Paid: image SKU (upstream may be BlockRun Nano Banana or API key).\
Artifact: PNG + HashScan receipt.\
Cost model: exact, ~$0.02–0.10 user-facing.\
Human: auto; watch optional.\
Failure: upstream 5xx → do not settle Hedera / refund session.\
Value: image without an OpenAI account.

**S2. “What did this token do last week?” (Graph-load-bearing)**\
Trigger: paste a token address.\
Steps: Subgraph MCP or Studio key via Froggy’s Hedera-gated Graph tool; reason over transfers; show Explorer in shared Chrome.\
Paid: Graph x402 ($0.01/query on Base per Graph docs/forum) *or* Froggy Hedera SKU that performs the Graph query server-side.\
Artifact: markdown brief + GraphQL + subgraph id.\
Cost: few queries, cents.\
Human: watch (browser on the subgraph).\
Failure: wrong subgraph (The Graph forum: 15k unlabeled doors) → ask human to confirm subgraph.\
Value: on-chain fact, not a hallucinated price.

**S3. Voice note from a research brief**\
Trigger: “Read me a 30-second summary of S2.”\
Steps: S2 result → TTS SKU.\
Paid: speech (~$0.002–0.05/1k chars public sheets).\
Artifact: audio file.\
Human: auto.\
Failure: empty text → do not call TTS.

**S4. Allowlist refusal**\
Trigger: agent proposes an unknown 402 URL from Bazaar search.\
Steps: policy DENY; show why.\
Paid: none.\
Artifact: refusal receipt.\
Human: ask to add vendor.\
Failure: if this is missing, AgentCash is safer than Froggy.

**S5. Async video (later, not v1)**\
Trigger: “5s clip of the icon waving.”\
Steps: create job, poll, settle on completion.\
Paid: $0.30–0.50 class (BlockRun Sora/Seedance sheets).\
Human: ask (amount).\
Failure: timeout not charged (copy BlockRun).\
**Cut from smallest iteration.**

**S6. Shared-browser confirmation of a paid page**\
Trigger: “Is this NFT listed?”\
Steps: open marketplace in shared Chrome; if the page is paywalled, Froggy pays a search/scrape SKU; human sees the page.\
Paid: search/scrape cents.\
Human: watch.\
Failure: scrape ≠ live page; human catches it because they can see.

**S7. Budget exhausted**\
Trigger: tenth image in a session.\
Steps: Privy/Froggy budget DENY; show remaining + top-up CTA (fiat or testnet faucet, **not** a fake bridge).\
Paid: none further.\
Human: ask.

### MCP entry (Claude Code / Hermes / other personal agent)

**S8. Claude Code: README hero image**\
Trigger: `Use Froggy to generate a hero image for this README.`\
Steps: remote MCP `froggy.image_generate`; same policy as S1; artifact written to repo.\
Paid: same image SKU.\
Artifact: file path + receipt JSON.\
Human: auto under cap; otherwise elicitation (note: many MCP clients **ignore elicitation** — BlockRun already hit this).\
Failure: if Froggy MCP is stdio-only or unauthenticated, developers will use BlockRun.

**S9. Hermes: token holders via Graph**\
Trigger: agent needs holder distribution.\
Steps: `froggy.graph_query` with allowlisted subgraph; Hedera bill; result as JSON resource.\
Paid: Graph path.\
Human: auto.\
Value: coding agent gets chain data without a Studio key in `.env`.

**S10. Claude Code: Exa-class research, Froggy as merchant**\
Trigger: “Find three primary sources on x402 batch-settlement.”\
Steps: Froggy search SKU (upstream Exa or BlockRun Exa); return citations + snippets.\
Paid: ~$0.007–0.011 class.\
Human: auto.\
Failure: paid empty results — settle $0.

**S11. Multi-step recipe (one policy envelope)**\
Trigger: “One-pager: price, holders, icon.”\
Steps: S2 + S1 + compose PDF/markdown.\
Paid: two SKUs, one Hedera session or two exact payments.\
Human: ask if sum > $0.25.\
Failure: partial — deliver what settled, refund the failed leg (Pinout/Tally pattern).

**S12. Quote then cancel**\
Trigger: MCP `froggy.quote` then user aborts.\
Steps: no settle.\
Paid: $0.\
Human: none.\
Value: AgentCash `check_endpoint_schema` equivalent, with policy.

**S13. Metered compute (hypothesis, not v1)**\
Trigger: “Run this Python on a sandbox for 20s.”\
Steps: `upto` or Pinout-like session; Hedera reserve; exec; refund unused.\
Paid: BlockRun Modal create $0.011 / exec $0.002 **or** Pinout Compute.\
Human: ask.\
**Cut from smallest iteration** unless Hedera extra-credit metering is the demo’s point.

**S14. Org policy, two humans**\
Trigger: intern’s agent requests $1 of image gen.\
Steps: Privy policy: intern wallet capped $0.20/day; quorum or owner approval.\
Paid: only after approve.\
Human: ask (owner).\
This is the **Privy B2B** story.

**S15. Card checkout later (optional, not the marketplace)**\
Trigger: buy a domain or a physical SKU.\
Steps: shared browser + existing MetaMask Card on Linea, or mocked Privy Card.\
Paid: card rail.\
Human: watch + approve.\
**Out of v1.** Official Privy note: live Cards need guided onboarding; mock is allowed but **cannot** be the required Privy integration.

---

## 7. Three demo stories (Hedera + Privy + Graph, no extra prize sponsors)

Each story is a **hypothesis** for a ≤5 minute video. Kill tests are included.

### Demo A — “One receipt, two eyes” (recommended)

A founder asks Froggy chat: “Summarize last week’s large transfers for [token] and make a simple explainer card.” Shared Chrome shows The Graph Explorer / subgraph playground. Froggy’s **Hedera x402 service** (Blocky402) is what the user pays. Upstream, Froggy queries a **live Graph Network subgraph** (Studio key or Graph x402 — consuming Graph x402 is not a fourth sponsor). Privy policy auto-allows ≤ $0.15. Chat returns: markdown, PNG card, HashScan link, subgraph id.

- Hedera: live gated service + consuming platform (qualification).
- Graph: live data, reasoned over, From Scratch repo.
- Privy: wallet + policy (amount cap + allowlisted `payTo`).

**Kill tests:** (1) subgraph is mocked; (2) Hedera tx is unrelated to the query; (3) no Privy policy object, only a raw key; (4) video never shows the shared browser; (5) repo is the old Froggy prototype (Start Fresh violation).

### Demo B — “Claude Code uses the same desk”

Same capability as A, invoked from Claude Code via **remote MCP** `froggy.capability_run`. Claude Code never sees a Base key or a Graph Studio key. Artifact lands in the repo. Receipt is identical format to chat.

**Kill tests:** (1) MCP is local stdio only and not the same policy engine; (2) Claude Code could have called BlockRun Graph-less and the demo cannot say why it did not; (3) elicitation unsupported so spend is silent — must still enforce server-side budget.

### Demo C — “Cap, meter, refund” (Hedera extra points)

A short inference or sandbox job: user authorizes **upto** N HBAR. Job runs 4 of 10 reserved seconds. Unused remainder refunded; HCS topic shows burn checkpoints (Pinout-like). Privy policy is the ceiling. Graph is used for a tiny live input (e.g. a protocol TVL figure that seeds the job) so the third sponsor stays load-bearing.

**Kill tests:** (1) refund is a database flag with no Hedera tx; (2) Graph is bolted on (“also we queried a subgraph”) without affecting the artifact; (3) metering is fake `sleep`.

**Do not demo:** Link, MetaMask Card, Bazaar search of 25k endpoints, Sora, phone calls, Xorv-style key resale.

---

## 8. Contrary evidence and at least five negative findings

1. **Open discovery is mostly dead or gamed.** gold-402: 67–79% of free catalogs failed live 402 probes (July 2026). cp0x: 39% of Bazaar was one spam domain; 58% of unique payers attributed to farms. **Do not browse Bazaar at runtime.**

2. **The Graph’s own x402 rail has near-zero agent volume.** Forum post 2026-07-14 (community, with on-chain tracker claim): **$2.22 / 222 payments / 29 agents** versus tens of millions of EIP-3009 settlements on Base. Blockers named: awareness, subgraph discovery, per-call settlement without refund. **Selecting Graph as a prize does not mean agents currently pay Graph.**

3. **Browser Use x402 is a credit faucet with a sharp edge.** Mid-task drain kills the task; it does not re-quote. Continuous work wants streaming/batch settlement (also noted in an X reply from Superfluid, promotional).

4. **BlockRun MCP is operationally fragile on real clients.** First-party docs: PATH/`npx` failures, elicitation skipped on several hosts, RPC timeouts. Installing “the competitor” is not free of pain — but it is one command, and Froggy remote MCP is unfinished.

5. **Paid delivery is rarer than 402s.** gold-402 paid sample (n=16, one day): half the live front doors did not match advertised delivery. Coordinator’s unpaid 402s are **not** delivery proofs. **Do not claim a SKU works until a settled response is inspected.**

6. **Vendor volume claims disagree by orders of magnitude.** AgentCash “74 million agentic payments”; x402 Foundation press “75 million / $24M / 30 days”; cp0x Bazaar ~$26k/30d on CDP catalog economics; Chainalysis notes meme-coin contamination of late-2025 x402 traffic (Concordium article citing Chainalysis). **Treat macro volume as untrusted.**

7. **Hedera officially says the missing piece is services, not another wallet.** Building a payer without a Hedera-gated service fails the $6k qualification.

8. **XRPL BlockRun gateway sunset** (2026-08-29) is a reminder that extra rails die. Do not add Solana/XRPL/Arc for the hackathon.

9. **Xorv-style resale of frontier-model subscriptions** is an attractive marketplace idea and a likely ToS violation. Not a Froggy SKU.

---

## 9. Ranked recommendations

1. **Submit Start from Scratch** with a **new public repo**. Do not extend the existing Froggy tree if Graph Start Fresh forbids project-specific prior code. Starter kits (Hedera scaffold, Privy examples, Subgraph MCP) are fine.

2. **Select Hedera, Privy, The Graph.** Use BlockRun/Exa/CoinGecko as unselected upstreams.

3. **Ship one Hedera-gated service** that is the merchant of record: e.g. `POST /v1/capabilities/graph-brief` returning a reasoned brief + subgraph provenance, 402 on Hedera, Blocky402, HashScan receipt. Optionally wrap one image SKU the same way.

4. **Privy policy as the product, not the wallet.** Amount cap, allowlisted `payTo`/capability ids, default DENY. Show the policy in the demo. B2B framing: “agent spend desk for a wallet the org controls.”

5. **Remote MCP exposes named tools** (`graph_brief`, `image_generate`, `quote`, `receipts`), never `fetch(url)`. Same policy engine as chat.

6. **Fail closed:** no settle on upstream error; no arbitrary 402 URLs; no fake bridge.

7. **Copy Browser Use’s 503-not-settled and BlockRun’s async-not-charged behaviors.**

8. **Cut:** Link, cards, Bazaar search, video, phone, Modal/Pinout compute unless Demo C is chosen, extra chains, ERC-8004 unless time remains after the paid path works.

---

## 10. Smallest compelling next iteration — and what to cut

**Keep (hackathon vertical slice):**

- Net-new repo, Start from Scratch.
- Privy embedded wallet + one policy (max USD-equivalent + capability allowlist).
- Hedera testnet seller: one POST capability, Blocky402, exact scheme first.
- That capability **must** call a live Graph subgraph and return a reasoned artifact (not raw JSON dump).
- Chat path + one remote MCP tool hitting the same executor.
- Receipt object: amount, network, tx, capability id, subgraph id, artifact hash.
- Shared browser: show the subgraph or the artifact; optional, but it is the only visual differentiator.

**Cut:**

- General POST-to-any-URL purchase tools.
- Runtime Bazaar/Agentic.Market search.
- Bridging / treasury-as-bridge.
- Video, music, phone, DEX swaps, prediction markets.
- Multi-scheme (`upto`, batch-settlement) until exact+fail-closed works.
- Fourth sponsor integrations (Ledger Key Ring, World AgentKit, Bazantic Recipes, Arc Agent Stack).
- Continuity track (wrong prize set; Privy would disappear).

**If time remains after the slice is paid end-to-end:** add image SKU as Hedera wrapper (path B), then `upto` refund on a short job (Demo C).

---

## 11. Remaining gaps (unresolved, high impact)

1. **Is Start from Scratch compatible with any existing Froggy code at all?** Graph’s “project-specific prior code is not” is strict. Unresolved without ETHGlobal written rules + a judge FAQ.

2. **Can Blocky402 settle the exact Hedera scheme Froggy already uses?** Official requirement; not re-tested here.

3. **Does The Graph Gateway x402 still charge $0.01/query on Base, and can a Hedera wrapper legally/technically resell that?** Docs page fetch returned a near-empty body; forum is 2026-07-14.

4. **Remote MCP auth:** how a Claude Code process proves it is the Privy user without copying a hot key. Unresolved; BlockRun’s answer is a local key file — Froggy should not copy that if Privy is the prize.

5. **Elicitation gaps:** if Claude Code remote MCP cannot prompt, server-side DENY is the only control. Unverified on Froggy.

6. **Paid delivery** of Exa, BlockRun image/TTS/inference, CoinGecko: still unpaid 402s only.

7. **Resale/ToS** of wrapped OpenAI/ElevenLabs/Exa via a Hedera SKU — legal review, not a research finding.

8. **Native X tools** were unavailable; X user sentiment is under-sampled.

---

## 12. Source ledger

See `ideas-sources.json` for machine-readable records. Human summary:

| ID | Type | Role |
|---|---|---|
| S01–S04 | ETHOnline official prize pages | Sponsor facts |
| S05–S07 | Browser Use docs/posts | Shared browser + x402 + Link (inspiration only) |
| S08–S11 | BlockRun docs/GitHub | Primary substitute |
| S12–S14 | AgentCash + Browser Use agent-wallets | Generic x402 MCP |
| S15–S17 | CDP Bazaar docs + cp0x + gold-402 | Discovery quality / negative |
| S18–S20 | Hedera blogs + prize extra points | Native services, Blocky402, winners |
| S21–S22 | x402 scheme docs | exact / upto / batch-settlement |
| S23 | Privy policies | Required control surface |
| S24–S25 | Graph x402 docs (thin fetch) + forum | Third sponsor reality check |
| S26 | Bazantic prize page | Substitute; do not select |
| S27–S29 | X posts (partial) | Promotion + one trust critique |
| S30 | ETHGlobal workshop transcripts | 3-partner / track exclusivity |

---

## 13. Query / method log

**Wave 1 queries**

- ETHOnline 2026 hackathon sponsors Hedera Privy x402
- site:ethglobal.com ETHOnline 2026 Privy / Graph / Hedera / Bazantic prizes
- x402 protocol Bazaar discovery catalog Coinbase 2025 2026
- Browser Use Link agent payments x402 2026
- BlockRun MCP ClawRouter x402 agent marketplace 2026
- AgentCash agent wallets x402 2026
- ETHOnline 2026 three prize partners selection limit Start from Scratch Continuity

**Wave 2 queries**

- x402 refunds async jobs quote reserve execute settle scheme upto batch-settlement spec
- BlockRun MCP Claude Code reviews complaints 2026
- The Graph x402 pay per query Subgraph Gateway USDC site:thegraph.com
- site:ethglobal.com ETHOnline 2026 Bazantic prizes recipes x402

**Primary pages fetched (full web page unless noted)**

- https://ethglobal.com/events/ethonline2026/prizes (and /hedera, /privy, /the-graph, /bazantic)
- https://docs.browser-use.com/cloud/guides/x402
- https://docs.browser-use.com/cloud/guides/x402-agent-wallets
- https://browser-use.com/posts/pay-with-link
- https://browser-use.com/posts/x402-launch
- https://blockrun.ai/docs
- https://blockrun.ai/marketplace
- https://blockrun.ai/docs/x402/endpoints
- https://agentcash.dev/blog/introducing-agent-cash
- https://docs.cdp.coinbase.com/x402/buyer/discover-services
- https://docs.cdp.coinbase.com/x402/seller/get-discovered
- https://cp0x.com/blog/wheres-the-money-in-x402-an-analysis-of-coinbases-bazaar-catalog
- https://github.com/Haustorium12/gold-402
- https://hedera.com/blog/hedera-and-the-x402-payment-standard/
- https://hedera.com/blog/x402-bounty-on-hedera-winners-announced/
- https://docs.x402.org/schemes/overview
- https://docs.privy.io/controls/policies
- https://forum.thegraph.com/t/whats-actually-blocking-x402-adoption-on-the-graph-awareness-discovery-and-one-round-trip-payments/7009
- https://thegraph.com/docs/en/subgraphs/tooling/x402-payments/ (**near-empty body on fetch**; claims taken from search-index + forum)
- https://www.npmjs.com/package/agentcash (**bot wall**)
- https://x.com/browser_use/status/2085458556388524481
- https://x.com/CoinbaseDev/status/2085463734684959116
- https://x.com/bc1beat/status/2066564588691472889

**MCP tool search:** `twitter X search thread bookmarks`; `xai grok twitter x-search get_thread bookmarks`; `workspace tooling x twitter bookmarks search` — **no native X tools found.**

**Stopping reason:** Core claims (who the substitutes are, what ETHOnline actually pays for, why open catalogs fail, what Hedera/Privy/Graph require, and why BlockRun/AgentCash are the default) are backed by primary docs plus independent negative analyses. Further queries repeated the same prize pages, the same BlockRun marketing, and the same Bazaar-spam thesis. Paid delivery remains untested by design. Native X conversation depth is exhausted given login-walled fetches.

**Not done (by instruction):** paid x402 calls, posting, messaging, provisioning, package installs, application-code edits, spawning other agents, reading credentials.
