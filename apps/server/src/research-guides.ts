import { Schema } from "effect";

export const ResearchGuideInput = Schema.Struct({
  topic: Schema.Literals([
    "ethereum",
    "subgraphs",
    "tokens",
    "prediction",
    "perpetuals",
    "defi",
    "hedera",
  ]),
});
const guides = {
  ethereum:
    "Identify the network and exact address with address_lookup. EOA, delegated EIP-7702 EOA and separate smart account are different identities; use returned capabilities. Read chain state at a named block. Use indexers for history and RPC for current state. Missing logs, a reverted optional metadata method or provider failure do not prove an unsafe token. Research never authorizes signing; use trade_capabilities and the app approval flow for execution.",
  subgraphs:
    "Use graph_discover by protocol name or exact contract plus Graph network ID. Search ranking does not establish an official publisher or liquidity. Inspect graph_schema, then object/input/enum types as needed, then graph_read. Select explicit fields and first: 1..50 on every list; maximum depth 6. Verify the deployment and _meta block. Network can remain unknown on keyword hits; do not infer it from a name. graph_query remains the specialized standardized lending reader. A schema mismatch is not a missing token.",
  tokens:
    "Use research_capabilities and research_read networks, then wallet_assets, token_holders, token_transfers, token_pools or token_swaps with exact address and network. For swaps and EVM pools, read both input and output sides separately; one page is directional. Enumerated assets and top holders are indexed coverage, not an exhaustive current ledger. Preserve pagination, indexed timestamp and stale/unknown markers. Raw token amounts need verified decimals. Never interpret unavailable as zero. Buy token_research only for the composite launcher/cohort/holder/security report. A missing source should leave other observations usable. Indexed concentration is not reconstructed execution evidence.",
  prediction:
    "Use research_read prediction_search to discover active Polymarket events and outcomes. Use an exact outcome token ID from that result for prediction_book. Outcome price is distinct from a guaranteed probability; inspect spread, depth, resolution rules and close time before conclusions. prediction_activity is indexed historical data and may need Pinax credentials. These tools grant no trading access.",
  perpetuals:
    "Use research_read perp_markets for Hyperliquid mark price, funding and open interest, specifying the exact coin. Historical perp_activity, perp_open_interest and perp_liquidations depend on indexed provider coverage. Preserve units and funding interval; never annualize a funding rate without its interval. Open interest is not spot volume or available depth. Preview data and unknown freshness must be labeled. Research availability does not imply a supported leveraged trade.",
  defi: "Use research_read defi_protocols for protocol/chain discovery and defi_yields for bounded pool comparisons. Compare chain, TVL, variable APY, base/reward components and asset exposure. Retrieval time is not freshness of all constituent observations. A listed yield is not an executable deposit quote. For lending detail use graph_query; verify addresses against official sources and use trade_capabilities for supported actions.",
  hedera:
    "Use research_read hedera_assets with a numeric account ID for HBAR and HTS holdings from the configured Mirror Node. Report the network and the mirror balance timestamp. A continuation link means token enumeration is incomplete. HTS raw units require token decimals. An EVM address and a numeric account ID require verified mapping; do not invent one. Read access grants no transfer or bridge authority.",
};
const sources = {
  ethereum: [
    "https://eips.ethereum.org/EIPS/eip-7702",
    "https://docs.privy.io/recipes/react/eip-7702",
  ],
  subgraphs: [
    "https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/",
    "https://thegraph.com/docs/en/subgraphs/querying/graphql-api/",
  ],
  tokens: [
    "https://api.pinax.network/openapi",
    "https://thegraph.market/token-api",
  ],
  prediction: ["https://docs.polymarket.com/market-data/discover-markets"],
  perpetuals: [
    "https://api.pinax.network/openapi",
    "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api",
  ],
  defi: ["https://api-docs.defillama.com"],
  hedera: ["https://docs.hedera.com/hedera/sdks-and-apis/rest-api/accounts"],
};
export const researchGuide = (input: typeof ResearchGuideInput.Type) => ({
  v: 1,
  topic: input.topic,
  revision: "2026-09-12",
  text: guides[input.topic],
  sources: sources[input.topic],
  authority:
    "Research workflow only. Spending and execution remain controlled by the server and human approvals.",
});

export const RESEARCH_RESPONSE_POLICY = `
Answer concisely by default: lead with the result, then up to three useful facts and the next action. Usually 80–150 words; use more only when requested or needed to explain evidence. Avoid repeating balances, mandate details, tool IDs or retry narratives unless relevant.
Read research_guide for the subject when useful. Basic bounded research_read and graph_schema/graph_read are included in Froggy; upstream usage is app-funded. Prefer these before proposing a paid composite report. Never claim a dataset or execution route exists without capabilities and a returned observation.
Separate observed facts from hypotheses. Report the actual provider failure category; do not turn an RPC response limit into an outage or a simulation error into a gas-credit diagnosis. Unavailable is not zero or a clean security screen.
A task ticket is not a completed result. Poll the existing task with service_status; do not create a replacement purchase for pending or failed work. If a browser task was run separately, retrieve its saved status/result before answering, and say when the result is unavailable. Do not infer success from the approval card.
`;
