# Agent research and market data

Status: proposed implementation plan. Researched 12 September 2026; runtime changes are not implemented by this document.

The goal is for Froggy to answer Ethereum and market questions with the right data, a short useful answer, and recoverable task state. Prioritize The Graph subgraph discovery and schema-aware queries plus the Graph/Pinax Token API. Keep additional providers focused on demonstrated coverage gaps.

## What the code and recent conversations establish

- `apps/server/src/turn.ts` supplies the shared web/Telegram prompt. It says both “Be brief” and “Narrate what you are about to do before you do it.” Intermediate prose accumulates into long answers. Ordinary chat has no explicit output cap here; paid browsing sets 2,048 output tokens. Scheduled jobs can replace the prompt through `deps.instructions`.
- `apps/server/src/skill.ts` renders a skill for external agents connecting to Froggy. Installing a coding-agent SKILL.md does not automatically change Froggy's hosted runtime.
- `packages/graph/src/discovery.ts` already searches The Graph's hosted MCP by keyword or indexed contract. `packages/graph/src/client.ts` only executes a standardized lending query. The prompt also tells the agent to use Graph only for lending. This is an application limitation.
- `positions` describes Ethereum inventory and ERC-4626 previews but accepts a broader network input; recent runs unsuccessfully called it for Base and Solana. The observed zero SOL balance does not establish zero SPL token balances.
- `service_status` accepts integer `waitMs`; recent web and Telegram runs had failed calls and succeeded when it was omitted. Failed saved inputs were null, so the agent's claim that a serializer coerced numbers is not yet a diagnosis.
- Composite research awaits launcher, cohort and holders before GoPlus. Exceptions in those paths can abort the report before independent facts are returned. Unknown launch blocks can cause a bounded holder scan to begin at block zero. This explains a structural weakness, not the exact cause of the two production RPC errors.
- A browser task navigated Mimovrste and failed with a model-stream error. The parent chat subsequently said it never started. Research guidance alone cannot fix this missing task-state handoff.

## Live discovery checks

Three unauthenticated calls through the existing `liveSubgraphDiscovery` completed with `stubbed: false`:

| Search | Reported matches | Example returned candidates |
| --- | --- | --- |
| Uniswap | 478 | Uniswap V3, Uniswap V3 Polygon, uniswap-v4-base-3 |
| Polymarket | 20 | Polymarket PnL, Polymarket Orderbook, Polymarket Open Interest V2 |
| ENS | 194 | ENS, ENS reclaim deposit subgraph; also unrelated substring matches |

These are search candidates, not verified official deployments or successful data queries. Keyword results omit network metadata and contain duplicate deployment hashes. Inspect manifests, publisher provenance, schemas and indexed heads before selecting a candidate. Search ranking and lifetime query fees are not correctness guarantees.

Pinax's public `GET https://api.pinax.network/v1/networks` also returned HTTP 200. It listed Ethereum, Base, Arbitrum One, Optimism, Polygon, BSC, Avalanche, HyperEVM, Solana and Unichain, with per-category indexing timestamps. At this observation Base categories were around 20:42 UTC; BSC balances were around 17:10 UTC while its transfers and DEX categories were around 20:42 UTC. Freshness must be measured per dataset, not assumed for an entire provider. This check did not query authenticated balances or holders.

## 1. Short answers and accurate task handling

Create one shared response policy composed into interactive, Telegram and scheduled prompts:

- Default answer: outcome first, up to three useful facts, material unknowns, and a next action only when needed. Target 60–120 words for normal replies and 150–250 for requested research. Explicit requests for detail override these targets.
- No narration before routine reads or every poll. One short progress message for a long task or visible browser action; another only when the situation materially changes.
- Put full evidence, tool errors, task IDs and receipts in existing detail surfaces. Preserve the concise reason and actual cost in chat when relevant. Show generated artifacts through their existing result surface.
- Do not repeat the entire wallet, mandate or prior explanation. Do not ask whether to retrieve the already requested result.
- Add a provider-compatible output budget after measuring ordinary replies and tool-call sizes. Do not truncate a streamed answer or cut off transaction arguments to enforce word targets.

For polling, reproduce the emitted tool JSON with the configured model. Prefer a bounded default wait implemented by the server and a task-id-only runtime tool, so the model need not choose milliseconds. Keep transport compatibility where external clients already use optional waiting. Return useful bounded validation errors instead of generic errors, and preserve failed inputs sufficiently to diagnose them.

