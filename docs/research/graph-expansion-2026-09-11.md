# Expanding Froggy's use of The Graph — research, 11 Sep 2026

Owner's ask: "let's explore what how we can expand graph, like maybe search for appropriate subgraphs and then consume them? or maybe on demand subgraph build and deployment for specific usecases? idk let's brainstorm".

Every claim below is tagged **[verified]** (read from a live endpoint or an official page today) or **[inferred]** (a reasonable reading, not proven). No account was created, no key was used and nothing was paid; the live probes were unauthenticated HTTP calls.

## Where Froggy is today

- `packages/graph/src/registry.ts` pins twelve Messari standardized lending deployments (Aave v2/v3, Compound v2/v3, Spark, Euler) on Ethereum, Arbitrum, Polygon and BSC. `client.ts` runs one `markets { rates { rate side type } }` query across all of them through `gateway.thegraph.com/api/subgraphs/id/{id}` with a Studio key, fails closed on a two-hour freshness gate, and can pay per query through `/api/x402/subgraphs/id/{id}` with the person's Privy wallet on Base. `graph_query` in `apps/server/src/tools.ts` is the only agent-facing Graph tool, and it answers one question: cheapest borrow / best supply for a symbol.
- `docs/evidence/GRAPH.md` says plainly: "Subgraph MCP for discovery is not used; discovery is the pinned registry, reviewed in code." `docs/plan/PRIZE_AUDIT_FABLE51.md` row "Compose two or more products" promised "The Subgraph MCP (`https://subgraphs.mcp.thegraph.com/sse`) for discovery, documented in SKILL.md, plus the gateway". That promise is currently unmet, and it is the cheapest gap to close.
- Froggy already trades on Robinhood Chain (`PONS_NETWORK = "eip155:4663"`, a Uniswap v4 hook deployment documented in `docs/evidence/PONS_DEPLOYMENTS.md`). Nothing indexes those pools today, which is the strongest concrete case for "on-demand subgraph for a specific use case".

## What the tracks ask for (verbatim, `docs/prizes.md`)

**Best Use of Composable or Standardized Graph Products ($5,000).** "Either compose two or more of The Graph's products, or build meaningfully on a standardized schema (for example the Messari Standardized Subgraphs). Consume live data from a Graph provider, for example Subgraph Studio for Subgraphs or The Graph Market for Substreams. Mocked, local-only, or static datasets do not qualify. Simply querying one Subgraph with no composition or standardization does not qualify; consider the Best AI Use Case track instead. Authoring or extending a Standardized Subgraph, or contributing a reusable composable Substreams module, is in scope. Make the standards leverage clear: show what became easier because a shared schema or composed product was used."

**Best AI Tooling or AI Use Case with The Graph (From Scratch) ($5,000).** "Use The Graph as a load-bearing part of the project: either the AI tooling targets The Graph's products or AI Suite, or the agent/app uses The Graph (Subgraphs, the Subgraph MCP, or Substreams) as its source of blockchain data. Consume live data from a Graph provider, for example querying Subgraphs with an API key from Subgraph Studio, or streaming Substreams via The Graph Market. Mocked, local-only, or static datasets do not qualify. Do meaningful work with the data: reasoning, decisions, automation, or a natural-language interface, not just printing a raw query result." The description adds: "Featured Substreams challenge: use the Substreams SKILLs to go from a single natural-language prompt to a working, deployed Substreams pipeline."

## Findings

### 1. The Subgraph MCP — what it is, verified by talking to it

The hosted server is `https://subgraphs.mcp.thegraph.com/sse` (SSE transport; `POST /messages?sessionId=…`). There is no `/mcp` streamable-HTTP path (404) **[verified]**. `initialize` reports `subgraph-mcp` version `0.1.1` and ships long server instructions that force a discovery sequence: keyword search, then 30-day query counts, then pick the highest-volume deployment, then schema, then query **[verified]**.

Nine tools **[verified from `tools/list`]**: `search_subgraphs_by_keyword` (display-name match, ordered by signal), `get_top_subgraph_deployments` (top 3 deployments indexing a contract on a chain, ordered by query fees; chain names are Graph network ids, `mainnet` not `ethereum`), `get_deployment_30day_query_counts`, `get_schema_by_subgraph_id` / `_by_deployment_id` / `_by_ipfs_hash`, and `execute_query_by_subgraph_id` / `_by_deployment_id` / `_by_ipfs_hash`.

