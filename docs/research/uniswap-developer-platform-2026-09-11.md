# Uniswap Developer Platform: what it gives Froggy beyond quotes

11 September 2026. Web research plus a read of the repo. Nothing was edited, bought or signed up for. Every claim is tagged **[verified]** (read from a primary source or probed with curl) or **[inferred]** (my reading of the evidence, or a secondary source).

## The question

"Can Uniswap give us meme-token surfacing, or search on an address's history, for easy access?"

**Short answer.** Partly, and only for the first half. The Uniswap Trading API that `apps/server/src/trading/uniswap.ts` already calls has one discovery endpoint we do not use, `GET /tokens?sort=volume_24h|tvl&chainId=…`, which ranks tokens by 24h volume or TVL on Base (8453) and Robinhood Chain (4663) and attaches Uniswap's own safety classification and buy/sell tax. It has **no** token search by name, no "new pools", no price history, no webhooks, and no wallet activity or portfolio endpoint; the only per-address read is `GET /orders?swapper=` and it covers UniswapX gasless orders only, never Classic swaps. Address history has to come from an indexer: Pinax's Token API (the successor of The Graph Token API) on Base, the community Uniswap subgraphs on Base through the Graph client Froggy already ships, or Blockscout on Robinhood Chain. "Brand new pools" is cheapest read straight from the v4 `PoolManager` `Initialize` logs with the poller Froggy already has for Pons.

## What we have today (repo)

- `apps/server/src/trading/uniswap.ts`: `POST /quote` and `POST /check_approval` at `https://trade-api.gateway.uniswap.org/v1`, `x-api-key: UNISWAP_API_KEY`, Classic routing, `hooksOptions: V4_NO_HOOKS`, Base and Robinhood Chain (router 2.1.1 only on 4663). The `x-agent-info` header is not sent.
- `apps/server/src/trading/birdeye.ts`: `market_search` (Birdeye `/defi/v3/search` and `/defi/v2/tokens/new_listing`) and `token_inspect` (`token_overview` + `token_security`; security returns 401 on Robinhood on our plan).
- `apps/server/src/trading/launch-chain.ts`: a bounded `getLogs` poller over the Pons factory with canonical-block checks; `watch_launches` in `trading/services.ts` samples Birdeye listings or those logs every 30 s.
- `packages/graph/`: a Graph gateway client (`GRAPH_API_KEY`, `gateway.thegraph.com/api`) with a freshness gate and a pinned Messari lending registry. Nothing Uniswap-shaped is queried yet.
- No `FEEDBACK.md` exists and `README.md` has no Uniswap pointer (grep on 11 Sep). Both are hard qualification items for the prize.

## 1. What the Developer Platform actually is [verified]

Uniswap Labs' Developer Platform went live on 16 April 2026: dashboard-issued API keys, an API playground, the LP (liquidity) endpoints and an "AI toolkit" of coding-agent skills. Its pricing sentence is "The API is free, there are no subscription fees or per-call charges, even as you scale." The FAQ adds a default of **6 requests per second per key**, raisable through the dashboard help button, and **no sandbox**: testnets are called on the production host. One OpenAPI document (`/v1/api.json`, title "Token Trading", 31 paths) covers swapping, UniswapX orders, LP, chained plans, EIP-5792/7702/4337 encoding and utilities; a single key is what the dashboard issues, so I take the same `UNISWAP_API_KEY` to cover all of it [inferred: the docs never say "one key for all"].

The `ChainId` enum includes both **8453 and 4663**. Supported-chains notes: Base has Universal Router 2.0 and 2.1.1; Robinhood Chain has 2.1.1 only and returns an error if 2.0 is requested (exactly what `supportsUniswapChain` encodes). The blog says "18 chains", the supported-chains page lists 25 including testnets.

## 2. Endpoints and products

