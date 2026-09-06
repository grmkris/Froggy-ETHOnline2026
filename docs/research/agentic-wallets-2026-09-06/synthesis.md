# Froggy: what the agentic-wallet research means for the next iteration

> Historical recommendation, superseded as product direction by the later 6 September sync. Read [iteration 2 context](../../sync/iteration-2-context.md) first: the team chose infrastructure for personal agents, with Hedera x402 central. Evidence below remains input, not current commitments. The Fable prompt now reflects the sync and MetaMask Card follow-up.

Prepared 6 September 2026 for Kristjan and the Froggy team. This is a decision brief, not an approved product pivot. Repository spot-check: `0ce45ca`; another coding agent's completion and deployment status must still be confirmed.

## Recommendation

**Test Froggy as a guided money-decision assistant before building a broad autonomous savings product.** Help one specific person understand whether an opportunity is worthwhile, approve a step they understand, and keep track afterward. Make net benefit, control and the exit path visible. Keep the first experience useful before wallet funding.

This fits the founder's intended audience while making the largest assumptions testable. It is not proof of demand. Grok favors a different near-term direction: a small, controlled budget for paid tools used by existing AI/crypto users. That is closer to today's implementation and sponsor mechanics, but it changes the first customer. The team should choose deliberately between these directions.