Three things the docs do not tell you:

- The docs (`.../subgraph-mcp/claude/`) say to send `Authorization: Bearer GATEWAY_API_KEY` from Subgraph Studio. Today every tool, including `execute_query_by_subgraph_id`, answered **with no Authorization header at all**: a `_meta` query against Froggy's Aave v3 id returned block 25954712 **[verified]**. Whether this is a deliberate free lane or a server-side default key is not documented; treat it as a convenience for discovery and keep sending the Studio key for anything that matters **[inferred]**.
- Discovery works for Froggy's chains. `get_top_subgraph_deployments(chain: "base", contract_address: <Uniswap v4 PoolManager>)` returned three Base deployments with `queryFeesAmount` (top one `QmbBGpoHyMH8…`, ~25.3k GRT of fees); `get_schema_by_ipfs_hash` on it returned a full Uniswap v4 schema (`PoolManager`, pools, swaps, hooks) **[verified]**. `search_subgraphs_by_keyword("Moonwell")` returned ten Base subgraphs with ids and current ipfs hashes **[verified]**.
- `get_deployment_30day_query_counts` returned `total_query_count: 0` for a deployment that has 25k GRT of lifetime query fees, so the volume signal the server's own instructions call "NON-OPTIONAL" is currently empty **[verified]**. Rank by `queryFeesAmount` / signal instead, and say so in the evidence.
- The `execute_query_by_deployment_id` tool wants a `0x…` deployment hash; Froggy's registry ids (`JCNWRypm…`) are subgraph ids and work with `execute_query_by_subgraph_id` **[verified]**. `registry.ts` calls them "deployment ids"; they are not, which matters if the receipt claims immutability (a subgraph id resolves to whatever the current version is). Pinning the `Qm…` ipfs hash per entry and querying `/api/deployments/id/{Qm…}` would make the "exact indexed artefact" claim true **[inferred from gateway URL conventions; not probed]**.

Rate limits: none published. A `token-api.mcp.thegraph.com` host does not resolve today **[verified]**; the Token API MCP page 404s and the Token API itself now lives at Pinax (see 4).

### 2. Programmatic discovery without the MCP

The MCP is a thin wrapper over the **Graph Network subgraph** on Arbitrum (Explorer id `DZz4kDTdmzWLWsV373w2bSmoar3umKKH9y82SUKr5qmp`), which can be queried through the same gateway with the same Studio key **[verified: Explorer page; not queried]**. Useful entities: `subgraphs(where:{metadata_:{displayName_contains_nocase:…}})` with `currentVersion { subgraphDeployment { ipfsHash } }`, and `subgraphDeployments` with `ipfsHash`, `signalledTokens`, `queryFeesAmount`, `manifest { network }`, `indexerAllocations`, `deniedAt` **[verified from schema.graphql]**. The schema has **no parsed contract-address field**; a commented-out `DataSource` entity says "TODO - add when we have the ability to parse data sources" **[verified]**. The MCP's contract lookup therefore uses an internal index, and re-implementing it means fetching manifests by ipfs hash and grepping `dataSources[].source.address` — doable, slow, and not worth it when the MCP already does it for free.

A community alternative, `PaulieB14/subgraph-registry`, classifies 15,330 subgraphs by domain, protocol type and network (Base 1,841) with a reliability score, served as MCP, REST and JSON-LD, and accepts $0.01 USDC x402 on Base **[verified from README]**. Community, not a Graph product; it would not count as "one of The Graph's products" for the composition bullet **[inferred]**.

### 3. On-demand subgraph build and deploy

