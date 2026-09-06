> **Raw Grok research, not an accepted plan.** Read the [reviewed synthesis](../deep-research.md) and [corrections](../methods.md) first. Source counts, dates, X access labels and implementation assumptions are not all verified. The current team plan defers remote MCP and retains fixed-price billing.

# Demand, workarounds, and dissatisfaction: x402, paid MCP, agent wallets

**Lane:** real user/developer demand, not provider catalog.\
**Date of research:** 2026-09-06.\
**Authoring role:** researcher only. No paid calls, no product changes.

## Judgment

The job people actually have is not “buy an x402 service.” It is “make this agent finish the task.” Search, images, inference, voice, and data are asked for constantly. Almost all of that demand is already absorbed by **API keys, subscriptions, and bundled model credits**. x402 is a payment *rail* that some agents can speak; it is not yet a marketplace people complete.

Headline settlement counts are a poor proxy for this job. Independent measurement repeatedly finds gamed, operator-internal, or unnameable volume. What *is* real, and persistent, is operational friction: wallets that rotate or strand funds, v1/v2 header mismatch, repeat charges, opaque 402s, dead discovery listings, private keys in MCP configs, and coding agents that degrade when too many tools are loaded.

Froggy’s two-entry-point design (chat + remote MCP into one policy system) maps to a real split: **coding-agent users want one gated capability, not a directory of 50 paid tools**; **personal-agent users want a result without learning Base/Hedera**. A curated, policy-gated capability layer is more consistent with observed dissatisfaction than an open Bazaar-style marketplace.

Confidence in this judgment: **medium-high** for “thin completed x402 demand vs loud protocol narrative”; **medium** for which capability (search vs image vs inference) would convert first, because organic paid completions by non-promoters are scarce in the public record.

## Method note: native X tools

This session’s connected MCP servers were workspace tooling and Railway. **No native X search, keyword, or thread-fetch tools were available.** `open_page` / browse refused `x.com` URLs and instructed use of X tools that were not present. X evidence therefore comes from **web-search index snapshots of x.com posts** (often including full post text, author handle, timestamp, and engagement counts). Quoted posts and some thread continuations appeared in those snapshots. **Replies were not systematically fetched.** Treat every X record as a search-index snapshot, not a complete conversation.

GitHub issue pages, Coinbase/Browser Use docs, Cursor forum, arXiv HTML, CoinDesk, Cloudflare, DEV.to, and ChainAnalyzer were read as full pages where the fetch succeeded. Two Reddit threads were blocked behind login; they are cited only as search-index.

---

## 1. Who actually asks an agent to buy a capability?

### Coding-agent users (Claude Code, Cursor, Codex)

This is the loudest *capability* demand, and it is mostly **not** phrased as payment.

