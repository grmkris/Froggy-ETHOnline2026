# Included research and source-specific failures

The two September 12 token reports failed because Froggy's RPC reader rejected valid 358,480-byte responses against its 256,000-byte limit. Each paid task had already settled $0.01. The generic error hid that local limit. Indexer coverage, a chain transport failure and a token security observation must remain distinct.

Basic bounded reads are included in Froggy and use the app's provider credentials. Composite research remains a separately priced service. Included reads have per-person and app request limits, a concurrency limit, bounded pagination/output, and short-lived caches. These are public research observations; they never change spending authority or provide signing evidence.

General subgraph research follows discovery, gateway schema inspection, then a schema-checked query. `packages/graph` may depend on `graphql` to parse and validate those queries. The hosted discovery MCP returns authoring SDL; Graph Node generates the executable query/filter schema. The adapter therefore decodes gateway introspection with Effect Schema and constructs its validation schema from the actual fields and types. Only queries are accepted: explicit bounded list sizes, no aliases/fragments, bounded depth and projected cardinality. `_meta` is requested automatically when supported. A different deployment is refused; missing freshness/network/publisher identity remains unknown. The specialized standardized lending reader stays available.

Token API is Pinax's indexed service, also sold through The Graph Market. A Subgraph Studio key is not a Token API credential. `PINAX_API_KEY` uses `X-Api-Key`; `GRAPH_MARKET_TOKEN` uses Bearer authentication. On September 12 the token-holder endpoint returned 401 without an x402 payment offer despite advertising x402 discovery. Missing credentials return unavailable; there is no automatic payment around that response. Public Polymarket discovery/books, Hyperliquid market snapshots, DefiLlama discovery/yields and the configured Hedera mirror are independent integrations.

Ordinary composite research can use explicitly indexed holders. Execution readers do not receive that adapter; trading predicates continue requiring reconstructed own-RPC evidence. Independent cohort/holder/screen failures preserve other observations. Chain identity and the pinned head remain prerequisites.

RPC log responses retain the 256,000-byte limit. Oversized ranges split into non-overlapping inclusive subranges, with a whole-call deadline, request count and aggregate log count bound. Single-block overflow remains a failure. Only allowlisted reads retry transient 429/503 responses, at most twice; submissions never use those retries. Errors expose method, category, request sequence and numeric code, without credentials or provider response text.

Hosted task polling waits on the server. Browser task handoff looks up the existing `browse:<toolCallId>` key only from accepted conversation history and only for the current owner. Saved status and a bounded summary enter the prompt as untrusted evidence. A failed or paused task is never described as completed merely because the approval card exists. The concise response policy applies to ordinary, Telegram, scheduled and paid-browser turns, including turns with specialized instructions.

No database migration, new signing rule, wallet permission or financial policy change is required.

## Verification on September 12

The patched reader returned all 592 unique logs from the exact failed Base range (`0x30cf8cc`–`0x30cfac0`) in five HTTP requests, recovering from two 429s. A sorted Graph pool scan exceeded the 15-second deadline; bounded factory reads succeeded twice at blocks 25964041 and 25964042 with changing volume/TVL values. Gateway timestamps and deployment IDs were preserved. These provider observations are evidence of adapter behavior, not an endorsement of indexed economic values.

Live adapters returned public network coverage, Hyperliquid BTC markets, Polymarket event discovery and ordered books, DefiLlama protocols/yields, and Hedera account/token data. Authenticated Token API reads could not be verified without a Pinax/Graph Market credential; the unauthenticated holders route returned 401 without a payable challenge. No diagnostic created a service task, signed a transaction or moved funds.

The two original $0.01 service tasks have distinct recorded Hedera settlements, and both remain marked paid/not refunded. This change does not rewrite those records or issue a refund.