- `graph init --product subgraph-studio --from-contract <address> --network <id> [--abi <file>] <slug>` scaffolds a subgraph indexing every event of a contract; the CLI fetches the ABI from Etherscan-style explorers or takes `--abi`. `graph add <address>` appends a data source **[verified]**. `graph auth <deploy key>` then `graph deploy <slug>` pushes to Studio; the version label is prompted (`--version-label` avoids the prompt) **[verified]**.
- Studio's Free Plan is 100,000 queries/month; the deployment query URL is "limited to 3,000 queries per day"; Studio hosting itself is free and costs start only when publishing to the network (GRT, curation; docs suggest 3,000 GRT of self-curation to attract indexers) **[verified]**.
- **Blocker:** the subgraph must first be created in the Studio UI to obtain a slug and deploy key; no public API creates one **[inferred from docs and search; nothing found]**. So "the agent deploys a subgraph on demand" is really "the owner pre-creates N slots, the agent fills one". That is still honest if the receipt says so.
- Time to first index is not documented **[verified: absent]**. Starting from `--start-block` at the contract's deployment block on Base or Robinhood (100 ms blocks) keeps a small-contract backfill to minutes, but this is the single riskiest unknown for a demo **[inferred]**.
- `robinhood` and `base` are both listed as subgraph network ids in the Graph docs **[verified]**. Whether a Studio deploy on `robinhood` is served by Studio's indexer (vs. only the decentralized network) is not stated on the page **[verified: absent]**.
- The Graph's own AI Suite for authoring is the `subgraphs-skills` plugin (`subgraph-dev`, `subgraph-optimization`, `subgraph-testing`) and the `substreams-skills` plugin (nine skills incl. hosted-sink deployment and Graph Market auth); the latter is the "one prompt to a deployed pipeline" challenge and reports "100% build/run, 12/14 byte-match" in its own evals **[verified]**. Neither ships a "subgraph from ABI" generator beyond `graph init --from-contract`.
- Goldsky ("Instant Subgraphs", Robinhood supported, "fully compatible with The Graph protocol") and Envio HyperIndex (chain 4663 native) deploy faster, but the tracks say "Consume live data from a Graph provider, for example Subgraph Studio … or The Graph Market"; a Goldsky-hosted subgraph is not a Graph provider and would read as swapping the sponsor out **[inferred; the text supports it]**.

### 4. Substreams and the Token API on Base and Robinhood Chain (4663)

- Substreams endpoints for Base: `base-mainnet.streamingfast.io:443` and `base.substreams.pinax.network:443`; Arbitrum One on both providers. Robinhood is **not** in the published endpoint table **[verified]**, but a registry package `uniswap-v4-robinhood@v0.1.2` (author PaulieB14; modules `map_events`, `map_enriched`, `map_totals`, `map_stock_events`, `db_out`; starts at block 9,070, the PoolManager deployment) runs with `substreams run uniswap-v4-robinhood@v0.1.2 db_out -e robinhood` and authenticates via thegraph.market **[verified from its registry page]**. `robinhood.substreams.pinax.network:443` and `mainnet.robinhood.streamingfast.io:443` both accept TLS **[verified]**, so a Robinhood endpoint exists; that it serves Froggy's Pons pools is **[inferred]** (same PoolManager? not checked).
- Auth is a JWT from The Graph Market (`substreams auth`, `SUBSTREAMS_API_TOKEN`); the Market's free tier is "7M blocks & 5 GiB egress included — no credit card required" **[verified]**.
- Substreams are gRPC streams, not request/response. For an agent tool the realistic shapes are (a) a sink into Postgres/ClickHouse the agent then queries, (b) a Substreams-powered subgraph, or (c) a short bounded `substreams run` from a recent start block, decoded and summarised. (c) is the only one that fits in hours.
- **Token API** (`token-api.thegraph.com` is a CNAME to Pinax; REST at `https://api.pinax.network/v1/…`, version 3.21.1) gives balances, transfers, holders, swaps, NFTs and metadata. Networks indexed today: mainnet, base, arbitrum-one, optimism, polygon, bsc, avalanche, hyperevm, unichain, solana — **no 4663** **[verified from `/v1/networks`]**. Endpoints return 401 without a JWT; the key comes from the Pinax / Graph Market sign-in **[verified]**.
- Standardized Substreams (`streamingfast/substreams-chain-modules`: DEX, stablecoins, prediction markets, tokenized assets) and Pinax's `substreams-evm` primitives are the "compose reusable packages" reference; an ERC-4626 module is named in the track text as a wanted contribution.

### 5. What composes, and what a judge can check

The gateway x402 lane is real and unchanged: an unauthenticated POST to `/api/x402/subgraphs/id/…` returns 402 with a `payment-required` header for `eip155:8453`, 10000 units of USDC `0x8335…2913` to `0x79DC…FcCB`, `eip3009`, 300 s timeout **[verified today]**. The Graph's 18 Aug 2026 blog frames exactly Froggy's loop: "Subgraph MCP queries the Subgraph on [the agent's] behalf … the agent signs a USDC payment". Load-bearing evidence a judge can accept is the same thing the repo already does for lending: a receipt that names the product, the id, the block, and the transaction, plus a screen where the second product visibly changed what the agent did.