| Name | What it gives | Chains | Auth | Pricing / limits | Status | Source |
|---|---|---|---|---|---|---|
| `GET /tokens` | Token list; `sort=tvl` or `volume_24h` returns the top `limit` (1–1000, default 100) tokens "ranked across the requested chains", one entry per chain; `sort=default` is tokens.uniswap.org (chainId/limit ignored, includes Solana rows); `sort=bridgeable`. Fields: name, address, chainId, symbol, decimals, logoURI, `extensions.safetyInfo{safetyLevel: verified/info/blocked, safetyDescription, buyFee %, sellFee %}`, `bridgeInfo`. "Never returns 404": empty `tokens` is 200. | enum incl. 8453, 4663 | x-api-key | free, 6 rps | In the OpenAPI; the docs page `api-reference/get_tokens` 404s and the FAQ still says "we do not offer an endpoint to query all tokens which are tradable" [verified both; treat as soft-launched] | api.json, FAQ |
| `GET /swappable_tokens` | Bridgeable destinations for a `tokenIn` on a chain | as above | x-api-key | free | GA | api.json |
| `GET /orders` | UniswapX orders filtered by `swapper`, `filler`, `orderStatus`, ids, time sort, cursor, `limit` max 20 | Base (X v2+v3), Robinhood (X v3) | x-api-key | free | GA | api.json, supported-chains |
| `GET /swaps` | Status of **known** `txHashes` / `userOpHashes` + `chainId`. Not a history. | all | x-api-key | free | GA | api.json |
| `POST /lp/pool_info` | State of up to 20 pools by token pair (fee/tickSpacing/hooks) or by reference: tick, sqrtRatioX96, liquidity, reserves (V2, best-effort V4), hook address. Lookup only, no listing. | V2/V3/V4 | x-api-key | free | GA | api.json |
| `POST /lp/create|increase|decrease|claim_fees` | Unsigned LP transactions; caller must supply `nftTokenId`; no "positions for wallet" read | see `/supported_chains` `actions` | x-api-key | free | GA (Apr 2026) | LP guide |
| `POST /permissions` | Whether a token is KYC-permissioned for a wallet (+ kycUrl) | all | x-api-key | free | GA | api.json |
| `GET /supported_chains` | Chains with contract addresses, `protocols` (V2/V3/V4/UniswapX) and `actions` (SWAP/LP) | – | x-api-key (401 without) | free | GA | probe 11 Sep |
| `POST /plan`, `/margin/*`, `/swap_4337` | Chained cross-chain plans; margin endpoints are marked internal | – | x-api-key | – | plan: new; margin: internal | api.json |
| `x-agent-info` header | Optional JSON `{decision_origin: autonomous|human_mediated, integration_name, version}` on every endpoint; analytics-only, never changes the response; ≤1024 ASCII bytes; no wallet or user ids | all | – | – | GA | api.json |
| Subgraphs (v2/v3/v4) | GraphQL over pools, swaps, tokens, day data, positions. Uniswap's docs list **mainnet ids only** and say explorer deployments "are not official deployments and may not be actively maintained by Uniswap Labs" | Base: community `Uniswap V3 Base` `FUbEPQw1…cXdrNS`, `Uniswap V4 Base` `2L6yxqUZ…GsmJUZ` (v0.0.3, publisher 0x1080…, explorer says "updated 2 years ago"). **Robinhood: none on The Graph Network**; the registry lists `robinhood` with `subgraphs: []`, substreams/firehose only | Graph gateway key (have) | Graph query fees (have x402/pay-per-query path) | community | subgraph docs, registry JSON |
| Pinax Token API (was The Graph Token API; thegraph.com/token-api now 308s to pinax.network) | REST: `/v1/evm/swaps` (filters `caller`, `transaction_from`, `user`, `sender`, `recipient`, `input_contract`, `output_contract`, `protocol=uniswap_v4…`, time/block), `/v1/evm/transfers` (`from_address`/`to_address`), `/v1/evm/balances`, `/v1/evm/pools` (`factory`, `protocol`, tokens), `/v1/evm/tokens`, `/v1/evm/holders`, `/v1/evm/pools/ohlc` | `network` enum: mainnet, base, arbitrum-one, optimism, polygon, bsc, avalanche, hyperevm, unichain. **No Robinhood** | JWT bearer or `X-Api-Key` from app.pinax.network (a new account; not the Studio key) [inferred] | Free plan $0 with $25/month included usage, 3 keys; overage $0.15–$2.00 per 10k API requests; "100 req/s" free rate limit appears in search only | GA (API v3.21, Jul 2026) | api.pinax.network/openapi, pricing page |
| Blockscout PRO API | Etherscan-style `module=account&action=txlist|tokentx|tokenbalance` and REST v2 `/4663/api/v2/addresses/{addr}/transactions`, `/token-transfers` | Robinhood 4663 (chain_id param) | free key from dev.blockscout.com, required on every tier | Free 5 rps; Builder 15 rps $49; Pro 30 rps $199 | GA; the direct instance `robinhoodchain.blockscout.com` served a Cloudflare challenge to curl, so use `api.blockscout.com` | docs.blockscout.com/robinhood-api, probe |
| Goldsky / Ormi hosted subgraphs | Deploy the open-source `Uniswap/v4-subgraph` yourself; Goldsky says Uniswap AMM events on Robinhood are "indexable from genesis" and that Uniswap itself reads Robinhood data through Goldsky (30 Jul 2026) | Robinhood, Base | own account | not stated on the page | GA | Goldsky blog |
| Etherscan V2 (Basescan) | `txlist`/`tokentx` by address, `chainid=8453` | Base | key | 5 calls/s, 100k/day shared across chains; July 2026 cuts to free tier [search snippet, not read] | GA | docs.etherscan.io (not read) |
| CCA / Liquidity Launchpad | Continuous Clearing Auction contracts that seed a v4 pool at the cleared price; live on Base since 22 Jan 2026 | Base (Robinhood not stated) | on-chain | gas | GA; **no API or indexer** for listing auctions in the docs | CCA docs |
| Uniswap AI (`Uniswap/uniswap-ai`, MIT) | 6 plugins / 11 skills for **coding agents** (swap-integration, v4-security-foundations, viem-integration, swap-planner, liquidity-planner, cca configurator/deployer, dca/index/copy-trade, permissioned pools); `npx skills add Uniswap/uniswap-ai`; llms.txt / llms-full.txt. "Skills are build-time workflows … not a runtime service." Only MCP server: `cca-supply-schedule` inside the CCA plugin. `uniswap-driver` "token discovery" = web search + deep links to app.uniswap.org | – | – | – | active (230 stars) | repo, docs overview |