Pass linked browser/service task IDs and current durable state into the parent turn. A failed child must produce “started, then failed at X,” with the last useful result. Check the existing child before re-offering or repurchasing it. Terminal failure replay cannot prove whether a provider was retried or repaired.

## 2. Runtime research skills

Add a small, versioned, bundled runtime skill catalog with a bounded `research_guide(topic)` reader. Expose short descriptions in the base prompt; fetch only the guide relevant to the task. This avoids putting every provider manual into every turn. Generate external-agent guidance from the same maintained content where applicable.

Proposed guides:

| Guide | Procedure |
| --- | --- |
| Ethereum/token research | Resolve chain and exact asset; separate wallet, token and pool; use free identity reads first; distinguish token balances from yield positions; compare liquidity, activity and holder evidence; cite time and missing facts. |
| Graph research | Search by protocol or contract; deduplicate; verify chain and provenance; inspect schema; build a bounded query; check index freshness; cite deployment and block. |
| Token API research | Discover supported network/dataset; choose balances, holders, transfers or pools; use bounded pagination; retain completeness and source timestamps. |
| Prediction markets | Resolve event, market and outcome IDs; distinguish order-book prices from settled trades; inspect resolution rules and liquidity; research availability and execution availability are separate. |

Sources reviewed:

- [ETHSkills](https://github.com/austintgriffith/ethskills), especially [indexing](https://ethskills.com/indexing/SKILL.md), plus candidate topics wallets, standards and DeFi building blocks. Repository revision observed: `06ea4efa08076ff04f6ca4945ef4a2ca881115b0`. The indexing guide is useful orientation, but static gas/price/address claims and blanket statements about historical RPC need current provider verification.
- [Pinax's official agent reference](https://api.pinax.network/skills.md), fetched successfully. Its endpoint selection and pagination guidance fits this runtime directly; use its OpenAPI contract to validate requests.
- [Polymarket's official agent skills](https://github.com/Polymarket/agent-skills), revision `91ee44ae113e958affd20cd505c6e9d9d6100e0b`. Use market-data guidance; check current documentation because the repository includes older SDK and collateral examples.
- [The Graph's skills](https://thegraph.com/docs/en/subgraphs/tooling/skills/) primarily teach building, optimizing and testing subgraphs. Use them for engineering our integration; write a smaller consumption guide for Froggy's runtime.

Write original concise Froggy guides with source links and reviewed revisions. Upstream skills are research references; they do not install signing clients, execute shell commands or change runtime authority. Skills describe existing callable capabilities and their limitations.

## 3. Complete The Graph workflow

The official [Subgraph MCP](https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/) supports search, schema inspection and deployment queries. Extend the existing integration to cover the entire workflow:

1. Keep `graph_discover`; add chain/provenance resolution, hash deduplication and clear ranking limitations.
2. Add `graph_schema` with bounded root fields and requested entity/type details. Resolve manifests through a configured provider path. Cache immutable schemas by deployment hash.
3. Add `graph_read` for read-only GraphQL against a selected deployment, retaining the existing lending operation for compatibility. Validate the GraphQL AST against the inspected schema. Limit query length, depth, aliases, pagination, total rows, response bytes and execution time; reject mutations, subscriptions and unbounded list fields.
4. Return results with deployment hash, actual network, indexed block, retrieval time, truncation and errors. Unknown freshness remains unknown. Permit historical research explicitly labeled as historical; do not relax freshness checks used by financial decisions.
5. Reuse the existing configured Graph transport and accounting. Discovery access does not imply query entitlement. For generalized queries, replace the current symbol-based payment deduplication key with a hash of deployment, normalized query, variables and applicable snapshot/cache scope. Different queries must not collide.
6. Update prompt and tool descriptions so DEX, ENS, NFT and prediction-market research can use discovery. Do not say “nothing was paid” solely because returned data failed schema validation.

Initial live acceptance: discover and read one non-lending DEX subgraph and one ENS or prediction-market subgraph, with explicit provenance and a returned indexing head. Validate current official protocol deployments before treating any search hit as trusted.

## 4. Add Token API as the standard indexed-data source

The [Graph/Pinax Token API guide](https://app.pinax.network/docs/guides/token-api) covers balances, transfers, holders and market data. Public documentation has inconsistent route examples and coverage counts, so implementation must use the current [endpoint catalog](https://app.pinax.network/docs/api), OpenAPI, live `/v1/networks`, and actual account entitlements.

Start with typed operations for wallet assets and token holders, then transfers and pools. Integrate holders into `token_research`; use indexed history instead of attempting broad RPC reconstruction for arbitrary tokens. Use direct RPC to check specific current balances or contract state. Preserve source time differences rather than implying all provider observations share one block.

Every section carries status, provider, network, source time/block, completeness, cursor/truncation and any bounded error. Holder concentration must state the denominator, exclusions and coverage; top-N indexed accounts are not automatically the complete economic ownership picture.

Handle independent research sections separately so unavailable holders do not erase market or security results. If the anchor network/block cannot be established, expose that failure honestly; strict trading gates still require their own valid evidence.

Use existing Froggy paid-service accounting for paid composite work. Prefer project credentials with known limits for the first integration; x402 is an option only after checking the real offer, supported payment network and receipt path. An existing Studio key is not assumed to be a Token API credential. No recurring service plan was purchased during this research.

## 5. Other markets and targeted alternatives

| Need | Recommended path | When to use another source |
| --- | --- | --- |
| Protocol history and custom questions | Graph discovery → schema → query | [Dune](https://docs.dune.com/api-reference/overview/introduction) for heavier historical SQL analysis; custom Substreams only when existing indexes cannot answer recurring questions. |
| Token inventory and holders | Pinax Token API | [Alchemy Portfolio](https://www.alchemy.com/docs/reference/portfolio-apis) for EVM inventory gaps; [Helius DAS](https://www.helius.dev/docs/das-api) for deeper Solana asset coverage. |
| Token market snapshots | Keep configured Birdeye; add Pinax pools/swaps | [DEX Screener](https://docs.dexscreener.com/api/reference) for pair discovery and a separately labeled market-data comparison. |
| DeFi TVL and yields | Graph for protocol-specific facts | [DefiLlama](https://api-docs.defillama.com/) for broader protocol/yield discovery; verify free vs Pro endpoint access. |
| Polymarket | [Official public discovery](https://docs.polymarket.com/market-data/discover-markets) and [CLOB prices/books](https://docs.polymarket.com/market-data/prices-order-books) | [Pinax prediction data](https://app.pinax.network/docs/prediction-markets) or verified subgraphs for indexed activity/positions. Settled-chain indexes do not replace a live order book. |
| Perpetual markets | Evaluate [Pinax Hyperliquid data](https://app.pinax.network/docs/perp-exchanges) | Its catalog marks this PREVIEW; measure coverage and freshness before exposing as reliable. |
| Hedera holdings | [Mirror Node REST](https://docs.hedera.com/api-reference/balances/list-account-balances) for account/token holdings | This adds research coverage; it does not add a Hedera-to-Base bridge. |

Use capability metadata to distinguish research, quotes, simulation and execution for each network. A market can be researchable even when Froggy cannot trade it. Unknown capability must not become “impossible everywhere.”

## Implementation order and acceptance

1. Short-answer policy, useful validation errors, polling simplification and task-state handoff. Replay anonymized versions of the two users' recent requests on both web and Telegram.
2. Graph discovery/schema/query vertical slice and bundled Graph research guide. Preserve lending behavior and payment isolation.
3. Pinax wallet/holder slice plus partial composite reports. Validate Base, Ethereum and Solana; explicitly label unsupported/stale datasets.
4. Prediction-market research and the remaining concise research guides. Add broader DeFi/Hedera coverage next; introduce backup vendors only for measured gaps.

Acceptance cases: bare EVM wallet; ambiguous token symbol; Base token with one failed source; Solana token holdings with zero SOL; unsupported network; stale index; duplicate Graph hashes; non-lending subgraph; public Polymarket discovery with no trading route; provider 429; malformed numeric tool input; pending and failed paid tasks; successful image artifact; child browser stream failure and parent follow-up. Check no duplicate purchases, no false success, no unsupported zero-balance claims, bounded outputs, concise replies and user isolation.

Run the repository checks and browser suite for implementation. Test the configured live model because scripted tool calls cannot prove argument quality or brevity. Live provider validation must record actual coverage, freshness, entitlement and billing; documentation and successful public discovery alone do not prove authenticated research works.
