# Froggy’s paid capabilities: what to showcase and why

Research date: 6 September 2026. Three parallel Grok Build CLI runs, independent provider checks, and a reconciliation against repository revision `d9cf26e`. This is the **reviewed synthesis**; the separate Grok reports are research inputs, not the product plan. [Methods and corrections](methods.md) explain the evidence limits.

> Follow-up direction: [X research through Froggy](x-research-service.md) specifies X API access behind a Hedera-paid research task, and records the renewed interest in MCP alongside CLI delegation. [Grok subsequently verified direct X API access](x-search-followup/README.md): six successful requests, 41 unique posts, and one sampled conversation.

## Recommendation

Keep one product promise: **your personal agent can get useful paid work done through Froggy, under your rules, with the result and spending visible in your workspace.**

For the marketplace extension, start with **search and image generation**, alongside the existing Graph brief. Search is useful during browsing and research; an image is an immediately visible artifact that Claude Code or Hermes can actually use. Speech is a good third addition. A catalog of hundreds of endpoints would add less value than making these few work reliably.

The two entry points remain the same idea: a human asks in Froggy, or an external agent delegates. However, the team has since decided **CLI plus SKILL.md for this iteration, with remote MCP deferred**. Use the task API, token identity, and CLI already built. The earlier research briefs assumed MCP; they do not override the [confirmed iteration plan](../../plan/NEXT_ITERATION.md).

These are proposed additions, not replacements for the team’s accepted Graph, onboarding, and MetaMask Card demonstration. Nothing in this research authorizes extra paid tests or changes the overnight run’s allocation.

## The shortlist

Evidence levels matter: **live quote** means an unpaid request returned a valid 402 challenge; **documented** means a provider describes it; **delivered** requires a successful paid call and usable output. This research made no paid calls. None of these external services is yet certified here as working end to end inside Froggy.

Prices are upstream sample prices, not Froggy retail prices. Requote the exact inputs before payment. Base and Solana offers are alternatives; Froggy’s existing EVM path makes Base the relevant integration candidate.