## 3. Surfacing meme tokens

What Uniswap itself can say [verified]: which tokens have the most 24h volume or TVL on a chain (`/tokens`), whether Uniswap flags a token `blocked`/`info`/`verified` and what buy/sell fee it detected, and the live state of a pool you can name (`/lp/pool_info`). What it cannot say: newly created pools, listing time, volume spikes, price change, holders. The app's Explore/trending page runs on an internal gateway that is not a developer product; I found no public offer of it [inferred].

Ranked by ease for a paid-per-call agent tool, Base and Robinhood both mattering:

1. **PoolManager `Initialize` logs by RPC** [verified addresses and event]. v4 `PoolManager` is `0x498581ff718922c3f8e6a244956af099b2652b2b` on Base and `0x8366a39cc670b4001a1121b8f6a443a643e40951` on Robinhood; the event is `Initialize(bytes32 id, address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)`. `launch-chain.ts` already does bounded `getLogs` with canonical-block and code-hash checks against the Pons factory; the same shape gives "pools created in the last N blocks, paired with USDC/WETH, hooks address shown" on both chains with **no new provider**. Quicknode RPC is already configured. Caveat: provider `getLogs` block-range caps (the third-party write-up hit a 10-block cap on a free Alchemy tier).
2. **Birdeye, already wired**: `new_listing` and search on both chains; the cheapest volume/price-change signal we have. The gap is only that it is not Uniswap-branded.
3. **Uniswap `/tokens?sort=volume_24h`**: one call, same key, free, gives a Uniswap-native "what is moving" list plus safety flags. Good for the demo and the prize narrative, weak for *new* memes because ranking favours established tokens; whether Robinhood returns a non-empty ranked list is unknown until called (empty is a 200).
4. **Pinax `/v1/evm/pools?network=base&protocol=uniswap_v4`** and `/pools/ohlc`: structured, but Base only and needs a new account.
5. **Community v4 Base subgraph** through `packages/graph`: `pools(orderBy: createdAtTimestamp)` and `poolDayDatas` [inferred: `createdAtTimestamp` is in the v3/v4 subgraph schema, not shown in the docs examples]; unmaintained per the explorer and useless on Robinhood.
6. **CCA auctions** are the Uniswap-native "launch" surface, but there is no API; you would index `AuctionCreated`-type events yourself. Real work.

## 4. Search on an address's history