## Products

| Product | What it gives Froggy | Chains (Base / 4663) | Auth / cost | Status | Source |
| --- | --- | --- | --- | --- | --- |
| Gateway subgraph queries | Any published subgraph by subgraph id, deployment id or ipfs hash | Base yes; 4663 listed as a subgraph network | Studio key (100k/mo free) or x402 $0.01 USDC on Base | In use [verified] | thegraph.com/docs/en/subgraphs/providers/subgraph-studio/introduction/ |
| Subgraph MCP `subgraphs.mcp.thegraph.com/sse` | Search by keyword or contract, schema, query, fee/signal ranking | Base yes (probed); 4663 untested | Docs say Studio key; worked without one today | Live, v0.1.1 [verified] | github.com/graphops/subgraph-mcp |
| Graph Network subgraph | Raw discovery: signal, fees, allocations, manifest network | n/a (Arbitrum-hosted index of all subgraphs) | Studio key | Live [verified: schema] | github.com/graphprotocol/graph-network-subgraph |
| Subgraph Studio + graph-cli | Build from ABI, host, 3,000 q/day dev URL | Base yes; `robinhood` id exists | Free; slot must be created in UI | Scriptable after slot exists [verified] | thegraph.com/docs/en/subgraphs/developing/deploying-publishing/using-subgraph-studio/ |
| Substreams via Graph Market | Streams of decoded events, e.g. Uniswap v4 swaps | Base yes; Robinhood host exists, package exists | JWT; 7M blocks + 5 GiB free | Live [verified endpoints] | docs.substreams.dev, substreams.dev/packages/uniswap-v4-robinhood/v0.1.2 |
| Token API (Pinax) | Balances, transfers, holders, swaps by REST | Base yes; **4663 no** | JWT; free tier per Pinax | Live, v3.21.1 [verified] | api.pinax.network/v1/networks |
| Agent0 / ERC-8004 subgraphs | Agent identities, mcpEndpoint, feedback | Base `43s9hQRu…` | Studio key | Live [verified page] | thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0/ |
| Subgraph / Substreams Skills | Authoring help for an LLM | n/a | Free | Live [verified] | github.com/graphprotocol/subgraphs-skills, github.com/streamingfast/substreams-skills |
| Goldsky / Envio | Instant subgraph on 4663 | 4663 yes | Free tier | Not a Graph provider [inferred] | goldsky.com/chains/robinhood |

## Ideas for Froggy, ranked

1. **`graph_discover` — the Subgraph MCP as the second composed product (S, 2 h).** New tool: given a protocol name or a contract + chain, call `search_subgraphs_by_keyword` / `get_top_subgraph_deployments`, rank by `queryFeesAmount`, fetch the schema, and return candidates with ipfs hash, network and fees. Wire it so that `graph_query` can be pointed at a discovered deployment (a second standardized query shape, or the same lending shape against a discovered Messari deployment such as Moonwell Base, which the registry rejected on evidence and could now be re-checked live). Proves the "compose two or more products" bullet for the Composable track and "uses the Subgraph MCP" for the AI track; closes the PRIZE_AUDIT promise and the GRAPH.md "Not yet". Evidence: the MCP session id, the tool name, the ipfs hash chosen and the fee figure on the receipt. Blockers: none technical; send the Studio key even though today it is not required; do not show the 30-day counts (they read 0).
2. **Widen the standardized query to a second Messari family (S–M, half a day).** Messari publishes DEX AMM, Yield Aggregator, Bridge, Perpetuals schemas with the same `protocol / financialsDailySnapshots` conventions. Using discovery from idea 1 to find yield-aggregator deployments and running one `vaults { … }` shape across them turns "one query, six lending protocols" into "two standardized families, N protocols", which is the leverage the track text asks to be made visible. Blockers: each family needs the same probe-and-reject pass `registry.ts` documents.
3. **Pons on Robinhood Chain: one purpose-built subgraph (M, a day; L if indexing stalls).** `graph init --from-contract <Pons manager/hook> --network robinhood --abi …`, deploy to a pre-created Studio slot, then a `pons_pools` tool that reads swaps/liquidity for the pools Froggy trades and feeds the trade decision. This is the literal "on-demand subgraph for a specific use case" and gives Froggy a data source for a chain the Token API does not cover. Proves "authoring a subgraph" and load-bearing data for the AI track. Blockers: Studio slot creation is manual (owner step); indexing time on `robinhood` is undocumented; whether Studio serves `robinhood` at all must be probed before committing.
4. **Bounded Substreams read of Uniswap v4 swaps on Base or Robinhood (M).** `substreams run` of `uniswap-v4-robinhood` (or a Base v4 package) from `head-200` blocks through the Graph Market JWT, decoded into "last N swaps in pool X", surfaced as `recent_swaps`. Proves consuming Substreams from The Graph Market (a second product for the Composable bullet) and speaks to the Robinhood/Pons story. Blockers: a Market account and JWT (owner step); gRPC client in Bun or shelling out to the `substreams` binary; the Robinhood endpoint is inferred, not documented.
5. **Token API balances / transfers on Base (S).** A `token_balances` tool over `api.pinax.network/v1/evm/balances?network=base&address=…` for the person's wallet. Cheap, but Pinax-branded, no 4663, and weakly "The Graph" in a judge's eyes; only worth it as a third product alongside 1 and 4. Blockers: JWT (owner step).
6. **Substreams "one prompt to deployed pipeline" challenge (L).** Requires the hosted sink on StreamingFast infrastructure and the Substreams Skills; a separate submission shape from Froggy's. Not recommended this week.
7. **ERC-4626 or Pons composable Substreams module (L).** Explicitly rewarded, and a Pons event module would be genuinely new, but Rust, a package publish and an audience are more than the remaining time.