| Priority | Capability / provider | A good Froggy task | Evidence, payment, and caveat |
| --- | --- | --- | --- |
| 1 | **Search — You.com** | “Find three current sources for this decision.” The same capability helps a browser task or a coding agent. | **Live quote:** GET search, **$0.005 USDC**, Base / Solana, v2 exact. GET fits the current general purchase tool more directly than POST. [Docs](https://you.com/docs/administration/machine-payments/x402), [new probe](coordinator-probes.json). |
| 1 | **Images — BlockRun** | “Make an image for the page Claude is building, and return the file.” | **Live quote:** sampled Nano Banana 1024 image **$0.053501 USDC on Base**. POST input, artifact storage and any job polling still need integration. [Docs](https://blockrun.ai/docs/api-reference/image-generation), [earlier probes](probes.json). |
| 1 | **Search + retrieved content — Exa** | “Compare these products using cited pages.” | **Live quote:** sampled search **$0.007 USDC**, Base / Solana. Search uses POST; contents is a separate documented capability with separate pricing. Choose Exa or You.com first; compare result usefulness before integrating both. [Docs](https://exa.ai/docs/reference/x402-guide). |
| Existing core | **Borrow-and-supply brief — Froggy + The Graph** | “Compare USDC markets and explain the available rates.” | Existing Hedera settlement evidence, and the accepted plan’s core service. The old probe was **0.05 HBAR on testnet**; the new plan specifies **$0.05 per brief**, converted to HBAR, and mainnet. Those are different observations, not interchangeable prices. [Evidence](../../evidence/HEDERA.md), [current plan](../../plan/NEXT_ITERATION.md). |
| 2 | **Speech — BlockRun / ElevenLabs** | “Give me a spoken version of this brief” or “make a voiceover for my landing page.” | **Live quote:** tiny “Hello world.” sample **$0.002 USDC on Base**. Longer input reprices. Return playable/downloadable audio and a receipt. [Docs](https://blockrun.ai/docs/api-reference/text-to-speech). |
| 2 | **Inference — BlockRun** | “Ask another model to critique this answer” or “classify these records into JSON.” | **Live quote:** a short GPT-4o-mini request quoted **$0.002 USDC on Base**. This does not establish model availability or delivered quality. Useful as an extra model capability, less distinctive as Froggy’s main demonstration. [Docs](https://blockrun.ai/docs/api-reference/chat-completions). |
| 2 | **Token data — CoinGecko** | Paste an address, resolve the token, then show price and pool context. | **Live quote:** simple price **$0.01 USDC**, Base / Solana. Token/pool routes are documented but were not individually tested. Correct host: `pro-api.coingecko.com`. Do not turn address recognition into authorization to trade. [Guide](https://www.coingecko.com/learn/x402-pay-per-use-crypto-api). |
| Explore | **US stock data — Massive** | “Build a sourced company briefing using filings, recent news and price history.” | **Documented**, launched 1 September: USDC on Base, host `agent.massive.com`. Covers US stocks; bars are end of day, snapshots use FMV, not a complete real-time trading feed. Pricing is route-specific. No endpoint or paid delivery tested here. [Docs](https://massive.com/docs/ai-tools/x402). |
| Explore | **Finance research — You.com** | “Explain this company’s earnings using sources.” | **Documented:** POST, **$0.11 deep / $0.50 exhaustive**. Long response time makes it a background task, not the first three-minute demo. Its docs warn that a quote can precede input validation: validate the request before signing. [Docs](https://you.com/docs/administration/machine-payments/x402). |
| Later | **Compute — BlockRun / Modal; Hedera-native Pinout** | “Analyze this public CSV and return a chart.” | Modal is documented but not provisioned. Pinout is a Hedera testnet bounty project offering metered CPU/GPU sessions. Both need lifecycle, cost and cleanup checks. Pinout is a promising native-Hedera exploration, not a verified production dependency. [Modal docs](https://blockrun.ai/docs/api-reference/modal-sandbox), [Hedera announcement](https://hedera.com/blog/x402-bounty-on-hedera-winners-announced/). |

**Hold Firecrawl out of the ready list.** Coinbase’s 2025 case study names `POST https://api.firecrawl.dev/v1/x402/search`; that exact route returned **404** in the new check. This does not prove Firecrawl abandoned x402—it means the documented route needs rediscovery before we depend on it. [Announcement](https://www.coinbase.com/developer-platform/discover/case-studies/firecrawl), [probe](coordinator-probes.json).

Video, music, phone calls, and social-data APIs appear in the wider Grok inventory. They are useful brainstorming leads, but add latency, service-specific behavior, or effects beyond simply returning data. Keep them below the verified shortlist until their particular contract is checked.

## Three concrete showcase stories

### A. An agent buys the missing asset

Claude Code is building a page. It delegates an image task to Froggy using the current CLI/skill. Froggy quotes the service, applies the owner’s mandate, obtains the image, and returns a durable task result with a downloadable file and receipt. The owner sees the same task in Froggy.

Repeat the task from Froggy chat to show the shared execution path. A disconnect and reconnect should retrieve the original result. An over-budget request should produce a clear refusal or approval request without a second payment.

**Why this is a good marketplace demonstration:** the output is obvious, the external agent has a practical reason to delegate, and the user does not have to create another provider account. Whether users prefer this to their existing image tools still needs testing.

### B. Research → useful browser decision

“Find three alternatives to this product, compare them with sources, and open the best match.” Froggy uses paid search only when it adds information the agent does not already have. It returns a compact comparison and opens the relevant page in the shared browser. The person can take over and verify what the agent found.

The accepted MetaMask Card flow can continue from here: a merchant purchase remains its own approved action. The search fee and the merchant charge are separate. Paying for a search API does not pay the shop, and x402 itself does not bridge funds to Linea.

**Why it fits Froggy:** search contributes directly to the shared browser task. It is not an isolated API demonstration. Use public product information for a rehearsal; the research did not place an order.

### C. A Graph brief that becomes something usable

The external agent requests the existing USDC borrow-and-supply brief. Froggy returns fresh, comparable data with deployment/block provenance, an explanation, and the Hedera receipt. An optional speech task reads the summary aloud.

Keep the Graph comparison itself central. Speech is an accessory, and unrelated image generation would weaken this story. Show the same task in chat and through Hermes. This extends the team’s selected Graph demonstration without replacing it with a generic token-price request.

## What people complain about—and what we can actually conclude

The strongest evidence is concrete operational friction, not a measured consumer market. Native X thread tools were unavailable; indexed X posts and partial pages are directional evidence, often from vendors. We did **not** complete a representative X conversation study.

| Signal | Evidence | Product implication |
| --- | --- | --- |
| Finding a listed service does not guarantee a usable client | A MiniFetch operator reported Payments MCP v1.2.0 failing to parse v2 payment headers. This is a specific historical client report, not a claim that all current MCP clients are broken. [Issue](https://github.com/coinbase/payments-mcp/issues/22). | Test the exact provider, protocol, payer and client path; a catalog badge is insufficient. |
| Discovery must connect a question to the right data | A Graph forum discussion describes difficulty resolving a question to a useful subgraph; a reply asks whether actual users were involved as design partners. Its volume estimates were not independently reproduced. [Thread](https://forum.thegraph.com/t/whats-actually-blocking-x402-adoption-on-the-graph-awareness-discovery-and-one-round-trip-payments/7009). | Sell an understandable answer with provenance, not “access to 15,000 subgraphs.” |
| A directory can attract attention without conversion | One marketplace operator reported zero wallet registrations despite substantial visits. Replies emphasize immediate task value. We read the original thread, but its analytics remain self-reported and seller-wallet registration is not buyer paid-task completion. [Thread](https://www.reddit.com/r/mcp/comments/1so6twx/negative_result_88_cycles_building_an_mcpx402/). | Let a user see the result they could obtain and its price before asking for financial setup. |
| Tool overload can damage the agent experience | Cursor users report excessive enabled MCP tools; BlockRun itself offers smaller tool profiles. Neither establishes a universal present-day tool limit. [Cursor discussion](https://forum.cursor.com/t/cli-mcp-tool-limits/165642), [BlockRun repository](https://github.com/BlockRunAI/blockrun-mcp). | Keep a small task/discovery interface; load individual service schemas when needed. |

**Inference:** there is enough evidence to test a curated paid-capability product, but not to claim product-market fit, a large paying consumer audience, or validated willingness to pay Froggy’s markup. API keys, subscriptions, and existing aggregators remain serious alternatives.

## Competition changes the bar

AgentCash already markets a single balance for paid APIs and support for coding/personal agents. Its adoption figures are vendor claims, not audited demand evidence. [AgentCash introduction](https://agentcash.dev/blog/introducing-agent-cash).

BlockRun already exposes images, inference, research and other tools through MCP, with documented spending limits and confirmation controls. Froggy cannot credibly claim that budgets or paid tools are unique. Client confirmation support varies, which makes a reliable human approval surface a useful test. [BlockRun repository](https://github.com/BlockRunAI/blockrun-mcp).

The differentiating hypothesis is the **whole workflow**: the owner and their external agent share the task, browser, approval surface, funding view, artifact and receipt. Hedera is the actual settlement rail for Froggy’s service. Prove that this combination is easier to use; the particular sponsor combination alone does not establish user value.

## Fit with the code and accepted plan

The initial shortlist was written before substantial evening commits. At `d9cf26e`, the repo has durable seller/task records, agent tokens, a task API, a CLI/skill, and explicit uncertain-payment handling. Do not rebuild those features. See [current status](../../plan/STATUS.md).

The remaining marketplace work is narrower. Current `TaskKind` supports only `brief` and `browse`; image/search service tasks need explicit inputs, pricing and dispatch rather than silently reusing the $0.05 brief. The sampled image alone costs more than that brief price.

1. **Describe a capability precisely.** Store its method, validated inputs, provider identity, network/asset, price behavior and result type. `directory.ts` still probes GET; `x402_fetch` is URL-only. Internal `paidRequest` already accepts request initialization, so POST support can extend the existing path. New hosts/payees also need the appropriate human-approved mandate and signer policy; receiving a compatible quote does not establish permission to pay that provider.
2. **Return useful artifacts.** Images/audio need bounded downloads, MIME and size checks, ownership-scoped access, and a stable result reference. The agent needs a file it can use, not binary text in its prompt.
3. **Map provider jobs into existing tasks.** A 202 is acceptance, not completion. Retain provider job IDs, polling state, settlement evidence and retrieval behavior. Failed paid work must remain distinguishable from an unpaid refusal.
4. **Keep the financial legs separate.** A person paying Froggy on Hedera and Froggy buying from a Base provider are two payments. Correlate them without labeling the Base payment as Hedera settlement. An API-key upstream is also possible; disclose the actual mechanism.
5. **Keep approvals outside external agents.** Agent tokens inherit the person’s mandate. The accepted plan explicitly cuts per-agent caps this week and removes Freeze; use the agreed Stop, approval and token-disconnection behavior.

The current plan chooses mainnet, fixed task pricing, no refunds after failed paid work, person-owned balances, and Privy custody as the next step after a successful signing spike. The research does not reverse those decisions. It does highlight their consequence for a marketplace: the price and paid-failure behavior must be clear before execution, and Froggy must account for its own upstream cost. No claim is made here that every planned mainnet/onramp/custody step is already verified live.

## Hedera opportunities worth a second look

Hedera’s August bounty winners provide concrete patterns: **Pinout** for metered sessions and compute; **Tally** for an authorized ceiling with actual-use billing; **Qisma** for one Hedera transfer split across several recipients. These were presented as testnet projects. They are references to inspect, not drop-in compatibility guarantees. Qisma’s same-chain split does not make a Base upstream payment atomic. [Hedera’s announcement](https://hedera.com/blog/x402-bounty-on-hedera-winners-announced/).

For this iteration, keep the existing exact-payment path. Introducing new metering schemes would enlarge scope and conflict with the team’s fixed-price decision. A later Froggy “analyze this file” service could make native-Hedera compute relevant if a provider passes an actual delivery trial.

The team has selected Privy’s financial-flow prize, Hedera’s AI/agentic payments prize, and The Graph’s composable/standardized-products prize. The raw ideas lane suggested another Graph track and made overly exclusive claims; those are not adopted here. Using Exa, You.com or BlockRun does not itself select another prize sponsor. [Accepted selections](../../plan/NEXT_ITERATION.md).

## What to test with the team next

These are proposed experiments, not observed results:

- **Missing capability test:** Jonas or Hemang uses their normal agent on a real task and reaches a point where a paid image or better search would help. Does Froggy remove work, or merely add a wallet?
- **First useful result:** time from sign-in/agent connection to a usable artifact; separately record funding friction and paid task latency. Test with an existing funded account too, so provider latency is not confused with onramp friction.
- **Repeat demand:** ask them to return the next day with their own task. A voluntary second task is more informative than a successful scripted demonstration.
- **Reliability:** retry the same request, disconnect/reconnect, trigger a provider error, and hit the spending threshold. Check results and charges against the accepted contract.
- **Choice against substitutes:** compare the same task using Froggy and an existing aggregator or API key. Record what the user values enough to tolerate setup or pay a margin for.

My suggested next catalog increment is **one search provider + one image provider**, exposed through the existing task lifecycle. Keep speech as the next small extension. Broader discovery, remote MCP, compute and new payment schemes can follow evidence that people actually return to use it.