No Uniswap API returns an address's Classic swap history or LP positions [verified from the OpenAPI: `/swaps` takes hashes, LP endpoints take an `nftTokenId` you must already know]. `GET /orders?swapper=0x…` is the one per-address read and it lists **UniswapX** orders only. Options:

- **Base**: Pinax `/v1/evm/swaps?network=base&transaction_from=0x…&protocol=uniswap_v3,uniswap_v4` returns decoded swaps per address, and `/transfers?from_address=` and `/balances` complete a portfolio view. Alternatively the community v3/v4 Base subgraphs via the existing Graph client (`swaps(where: {origin: $addr})` [inferred field name from the subgraph schema]).
- **Robinhood**: Blockscout PRO `txlist`/`tokentx` with a free key, then decode Universal Router (`0x8876…0904`) or SwapRouter02 (`0xcaf681…5cb2`) calls ourselves; or deploy `Uniswap/v4-subgraph` to Goldsky. Nothing turnkey.
- Neither path uses `UNISWAP_API_KEY`; the prize story for this tool would be "Uniswap swaps read back", not "Uniswap API".

## 5. What counts for the Uniswap Foundation prize

[verified from the ETHGlobal page and the feedback form]. The track is "Build on or integrate any part of the Uniswap stack, including the Uniswap API, the Uniswap AMM (v2, v3, or v4), CCA…". Qualification: public repo, `FEEDBACK.md`, the Developer Feedback Form linking it, README pointers to "the relevant contracts and lines of code". The Trading API integration qualifies on its own; the resources list points at the Uniswap AI repo and the form asks "Is this an AI/agentic project" and "hardest aspect of building agentic apps on Uniswap", so an agent wallet is squarely what they want to hear about. No judging rubric is published.

Strengthens the entry, cheapest first: send `x-agent-info` (`decision_origin` honest per call: `autonomous` for Froggy-initiated, `human_mediated` for a person-approved swap); surface `/tokens` safety info in `token_inspect`; a receipt that cites `route[].protocol` v4 and the pool id; an LP or `pool_info` read; Unichain (130) is in the enum but not our chain; CCA or a hook is a separate project, not a weekend add.

**FEEDBACK.md**: there is no official template; the form fields are the outline. Three public examples read: `Ryad2/liquid_OB` (ETHGlobal Lisbon, Jul 2026: Project / Integration scope / Materials reviewed / What was clear / Friction / Suggested improvements / Product feedback / Public verification links), `A1igator/rebalance` (ETHOnline 2026, Uniswap v3 direct on Robinhood: Integration exercised / What worked / Concrete friction and suggestions, with an honest status line saying the form was not yet sent) and `wildanrhmn/gantry` (v4 hook: friction "in the order it was hit", with time cost per item). Froggy's concrete, already-verified friction to record: `/tokens` exists in the OpenAPI but its docs page 404s and the FAQ denies it; api-reference pages redirect to `llms.mdx` paths that 404 for machine readers; router 2.0 errors on Robinhood; `slippageTolerance` is a percent while everything else we hold is bps; `permitAmount` defaults to `FULL`; "18 chains" vs 25 on the chains page; no sandbox; no address history; hook routes must be excluded to stay verifiable. Remember the nomination cap: `docs/plan/SPONSOR_TRADING_APIS.md` notes Uniswap would replace one of the three selected partners.

## 6. Uniswap for agents in 2026

Verified: the seven skills of 21 Feb 2026 grew into the `uniswap-ai` plugin set above; they help an engineer write the integration, they do not run inside the product. The runtime-side offer is exactly one header, `x-agent-info`, plus llms.txt. There is no hosted Uniswap MCP server, agent SDK or agent API; the third-party MCPs found (`kukapay/uniswap-trader-mcp`, `uniswap-price-mcp`) are unofficial. `/plan` (chained cross-chain execution) is the newest API surface and the one most likely to be pitched to agents next [inferred].

## What this means for Froggy