- Cursor users hit hard tool-count ceilings and ask to disable unused tools rather than add more paid servers. A 2025 forum thread documented an effective **40-tool cap** that hid Slack tools until GitHub MCP was disabled ([Cursor forum, 2025-03-21](https://forum.cursor.com/t/tools-limited-to-40-total/67976)). In July 2026 the CLI still eagerly sent every MCP schema and returned “Too many MCP tools are enabled for this model” ([Cursor forum, 2026-07-13](https://forum.cursor.com/t/cli-mcp-tool-limits/165642)).
- Independent write-ups in 2026 measure tool-schema “context tax” large enough to consume most of a 200k window before the user types, with selection accuracy falling as tool count rises ([Unblocked, 2026-05-16](https://getunblocked.com/blog/mcp-tool-overload/)).
- Coinbase DevRel publicly positioned a **single** x402 MCP as the alternative to “a new MCP for every service” ([@Must_be_Ash, 2025-12-04](https://x.com/Must_be_Ash/status/1996378706655519116)). Affiliation: Coinbase DevRel (known). That is a product thesis, not observed organic spend.

**Implication:** a Froggy remote MCP that exposes a *small* set of outcome tools (`get_image`, `search`, `speak`, `infer`) is closer to what coding-agent users already complain about than a discoverable catalog of paid endpoints.

### Personal-agent users

Public examples of a person asking an agent to *pay* are almost all demos or founder posts:

- Cloudflare’s playground funds a **testnet** wallet and has the agent **prompt the human** before paying for an MCP tool ([Cloudflare, 2025-09-23](https://blog.cloudflare.com/x402/)).
- A Vertical/vAPI demo shows Claude paying live x402 services including LLM inference and Graph data “from the chat,” with “no wallets, no NPM, no terminal” ([@Build_Vertical / @vAPI_Network, 2026-06](https://x.com/Build_Vertical/status/2065363489921630519)). Affiliation: protocol incubator (promoter).
- A Blockspace tutorial has Claude Code pay Lightning to place a phone call ([@blockspace, 2026-03-27](https://x.com/blockspace/status/2037533304082088274)). Affiliation: media (tutorial).
- Cryptorefills published a walkthrough of an agent buying a gift card via MCP + x402 ([@Cryptorefills, 2026-05-06](https://x.com/Cryptorefills/status/2051961552572662053)). Affiliation: merchant (promoter).

I did **not** find a dense set of unaffiliated users saying “I asked Claude to buy an image / voiceover / flight and it paid.” Absence is not proof of zero demand; it is evidence that completed consumer spend is not the public conversation.

### Developers / sellers

Supply-side activity is high; completed third-party demand is not.

- A July 2026 population-scale paper on Base x402 (280-day window) reports 25,163 advertised Base resources collapsing to 811 payTo addresses, 624 that ever settled, and **249 that earned at least $10**; only 52% of probed hosts still returned a live 402 ([Ling et al., arXiv:2607.12575](https://arxiv.org/abs/2607.12575)).
- A DEV.to build-in-public post recorded **~16 HTTP 402s and 0 completed transactions** after four weeks of X promotion ([ClawMerchants, 2026-03-15](https://dev.to/nathanielc85523/how-agent-commerce-actually-works-x402-skillmd-and-the-001-transaction-17g6)). Author’s own explanation: clients were not wired to pay, USDC-on-Base was a higher bar than a card or API key.
- Search-index of r/mcp (login wall; not independently re-read): an operator reported 61k site visits, 20 DISCOVER / 3 PROBE / 2 QUERY / **0 REGISTER** wallet attachments after 88 cycles ([u/globalchatads, 2026-04-17](https://www.reddit.com/r/mcp/comments/1so6twx/negative_result_88_cycles_building_an_mcpx402/)). Treat as unverified until the thread is readable.

### Small businesses / finance teams

Until August 2026, a Ramp post claimed **35M+ x402 settlements had never touched a corporate ledger**. The launch is agent wallets with attribution, audit trails, and spend controls on Solana ([@teddy_riker, 2026-08-20](https://x.com/teddy_riker/status/2090467979121013077)). Affiliation: Ramp (promoter). The *need* (budgets, approvals, receipts) is independently corroborated by Coinbase’s own Agentic Wallet FAQ (max-per-call / max-per-session, agent cannot change limits) ([CDP FAQ, accessed 2026-09-06](https://docs.cdp.coinbase.com/agentic-wallet/mcp/faq)). That is the same control surface Froggy already sketches.

### Crypto-native users

This cohort generated the noisiest on-chain counts and the most scam/gaming reports. Independent researchers and security accounts treat a large share of 2025–early-2026 activity as mint loops, self-dealing, or leaderboard farming (see §5). This is **not** the first-user persona in the brief (“need not understand chains”).

---

## 2. What job fails, and what friction persists

### 2.1 Discovery and trust (unmet, high signal)

Cascade (building a trust product; promoter of its own fix) stated that x402 solved payments, not discovery or trust, and that agents try multiple anonymous URLs because dead endpoints are indistinguishable from live ones ([@cascade_fyi, 2026-02-09](https://x.com/cascade_fyi/status/2020913705853071681)). The academic census later quantified the same decay: about half of advertised hosts no longer returned a 402 ([arXiv:2607.12575](https://arxiv.org/html/2607.12575)). A May 2026 security paper showed agent selection can be steered by metadata gaming and Sybil listings (one crafted server 71.8%; five Sybils 60.2%) ([Li, Wang, Wang, arXiv:2605.11781](https://arxiv.org/html/2605.11781v1)).

**Minimum trust bar implied by this evidence:** live 402 probe, named payee, proof of prior delivery, and resistance to catalog Sybils — not a score or transaction count.

### 2.2 Wallet setup, private keys, wrong network, stranded funds

Default MCP install patterns still ask for a raw private key in env (`X402_PRIVATE_KEY`, `CHAINANALYZER_X402_PRIVATE_KEY`, `BROWSER_USE_X402_PRIVATE_KEY`). Browser Use’s own docs walk a “new to crypto” user through MetaMask, Base, Buy USDC, **export private key** ([Browser Use x402 guide, accessed 2026-09-06](https://docs.browser-use.com/cloud/guides/x402)). ChainAnalyzer’s paid MCP does the same and notes a $5 float covers five $1 scans ([ChainAnalyzer, 2026-04-28](https://chain-analyzer.com/en/news/mcp-x402-autonomous)). QuackAI’s product copy argues an agent “should not need a private key sitting loosely inside a chat environment” ([@QuackAI_AI, search-index](https://x.com/QuackAI_AI)).

Even the email/OTP embedded-wallet path fails in ways a first user will not diagnose:

- **Silent EVM address rotation** after an x402 pay attempt left 9.50 USDC stranded; Solana address on the same email did not rotate ([payments-mcp#25, 2026-04-23](https://github.com/coinbase/payments-mcp/issues/25)).
- **Wrong-network deposit:** 80.68 USDC sent to Ethereum mainnet on an Agentic Wallet that cannot see, sign, or export ETH mainnet; Coinbase retail support had no recovery path ([payments-mcp#34, 2026-08-25](https://github.com/coinbase/payments-mcp/issues/34)).
- CDP troubleshooting lists insufficient funds, wrong CAIP-2 network, v1 `X-PAYMENT` vs v2 `PAYMENT-SIGNATURE`, expired authorizations, and KYT declines as the common 402-after-payment causes ([CDP troubleshooting, accessed 2026-09-06](https://docs.cdp.coinbase.com/x402/support/troubleshooting)).

This is direct evidence against “first user need not understand chains” unless Froggy hides network selection, forbids raw keys, and recovers wrong-rail deposits.

### 2.3 Failed calls, opaque 402s, double pay, no refund protocol

A production oracle operator reported a client that once paid, then broke, then issued **8,000+ unpaid 402s per day for 18 days** (~144k identical 402s) with no protocol way to tell the operator ([x402#1860, 2026-03-29](https://github.com/x402-foundation/x402/issues/1860)). Follow-on production notes: empty wallet looked like four failing endpoints; a cached $0.01 price against a $0.05 route produced `invalid_payload` at the facilitator ([PR #1875 comments, 2026-04-15](https://github.com/x402-foundation/x402/pull/1875)).

Payments MCP paid **twice** for the same route instead of using a `sign-in-with-x` reclaim; a control client on the same seller got the second response free ([payments-mcp#23, 2026-03-17](https://github.com/coinbase/payments-mcp/issues/23)). CDP docs separately warn that identical payloads cannot settle twice, but *different* signed payloads can, and that refunds “depend on the service provider” ([FAQ](https://docs.cdp.coinbase.com/agentic-wallet/mcp/faq); [troubleshooting](https://docs.cdp.coinbase.com/x402/support/troubleshooting)).

An MCP client bug turned settlement failure into a **20+ payment-build loop** that exhausted the seller’s rate limit (no funds broadcast in that report) ([aibtc-mcp-server#397, 2026-03-24](https://github.com/aibtcdev/aibtc-mcp-server/issues/397)).

The five-attack paper documents the complementary failure: **paid-but-denied** (settlement preemption) and **unpaid service** (grant before finality), plus live replay of 248 grants per payment in an unaudited deployment ([arXiv:2605.11781](https://arxiv.org/html/2605.11781v1)). Browser Use documents a narrower, product-level mitigation: if payment settles but the request fails, credits are reclaimed; mid-task credit drain still **terminates** the worker rather than pausing for another x402 top-up ([Browser Use](https://docs.browser-use.com/cloud/guides/x402)).

### 2.4 Protocol version and client lag

A seller who migrated MiniFetch to x402 v2 found Payments MCP v1.2.0 reading empty `paymentRequirements` because v2 moved the quote into `PAYMENT-REQUIRED` ([payments-mcp#22, 2026-01-14](https://github.com/coinbase/payments-mcp/issues/22)). Issue still open as of this access. Any marketplace that mixes v1 and v2 sellers will silently fail for agents on the lagging client.

### 2.5 MCP overload and routing quality

This is the strongest *coding-agent* dissatisfaction, and it is independent of x402:

| Observation | Source | Date |
|---|---|---|
| Cursor sent only first 40 tools; GitHub MCP hid Slack tools | [forum](https://forum.cursor.com/t/tools-limited-to-40-total/67976) | 2025-03 (12-month label) |
| CLI: “Too many MCP tools… disable some MCP servers” | [forum](https://forum.cursor.com/t/cli-mcp-tool-limits/165642) | 2026-07 |
| 3 servers ~143k tokens / 72% of 200k window (reported) | [Unblocked citing AgentPMT](https://getunblocked.com/blog/mcp-tool-overload/) | 2026-05 |
| Tool-selection accuracy 43% → <14% as tool count grew (reported) | same | 2026-05 |

An x402 marketplace that registers one MCP tool per SKU would recreate this failure. Progressive disclosure (one router, few outcome tools) is what platforms already converged on.

### 2.6 Microtransaction overhead vs fiat / keys

Sellers and analysts keep repeating that cards cannot price a $0.01 call. That is a **seller** argument. On the **buyer** side, OpenRouter, Exa, ElevenLabs, CoinGecko, and model-provider dashboards already meter with an API key and a monthly invoice. ChainAnalyzer’s own comparison: under ~2,500 scans/month, $1 x402 beats a $19.99 Pro plan; above that, the subscription wins ([ChainAnalyzer](https://chain-analyzer.com/en/news/mcp-x402-autonomous)). That is willingness-to-pay for *AML scans by agents without cards*, not evidence that a general user will fund USDC to generate an image.

Kala (building a processor-side product; promoter) argued x402 is already winning **machine-buying-API-calls**, while agent checkout at real merchants is a ~30-year payments problem ([@kalapowered, 2026-08-31](https://x.com/kalapowered/status/2094445570735612185)). That matches Froggy’s brief: crypto/card commerce is optional, not the marketplace.

---

## 3. Who pays today (willingness-to-pay vs enthusiasm)

**Do not read settlement counts as demand.** Three independent measurement stories, different windows, same qualitative result:

1. **Artemis / CoinDesk (Feb–Mar 2026):** Artemis posted that real x402 activity had fallen from ~731k to ~57k tx/day and called the boom “mostly a mirage” ([@artemis, 2026-02-09](https://x.com/artemis/status/2020929124416606632)). CoinDesk, citing Artemis, reported ~$28k daily volume with roughly half gamed, against a ~$7B category market cap inflated by unrelated tokens ([CoinDesk, 2026-03-11](https://www.coindesk.com/markets/2026/03/11/coinbase-backed-ai-payments-protocol-wants-to-fix-micropayment-but-demand-is-just-not-there-yet)).
2. **Ling et al. (window 2025-09-17 to 2026-06-23):** Base 136.7M settlements / $44.1M; 21.20% fictitious, 63.78% internal-cluster; independent catalog-service floor **$187,861**; genuine ceiling $20.3M if unproven remainder is real ([arXiv:2607.12575](https://arxiv.org/abs/2607.12575)). Catalog liveness and $10-earner counts as above.
3. **OnchainLu / Artemis follow-ups:** public tables trying to separate “gamed” from labeled real servers; BlockRun listed among servers without recent gamed txns in one January 2026 snapshot ([@OnchainLu, 2026-01-07](https://x.com/OnchainLu/status/2008955564307697753)). Affiliation: Artemis analyst (known). A listing without gamed flags is **not** proof of end-user demand.

**Organic completed-purchase evidence found in this lane:**

- ClawMerchants: 0 paid completions (primary, founder-reported).
- GitHub issues: users *attempting* to pay (Venice chat completions, restricted-party screen, MiniFetch) and hitting client bugs — this is willingness to try, not a market size.
- Demos (Cloudflare playground, vAPI, Messari skill + Payments MCP, Cryptorefills): promoter or vendor.

**I am not manufacturing a TAM from these anecdotes.**

---

## 4. What free / API-key tooling already solves

| Job | Typical workaround today | Why x402 is optional |
|---|---|---|
| Model inference | OpenRouter, provider APIs, Claude/ChatGPT subscriptions | Key + invoice; quality routing already exists |
| Search | Exa, Tavily, Brave, bundled web search in coding agents | Coordinator already saw unpaid Exa 402s; keys still dominate |
| Images | Replicate, fal, OpenAI/Gemini image APIs, BlockRun as x402 option | Users already pay providers; x402 removes signup, not the model bill |
| Voice | ElevenLabs key | Same |
| Crypto prices | CoinGecko key / public tier; Graph as paid oracle | Coordinator saw CoinGecko 402 metadata; keys remain |
| Browser / sandbox | Browser Use API key, or x402 top-up of the same credit ledger | Browser Use x402 is a **credit top-up**, not per-step settlement during the task |
| Coding tools | GitHub PAT, local CLI | MCP tax makes extra paid MCPs unattractive |

The unmet slice is specifically: **an agent that should not hold the user’s SaaS credentials, should spend within a budget, and should obtain a result without the human creating an account on each vendor.** That is a policy/wallet problem, not a catalog problem.

---

## 5. Contrary evidence (at least five challenges)

1. **Protocol narrative vs usage.** CoinDesk + Artemis: demand “just not there yet”; merchants for pay-per-use APIs still rare ([CoinDesk](https://www.coindesk.com/markets/2026/03/11/coinbase-backed-ai-payments-protocol-wants-to-fix-micropayment-but-demand-is-just-not-there-yet); [@artemis](https://x.com/artemis/status/2020929124416606632)).
2. **Settlement count is manufacturable.** Facilitator-sponsored gas; Ling et al. estimate the entire Base census reproducible for ~$356k in gas ([arXiv:2607.12575](https://arxiv.org/html/2607.12575)). A listing’s tx count is not reliability or demand.
3. **Zero completions after discovery.** ClawMerchants 16×402 / 0 pay ([DEV](https://dev.to/nathanielc85523/how-agent-commerce-actually-works-x402-skillmd-and-the-001-transaction-17g6)). Search-index Reddit 0 wallet registrations (unverified full text).
4. **Client quality is not production-ready for mixed sellers.** Open v2 gap ([#22](https://github.com/coinbase/payments-mcp/issues/22)), double-pay ([#23](https://github.com/coinbase/payments-mcp/issues/23)), address rotation ([#25](https://github.com/coinbase/payments-mcp/issues/25)), stranded mainnet USDC ([#34](https://github.com/coinbase/payments-mcp/issues/34)).
5. **Security of the rail is contested.** 15/15 facilitators failed at least one of eight verify/settle rules in a black-box study summarized on X ([@0xFlint_, 2026-08-25](https://x.com/0xFlint_/status/2092184318743298133); study not independently re-run). Academic attacks include replay, cache leak of paid content, and discovery capture ([arXiv:2605.11781](https://arxiv.org/html/2605.11781v1)). GoPlus and independent researchers warned that x402scan-listed mint endpoints were used as token scams, not AI payments ([@tmel0211, 2025-10-24](https://x.com/tmel0211/status/1981744488944197891); [@GoPlusSecurity, 2025-11-17](https://x.com/GoPlusSecurity/status/1990360261325402494)).
6. **MCP overload is a product anti-pattern for “capability marketplace.”** Cursor/Claude Code evidence above.
7. **Search-index only (Reddit, login wall):** a seller claimed they ripped x402 out after six weeks because refunds, KYC, USD-not-USDC agents, and “building a payments company” exceeded the product ([r/mcp, 2026-03-10](https://www.reddit.com/r/mcp/comments/1rq0nx3/x402_is_the_right_idea_for_agent_payments_heres)). Not used as a load-bearing claim.

Disconfirming *against an integrated marketplace* specifically: Coinbase already ships Bazaar + Payments MCP + Agentic Wallet; Browser Use ships x402 as account top-up; OpenRouter-class aggregators already route models. Froggy does not win by listing more endpoints. It wins if **policy + one execution path + artifacts** are better than “paste a private key into another MCP.”

---

## 6. Ranked problem / use-case opportunities

Each item: problem, who, confidence, **quick user test** (unpaid / interview / mock — no paid x402 required).

| Rank | Opportunity | Who | Confidence | Quick test |
|---|---|---|---|---|
| 1 | **One remote MCP with 3–6 outcome tools**, not a per-SKU catalog. Coding agents already fail past ~40 always-loaded tools. | Claude Code / Cursor / Hermes | High | Install Froggy MCP vs 5 vendor MCPs in a real Cursor/Claude Code session; measure tool-selection errors and `/context` tokens on “generate a hero image and a 10s voiceover for this README.” |
| 2 | **Human-readable spend policy** (cap per call, cap per day, allowlist of capability classes) without exporting a private key. Matches Coinbase FAQ + Ramp’s “never touched a ledger” gap + stranded-fund issues. | Personal + coding agents; later SMB | High | Paper prototype: “allow images ≤ $0.10, search ≤ $0.02, deny other.” Watch whether a non-crypto user will fund **fiat** into that envelope. |
| 3 | **Trusted live directory with delivery receipts**, not Bazaar scores. Dead 402s and Sybil ranking are documented. | All agent buyers | High | Unpaid GET probe of 20 advertised endpoints weekly; show users a “last live 402 / last receipt” card; ask if they would allow auto-pay. |
| 4 | **Payment-failure diagnostics surfaced to the human** (empty wallet vs wrong amount vs v2 header vs KYT). 144k silent 402s is a real operator report. | Developers running agents | High | Replay CDP error codes in the Froggy UI as English; time-to-diagnosis vs raw 402 JSON. |
| 5 | **Idempotent paid results / no double charge.** Payments MCP repaid a SIWX route; academic replay 248×. | Anyone who retries | Medium-high | Two identical “buy this search” clicks; assert one settlement or a reclaim. Can be simulated without mainnet. |
| 6 | **Search-as-capability for coding agents** when the model’s bundled search is wrong or rate-limited. Exa already speaks 402; keys still easier. | Coding agents | Medium | Task: “find the current x402 v2 header names from primary docs.” Compare Froggy-routed search vs no extra tool vs Exa key. |
| 7 | **Image / speech artifacts into the workspace** (file, not a URL the agent forgets). BlockRun-class 402s exist; users already pay Replicate/ElevenLabs. | Personal + coding | Medium | Same README task as #1; success = file on disk + receipt, not a 402 challenge. |
| 8 | **Metered inference as overflow**, not default. Subscriptions cover most tokens; x402 is for a model the user does not have a key for. | Coding agents hitting a missing model | Medium | “Call a model I don’t have a key for, cap $0.05.” If they already have OpenRouter, they will not switch. |
| 9 | **Corporate / household budget envelope** (Ramp-shaped). Real for finance teams; not the first user. | SMB / power users | Medium | Interview one person who would let an agent spend $20/month. If they insist on card + invoice, deprioritize. |
| 10 | **Travel / retail checkout.** Kala’s 30-year claim plus ACP/UCP/card rails. Optional demo only (MetaMask Card). | Crypto-native curiosity | Low | Do not build; one scripted checkout later if needed. |

---

## 7. Implications for Froggy (this lane only)

- **Do not compete with Bazaar on listing count.** Compete on: few tools, live probes, receipts, caps, no raw keys, chain-hidden funding.
- **Hedera x402 as settlement flavor is fine; user-visible chain is not.** Wrong-network stranding is a filed, recent bug on Coinbase’s own wallet.
- **Remote MCP must be tiny.** Otherwise Cursor CLI and tool-selection quality kill the second entry point.
- **Upstream may be API keys.** That is consistent with how users already pay; x402 is the agent-facing meter, not the only seller rail.
- **Async / long jobs:** Browser Use already warns that mid-task credit drain kills the worker. Image, voice, sandbox need a job id + receipt, not a single HTTP round-trip.
- **Trust minimum:** allowlist + last-successful-delivery. Transaction counts on x402scan are adversarially cheap.

---

## 8. Remaining gaps (high-impact, unresolved)

1. **Unaffiliated end-user diaries** of paying for image/voice/search via an agent (not vendor demos). Native X reply graphs were not fetchable here.
2. **Hermes-specific** wallet/MCP complaints: not found as a distinct public issue corpus.
3. **True mix of paid vs key-based** Exa / BlockRun / ElevenLabs usage. Coordinator saw unpaid 402s; this lane did not inspect settlement.
4. **Whether coding-agent users will fund a float** if the alternative is pasting one more API key they already have.
5. **Reddit threads** behind login (0 registrations; x402 ripped out after 6 weeks) need a full-page re-read.
6. **Facilitator-failure paper** cited by @0xFlint_: study URL in the post was not opened as a full PDF in this run.
7. **Willingness-to-pay price points** for personal users (is $0.05 image a default, or do they expect it inside ChatGPT Plus?).

---

## 9. Source ledger

See `demand-sources.json` for structured records. Summary of types:

| Type | Count in JSON | Role |
|---|---|---|
| Full web page (docs, GitHub issue, forum, arXiv HTML, journalism, vendor post) | 19 | Primary where noted |
| Search-index of X post | 12 | Partial; replies not fully inspected |
| Search-index only (Reddit) | 1 | Low confidence |

Affiliation labels in JSON: `known-vendor`, `known-analyst`, `academic`, `known-employee`, `unknown`, `promoter-product`.

---

## 10. Query / method log

**Native X tools actually available:** none. Searched MCP catalogs for twitter/X/thread/keyword_search tools; only workspace tooling + Railway matched. `open_page` disabled for x.com.

**Wave 1 queries (web_search unless noted):**

- `x402 protocol agent payment MCP marketplace demand`
- `x402 "doesn't work" OR scam OR fake OR "mostly a mirage" OR abandoned site:x.com`
- `x402 MCP wallet "private key" OR "insufficient funds" OR markup OR "charged anyway" OR failed`
- `"Claude Code" OR Cursor OR Hermes "MCP" too many tools overload paid API key`
- `site:github.com x402 issues payment failed MCP wallet`
- `Artemis x402 "mostly a mirage" agent payments volume`
- `"asked my agent" OR "Claude bought" OR "agent paid" image OR voiceover OR "search results" USDC x402`
- `site:reddit.com x402 MCP agent wallet payment failed OR scam OR "API key"`
- `site:github.com/coinbase/x402 issues insufficient funds OR payment rejected OR v1 v2`
- `"X402_PRIVATE_KEY" OR "x402 private key" MCP security risk Claude`

**Wave 2 (follow originals / disconfirm):**

- Full pages: CoinDesk 2026-03-11; CDP troubleshooting; CDP Agentic Wallet FAQ; Browser Use x402; ChainAnalyzer MCP post; Unblocked MCP overload; Cursor forum 165642 and 67976; GitHub payments-mcp #22 #23 #25 #34; x402 #1860 and PR #1875; aibtc-mcp-server #397; arXiv 2607.12575 and 2605.11781; DEV ClawMerchants; Cloudflare x402 blog.
- Additional X index queries: `site:x.com x402 MCP "private key"…`; `"I asked Claude" OR "Claude Code" x402…`; facilitator 15 failed; Ramp; Kala 30 years; Cascade trust; OnchainLu table; Hedera bounty.
- Failed/blocked: Reddit old.reddit login wall; Fireblocks blog thin fetch; Medium/PlainEnglish challenge page; native x.com browse.

**Stopping reason:** Core claims (thin completed demand, gamed volume, wallet/key friction, MCP overload, discovery/trust, client double-pay and v2 lag) are each backed by at least one primary page or a named X snapshot. Further queries repeated the same promoter demos and the same Artemis/gamed-volume talking points. Remaining gaps are listed rather than padded with duplicate records.

**X conversations inspected:** 12 unique `x.com` status URLs in `demand-sources.json`, plus additional search-index snapshots cited in prose (OnchainLu gaming follow-ups, Hedera bounty, Chance verifier, QuackAI, Blockspace Lightning demo, x402-on-Solana 77-tools post). **Native X thread fetches: 0.** Replies were not systematically read.