## Recommended path

Do idea 1 today: a `graph_discover` tool backed by the hosted Subgraph MCP, with the Studio key in the header, ranking by query fees, and every discovered deployment carried onto the receipt by ipfs hash. It costs nothing, needs no owner action, and turns the audit's promised composition into a verified one; then update `GRAPH.md`'s "Not yet" and let `graph_query` accept a discovered deployment so the composition is load-bearing rather than decorative. If a day is available after that, pursue idea 3 (Pons on `robinhood`) only after a ten-minute probe proves a Studio slot on `robinhood` indexes at all; otherwise take idea 4 with a Base v4 package, which has documented endpoints. Skip Goldsky and Envio for this bounty, and skip the Token API unless a third product is wanted for the story.

## Sources

- https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/ and `/claude/` (server URL, config, key from Studio)
- https://github.com/graphops/subgraph-mcp (tool list, SSE/stdio)
- Live probes of `https://subgraphs.mcp.thegraph.com/sse` (initialize, tools/list, five tool calls) and `https://gateway.thegraph.com/api/x402/subgraphs/id/…` (402 terms), 11 Sep 2026
- https://thegraph.com/blog/querying-blockchain-data-natural-language-mcp-skills/ (10 Jun 2026) and https://thegraph.com/blog/onchain-agent-infrastructure/ (18 Aug 2026)
- http://thegraph.com/docs/en/ai-overview/ (AI Suite: Subgraph MCP, Subgraph Skills, Substreams Skills)
- https://github.com/graphprotocol/graph-network-subgraph/blob/master/schema.graphql
- https://github.com/PaulieB14/subgraph-registry
- https://thegraph.com/docs/en/subgraphs/developing/creating/install-the-cli/ and http://thegraph.com/docs/en/subgraphs/developing/deploying-publishing/using-subgraph-studio/
- http://thegraph.com/docs/en/subgraphs/providers/subgraph-studio/introduction/ (Free Plan 100k queries)
- https://thegraph.com/docs/en/supported-networks/robinhood/ and `/base/`
- https://github.com/graphprotocol/subgraphs-skills and https://github.com/streamingfast/substreams-skills
- https://docs.substreams.dev/reference-material/chain-support/chains-and-endpoints.md and https://github.com/streamingfast/substreams/blob/develop/docs/how-to-guides/cli/authentication.md
- https://substreams.dev/ and https://substreams.dev/packages/uniswap-v4-robinhood/v0.1.2
- https://thegraph.market/ (free tier) and https://api.pinax.network/v1/networks, `/v1/version` (Token API networks, 401 without JWT)
- https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/ and `/agent0/`
- https://goldsky.com/chains/robinhood