**S (under 2h): `uniswap_tokens` + attribution.** New read tool on the `market_search` pattern: `GET /tokens?sort=volume_24h|tvl&chainId=<8453|4663>&limit=<n>`, returning symbol, address, `safetyLevel`, `buyFee`, `sellFee`, logo; same `UNISWAP_API_KEY`, free, 6 rps. Also add `x-agent-info` to every Uniswap call in `uniswap.ts`. Needs: an adapter next to `birdeye.ts` with the bounded-fetch and schema discipline, a price row in `environment.trading.prices`, a loud stub, a first live call to learn whether Robinhood's ranked list is empty, and a README line pointing at the file. This is the cheapest thing that both answers "what is moving on Uniswap" and gives the FEEDBACK.md a second endpoint to talk about.

**M (under a day): `pool_radar`, new v4 pools from `Initialize` logs.** Generalise `ponsLaunchReader` into a PoolManager reader for Base and Robinhood (addresses above), filter to pools paired with USDC/WETH and `hooks == 0x0` (or show the hook address as a warning), enrich each hit with `/lp/pool_info` and Birdeye overview, and plug it into `watch_launches` as a third source. Needs: the event ABI, `getLogs` range handling against Quicknode's cap, a `membership: "poolmanager_log"` value, tests with recorded logs. No new account. This is the honest meme-surfacing tool on both chains and the strongest "v4" claim we can make without writing a hook.

**L (more than a day): `address_history`.** Base via Pinax `/v1/evm/swaps` + `/transfers` + `/balances` (new Pinax account, free plan, Base only); Robinhood via Blockscout PRO (`txlist`/`tokentx`, free key, 5 rps) with our own Universal Router calldata decoding, or a self-deployed v4 subgraph on Goldsky. Needs: two provider accounts (owner action), a normalised history schema, per-call prices, and a clear receipt note that Uniswap's own API contributes only `/orders?swapper=`. Worth it for the product, not for the prize.

## Verified versus inferred

Verified: everything from `api.json`, the FAQ, supported-chains, deployments, LP guide, CCA and Uniswap AI docs pages, the launch blog, the feedback form fields, the ETHGlobal prize page, the Graph networks registry, Pinax OpenAPI and pricing, Blockscout's Robinhood page, the three FEEDBACK.md files, and the two curl probes (401 without key; Cloudflare on the Blockscout instance). Inferred: one key covers all endpoints; `/tokens` being soft-launched; Explore data not being offered; subgraph field names `createdAtTimestamp`/`origin`; Pinax needing a separate account; Etherscan limits (search snippet only); `/plan` as the next agent surface.

## Sources

- https://trade-api.gateway.uniswap.org/v1/api.json (OpenAPI, read with jq)
- https://developers.uniswap.org/docs and `…/llms.mdx/docs/trading/swapping-api/faqs`, `…/supported-chains`, `…/uniswap-ai/overview`, `…/ecosystem/subgraphs/overview`, `…/ecosystem/subgraphs/guides/v4-query-examples`, `…/liquidity/overview`, `…/liquidity/liquidity-provisioning-api/integration-guide`, `…/liquidity/liquidity-launchpad/concepts/cca`, `…/protocols/v4/deployments`, `…/protocols/v3/deployments/v3-robinhood-chain-deployments`
- https://blog.uniswap.org/uniswap-developer-platform-is-live
- https://developers.uniswap.org/hackathon-feedback
- https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation
- https://github.com/Uniswap/uniswap-ai, its `docs/OVERVIEW.md`, and `packages/plugins/uniswap-driver/README.md`
- https://networks-registry.thegraph.com/TheGraphNetworksRegistry.json; https://thegraph.com/docs/en/supported-networks/robinhood/
- https://thegraph.com/explorer/subgraphs/2L6yxqUZ7dT6GWoTy9qxNBkf9kEk65me3XPMvbGsmJUZ and `…/HNCFA9TyBqpo5qpe6QreQABAA1kV8g46mhkCcicu6v2R`
- https://api.pinax.network/openapi; https://app.pinax.network/docs/api/; https://pinax.network/pricing
- https://docs.blockscout.com/robinhood-api
- https://goldsky.com/blog/robinhood-chain-data-live-on-goldsky
- https://dev.to/quant001/fmz-web3-in-practice-riding-the-robinhood-chain-wave-build-a-uniswap-v4-new-pool-radar-step-by-5io
- FEEDBACK.md examples: github.com/Ryad2/liquid_OB, github.com/A1igator/rebalance, github.com/wildanrhmn/gantry
- Search snippets only (not read): docs.etherscan.io rate limits; coinfomania on the Feb 2026 skills launch