Read [Grok's research](grok-findings.md) for native X conversations and [the independent web report](web-findings.md) for consumer discussions, competitors and funding constraints. Use the [Fable 5.1 prompt](fable-5.1-grilling-prompt.md) to turn this evidence into team decisions.

## What changed our understanding

| Finding | Evidence | Implication for Froggy |
| --- | --- | --- |
| Builders want controls; that does not establish demand from ordinary savers. | Grok's X sample is rich in vendor/developer discussion, with little direct novice-saver evidence. The web payment thread's original poster later disclosed building an approval product. [Conversation](https://www.reddit.com/r/AI_Agents/comments/1tt63lu/has_anyone_actually_used_an_agent_to_make_payments/) | Do not count founder posts, engagement or infrastructure launches as customer validation. |
| People ask how earning works and how to get their money out. | A deposit/earn/withdraw request, a US cash-out request, and a risk-communication challenge to Nook. [Savings request](https://www.reddit.com/r/defi/comments/1nsn5lj/inquiry_on_a_savings_defi_platform/), [cash-out request](https://www.reddit.com/r/CryptoCurrency/comments/1vtoouv/is_there_any_wallet_that_i_could_use_to_access_my/), [Nook discussion](https://www.reddit.com/r/NookSavingsAppp/comments/1p1mnc3/top_3_questions_from_nook_customers/) | Explain return source and demonstrate an exit; a deposit alone is incomplete. |
| The simple consumer earning interface already has serious competitors. | Aave's app and disclosures describe embedded accounts, earning, recovery and eligible bank rails. [App](https://aave.com/app?lang=en), [disclosures](https://aave.com/legal/app/disclosures) | “DeFi made easy” is insufficient differentiation. Test whether Froggy improves a specific decision or recurring task. |
| Useful assistance can coexist with user approval. | One shopping user kept reviewing every purchase; others wanted bounded routine automation. [Approval experience](https://www.reddit.com/r/AI_Agents/comments/1uj4afm/i_set_up_an_ai_shopping_agent_then_approved_every/), [automation request](https://www.reddit.com/r/AIAgentsStack/comments/1tq7iod/what_ai_agents_do_you_actually_trust_for_shopping/) | Automate preparation first. Test autonomy preferences by task, not as a universal yes/no. |
| Payment and delivery are different promises. | Third-party x402 proposals discuss response attestations and disputes. [Delivery proposal](https://github.com/x402-foundation/x402/issues/2833), [dispute proposal](https://github.com/x402-foundation/x402/issues/2887) | A settlement receipt does not show that the paid result was useful, correct or even delivered. |
| Reliability can dominate a new feature's value. | Nook allocation users reported loading/withdrawal trouble, followed by staff reporting a fix. MetaMask documents pending and retry failure cases. [Nook incident](https://www.reddit.com/r/NookSavingsAppp/comments/1uehuft/multiallocation_is_now_live/), [troubleshooting](https://github.com/MetaMask/metamask-docs/blob/main/agent-wallet/troubleshooting.md) | Preserve balances, distinguish pending from failed, and make retries and recovery explicit. |

These are qualitative observations, not estimates of how common each need is. A lack of novice demand in our search does not prove that no such market exists.

## Where Grok and Codex agree—and disagree

We agree that unrestricted financial autonomy is an unsupported starting assumption, that small-balance costs need actual quotes, and that “buy a snapshot” has no demonstrated standalone value. We also agree that sponsor integration should serve a task, and wallet policies belong outside model instructions.

**Grok's strongest argument:** the current system is closest to an allowance for paid data/inference. An existing AI-tool user with some USDC can understand that without a bank onboarding journey. This may be the smallest credible hackathon slice.

**My strongest counterargument:** this is a customer change, not merely a clearer pitch. Developer demand is also contaminated by vendor promotion, and existing agent wallets already publish caps and signing isolation. The web evidence contains concrete consumer questions about earning and withdrawal, alongside an existing consumer competitor. That supports testing a narrow consumer job; it does not support dismissing the audience because X is full of builders. [Coinbase](https://www.coinbase.com/en-gb/developer-platform/discover/launches/agentic-wallets), [Circle](https://developers.circle.com/agent-stack/agent-wallets).

**Decision rule:** choose the consumer direction if the team can recruit its users and demonstrate a materially useful decision plus a credible next action. Choose the paid-tool direction if the team can identify a repeated paid task and a user who already incurs that cost. Neither direction wins merely by fitting three logos.

## Three candidate next iterations

| Candidate | Specific job | Smallest convincing slice | Main weakness | Test before expanding |
| --- | --- | --- | --- | --- |
| **A. Guided earning decision** — closest to stated vision | “I have this amount for this long; help me understand whether this opportunity is worth it.” | Amount/currency/horizon → live comparison → return and cost explanation → source inspection → explicit practice action and exit, if technically supported. | Bank-only users may reject crypto regardless of explanation; competitors already simplify deposits. | Three to five target users compare options without coaching and explain return source, risk and exit. |
| **B. Existing stablecoin holder's monitor** — narrower consumer bridge | “Tell me when something changes enough to reconsider my existing position.” | One position/goal → stored baseline → live change → understandable alert → user-approved action. | Needs actual history, useful thresholds and trustworthy position data; current digest is not enough. | Recruit holders with a real monitoring workaround; observe whether an alert changes a decision. |
| **C. Capped budget for paid tools** — Grok's preferred fit | “Let my assistant buy a useful data/tool result within a budget I understand.” | Useful task → discover priced service → policy-gated payment → delivered result and receipt → over-budget refusal. | Changes audience and competes with existing wallet infrastructure. | Find users who already buy the input; test whether the output helps and whether they would reuse the workflow. |

These can share infrastructure, but the submission should lead with one. Shopping is a later candidate unless the team explicitly picks one shopping task and accepts the different merchant/payment dependencies. Shared Chrome can remain an optional inspection or handoff surface; prove that it helps before making it mandatory.

## A first-three-minute experiment for candidate A

Proposed script, not a promised financial product:

1. **0:00–0:30:** ask amount, currency, time horizon and need for access. Do not start with a funding screen or a mandate editor.
2. **0:30–1:30:** show two comprehensible live opportunities and a realistic same-currency outside option when available. Show the source and timestamp. State missing fees instead of implying net return is known.
3. **1:30–2:15:** explain who pays the yield, why the rate can change, what loss or withdrawal constraints remain, and the approximate benefit for that amount and horizon.
4. **2:15–3:00:** let the person choose “learn more,” “watch this,” “try a practice action,” or “stay where I am.” Ask them to explain their choice in their own words.

A person deciding against an unsuitable opportunity can be a successful user outcome. Financial education should help the decision at hand rather than becoming a separate economics course.

For a later earning demonstration, show both entry and exit. If the only implemented payment is buying a service allowance, describe that accurately. A practice transfer is not an earning deposit; a sandbox onramp is not money delivered to a testnet wallet.

## Funding and economic constraints

There are at least two relevant Privy routes to investigate. Its card-onramp documentation supports Apple Pay through providers, subject to geography. Its newer September 1 announcement describes bank deposit/payout orchestration through Privy with Bridge underneath; builders still onboard with Bridge. This corrects a too-narrow reading that every payout necessarily needs a separately integrated provider SDK. Availability, fees and hackathon qualification remain route-specific. [Card onramps](https://docs.privy.io/wallets/funding/fiat-onramp), [new bank orchestration](https://privy.io/blog/fiat-deposits-payouts-kyc-orchestration).

The Stripe sandbox moves no real funds and requires mainnet chain identifiers even in sandbox. It cannot supply a testnet earning position. Treat provider sandbox, live market data, real testnet settlement, and real user funds as four different things. No implementation of these funding routes was performed during this research.

For scale: a hypothetical three-percentage-point annual advantage on $500 is only $15/year before costs. A $5/month subscription costs $60/year. The [web report](web-findings.md#small-balance-economics-an-illustration-to-test) shows a 90-day example. This is arithmetic, not a forecast. Before choosing the flow, obtain entry/exit quotes for one country, amount and asset, and compare in the user's spending currency.

Do not infer that card-fee anecdotes mean every Apple Pay route is uneconomic. Do not infer that “no integration fee” means zero payment-provider spread, card-issuer cost or withdrawal fee.

## Three sponsors: optimize deliverability and coherence

Exactly three is the founder's constraint. Start from Scratch is the intended track; verify actual build-history eligibility. The table lists individual award opportunities, not expected winnings. Official pages were opened on 2026-09-06.

| Sponsor | Relevant award | What the chosen flow must prove | Decision implication |
| --- | --- | --- | --- |
| [The Graph](https://ethglobal.com/events/ethonline2026/prizes/the-graph) | AI From Scratch: $2,500 / $1,500 / $1,000. Standardized-products track has the same split. | Live Graph data used meaningfully; standardized track needs substantive shared-schema use or product composition. | Fits comparison or monitoring. Do not assume winning both tracks is allowed. |
| [Privy](https://ethglobal.com/events/ethonline2026/prizes/privy) | Best financial flow: $2,500. B2B is a separate $2,500 category. | Core wallet use and a functional generally available financial flow. Guided/commercial mocks do not count as that flow. | Strong fit for user-owned action. A mocked funding segment can coexist with a separate qualifying live flow; it does not automatically disqualify the entire project. |
| [Hedera](https://ethglobal.com/events/ethonline2026/prizes/hedera) | Agentic payments: up to three teams at $2,000 each. | Hosted x402 service settled through Blocky402 and a real paid request end to end. | Existing implementation helps, but the paid result must have a clear job. HCS alone does not satisfy this track. |
| [1inch](https://ethglobal.com/events/ethonline2026/prizes/1inch) | Aqua: $2,500 / $1,500 / $1,000. | Meaningful Aqua/SwapVM position and token-transfer execution; local forks permitted. | A generic swap quote is insufficient. A possible $500 increase over a Hedera individual award alone is weak justification for a major rewrite. |
| [Arc](https://ethglobal.com/events/ethonline2026/prizes/arc) | Fresh DeFi or Agentic Economy: $1,667 each. Launch category separately offers $2,500 / $1,000. | Working Arc/USDC flow; Agentic Economy requires Agent Stack. Launch has mainnet-readiness obligations. | Choose only with a concrete role and a feasibility plan. Do not silently turn a testnet project into a mainnet launch. |

Assuming one top award per sponsor, Graph + Privy + Hedera totals $7,000; Graph + Privy + 1inch totals $7,500. These are conditional sums, not probabilities, guarantees or confirmed stacking permission. Competitor quality and judges' preferences are unknown. The useful comparison is qualification certainty, remaining work, live proof, and how well all three serve one story.

If retaining Hedera for a consumer direction, test a service that provides a useful historical comparison, constrained analysis, or monitoring result beyond the free query. Explain what was bought and what changed. Charging for the same data twice does not establish value. If no useful paid job emerges, either change the third sponsor or choose the paid-tool audience honestly.

## Repository implications after the team chooses

The latest chat work improves presentation, including evidence attached to receipts and screen-reader announcements. It does not settle product scope. The welcome screen still introduces spending and a paid snapshot; Graph presentation emphasizes cheapest borrowing; the system prompt still frames controlled spending. See [the team brief](../../team-brief.md), [opening screen](../../../apps/web/src/components/stream/empty-state.tsx), [Graph summary](../../../apps/web/src/components/stream/graph-summary.tsx), and [agent instructions](../../../apps/server/src/turn.ts).

For candidate A or B, the next vertical slice needs earning-oriented data and model context, a clear cost/exit explanation, and an actual baseline for monitoring. Independently of audience, resolve uncertain settlement handling and balance-preserving pause semantics before promising reliable automation. Do not spend another iteration only polishing a story the team has not chosen.

## Meeting outputs and proposed tests

Leave the meeting with one product sentence, one recruitable first user, one complete demo journey, exactly three sponsors, named owners, and an acceptance test for each dependency. Record disagreements rather than manufacturing consensus.

Proposed lightweight gates, to be agreed by the team:

- Observe 3–5 target users on the same task. In a first pass, aim for at least 3 to explain where return comes from and how to exit without coaching. This checks comprehension, not market size.
- Compare the relevant outside option. Ask for their last real attempt and current workaround before pitching Froggy.
- Collect a real provider quote for one proposed funding/withdrawal route, or explicitly scope the iteration to a practice flow.
- Prove the chosen financial operation and an over-limit refusal. Reload during a pending operation; retry without duplicate payment; pause without destroying balances.
- If a paid result is central, test whether users would request it again for a decision they actually face. “Cool demo” is insufficient.
- If users want the explanation but not a wallet, investigate a learning/monitoring product; do not label those users failures or force funding into onboarding.

## Research provenance and corrections

Grok was run through the installed CLI using `grok-4.6`, with native `x_keyword_search`, `x_semantic_search`, and `x_thread_fetch` calls visible in its session events. Initial audit showed **14 distinct post IDs requested via thread fetch**, with overlaps between conversations. Fetches return subsets of replies, not exhaustive threads. Do not interpret that as fourteen independent customers. The [original research prompt](grok-prompt.md) is included for reuse.

Codex's independent lane contains 24 labelled records: 23 directly opened pages and one search-index-only historical lead. A record can contain multiple speakers; vendor pages and anecdotes establish different things. Follow-up checks added the sponsor pages and Grok's consequential web sources. No user interviews or funded product tests were conducted.

Coordinator checks and corrections:

| Claim/source | Check | Treatment in this synthesis |
| --- | --- | --- |
| X autonomy, fee and LP examples | Direct opens attempted for several canonical X links; cache misses or 403 prevented independent rereading. Native fetch requests are auditable, but post bodies remain Grok-reported. | Useful leads and viewpoints; no decisive numerical or market claim rests solely on them. |
| Small-trade fee example | Grok's initial draft mixed a percentage with an inconsistent dollar fee. | Grok re-fetched and marked it disputed; excluded from our calculations. Use provider quotes and explicit hypothetical math instead. |
| x402 #2833 / #2887 | Both opened; third-party proposals. | Evidence of a design concern, not adopted standards or independently validated businesses. |
| x402 #2840 | Opened; issue currently closed. | Historical seller complaint, not evidence of an ongoing outage. |
| Coinbase MCP FAQ | Opened; supports human-set caps, email recovery and seller-dependent refunds. | Does not establish every extra restriction in Grok's first draft. |
| Privy card docs / bank announcement / prize rules | Opened and compared. | Separate GA card flows, Bridge onboarding, sandbox limits and qualifying live integration. |
| Modern Retail checkout article | Opened; reports an implementation retreat and continuing discovery value. | Does not prove all agent shopping failed or that consumers never want checkout automation. |
| Pine Labs P3P | Official announcement opened. | A published India-specific example, not proof of broad adoption or that India is the only consumer market. |
| Legal interpretation from X-only lead | Not adequately verified for jurisdiction/product distinction. | Excluded; no legal conclusion drawn. |

The remaining uncertainty is primarily demand and execution feasibility, not a shortage of broad agent-wallet commentary. The next useful evidence should come from the chosen users and one complete flow.

## Handoff validation

The Grok CLI research and targeted correction runs both completed. Local document links and required artifacts were checked. `bun run check:fast` and `bun run check` passed against the shared checkout at verification time; Turbo reused cached workspace checks. Research Markdown is excluded by the repository formatter, so its links and structure were checked separately. No application code was changed by this research task and no browser suite or funded integration was rerun. Concurrent frontend work remains owned by the other coding agent.
