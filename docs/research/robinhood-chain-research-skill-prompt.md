# Robinhood Chain research skill: a three-part prompt

Pasted 10 September 2026 from an X post by @563defi (9 September 2026, "One Prompt to Turn Codex into your Robinhood Chain Research Buddy"). Kept as research input for the Robinhood/Pons trading lane: it describes a due-diligence skill for Robinhood Chain (chain id 4663) that runs on public RPC, Sourcify and GeckoTerminal with no keys, and what a dRPC or CoinGecko key adds. Nothing below is Froggy code or a Froggy decision.

---

One Prompt to Turn Codex into your Robinhood Chain Research Buddy
If you aren't using AI as part of your research workflow in 2026, you are playing at a disadvantage. But good news, it's easy to get started. 
Literally copy and paste the three-part prompt below into Codex or Claude Code. It will create a reusable skill that can be your research buddy for all things @robinhoodcrypto. Congrats, you're now ahead of 90% of retail participants.
has saved me some trouble already
What it can do out of the box:
Interpret simple requests like “do DD on this token.”
Resolve the exact Robinhood Chain token, @ponsdotfamily launch, curve, pool, deployer, and fee recipient.
Reconstruct launches using transactions, receipts, event logs, and internal-call traces.
Detect atomic bundles, privileged buyers, tax exemptions, concentrated allocations, and rapid exits.
Screen minting, taxes, transfer restrictions, upgradeability, liquidity custody, and owner privileges.
Analyze bonding-curve progress, graduation, locked tokens, and Uniswap v4 migration.
Compare launches at equivalent lifecycle stages.
Reconstruct holder concentration when sufficient history is available.
Use GeckoTerminal for historical prices, volume, liquidity, and drawdowns.
Investigate deployers, connected wallets, prior launches, project claims, websites, and socials.
Clearly separate proven facts, concerning indicators, project claims, and missing evidence.
Produce a short answer or a validated, reproducible risk report.
API setup:
No keys are required for basic research using public RPC, Sourcify, GeckoTerminal, and other public endpoints.
A dRPC key is strongly recommended for historical state, internal-call traces, and deeper launch reconstruction. Load it with like $20 and you'll be good for a while.
CoinGecko, X, licensed market-data, or wallet-history keys can be added for richer pricing, sentiment, Stock Token comparisons, and deployer history.
Make it your own. Once you have this skill locally, add what makes sense for your workflow.
Tracking specific projects? Copy-paste their API docs to your AI and ask it to learn all about the project and make a real-time dashboard with alerts.
Do you want to make sure you aren't super late to an idea? Add a fomo API to see who's already shilling it.
Want a Solana or BNB version? Ask the agent to walk you through it.
Want it to be a scout? Ask it to help you set up a Telegram bot to alert you when prices/revenues/holders match specific cases.
Let me know what you end up using it for! Would love to hear feedback or suggestions on how to improve this basic version.
Copy-paste all three parts into your prompt to Codex/Claude Code:
PART 1:
Build a reusable agent skill named `robinhood-chain-research-analyst`.

Create the actual skill files, supporting references, configuration template, schemas, and working validation helpers. Do not merely describe a proposed skill. Use the skill format and installation conventions supported by the current environment, discovering them rather than assuming a personal filesystem path. Keep the package portable between compatible desktop and coding agents where practical. If the environment cannot create files, output the complete contents grouped by filename.

When using a native skill initializer, inspect the generated scaffold before replacing placeholders. Do not assume the scaffold contains an exact template string, and do not target the same file with multiple overlapping create/update operations in one patch. Recover from tool or platform-specific editing failures and validate the final filesystem state rather than treating a successful edit command as proof.

The finished skill must turn a general-purpose desktop agent into a configurable, evidence-bounded research analyst for Robinhood Chain. It must work without paid services by default and improve gracefully when the user supplies Alchemy, dRPC, CoinGecko, or DeFiLlama credentials.

Do not conduct a live investigation while building the skill. Use only synthetic fixtures or clearly labeled infrastructure checks.

## PURPOSE

The skill should help a user go from a Robinhood Chain address, transaction, protocol, asset, pool, wallet, or research question to a reproducible answer grounded in live onchain evidence.

It should answer questions such as:

- What is this contract or asset, and is it the exact requested target?
- Is the contract verified, proxied, upgradeable, pausable, mintable, or otherwise controlled?
- Which owners, roles, multisigs, timelocks, issuers, custodians, or privileged operators matter?
- Can transfers, trading, redemption, or settlement be restricted?
- Where is the liquidity, who controls the principal, and can ordinary holders sell at realistic sizes?
- How concentrated are ownership, launch allocations, liquidity positions, and treasury balances?
- Where do fees, revenue, collateral, reserves, and treasury assets go?
- For a tokenized real-world asset, what onchain and offchain rights does the holder actually have?
- Which issuer, custodian, oracle, bridge, sequencer, API, or legal dependency could change the conclusion?
- What is proven, strongly supported, inferred, unknown, or unavailable?

This is a research and due-diligence skill. It is not a trading bot, price-prediction system, generic safety score, legal opinion, investment recommendation, or substitute for a full smart-contract exploit audit.

## NETWORK BASELINE

Seed the skill with the following network configuration, but require it to verify current official documentation and the RPC-reported chain ID before relying on these values:

- Robinhood Chain mainnet chain ID: `4663`
- Robinhood Chain mainnet public RPC: `https://rpc.mainnet.chain.robinhood.com`
- Robinhood Chain mainnet explorer: `https://robinhoodchain.blockscout.com`
- Robinhood Chain testnet chain ID: `46630`
- Robinhood Chain testnet public RPC: `https://rpc.testnet.chain.robinhood.com`
- Robinhood Chain testnet explorer: `https://explorer.testnet.chain.robinhood.com`
- Native gas asset: ETH
- Architecture: EVM-compatible Arbitrum Layer 2

Never silently switch between mainnet and testnet. Never substitute Ethereum, Arbitrum One, or another EVM chain because a same-symbol or same-address token exists there.

## ZERO-KEY AND ENHANCED OPERATION

The skill must support these provider tiers.

### Tier 1: zero-key starter mode

Use, subject to availability and rate limits:

- Robinhood Chain public RPC for current state, blocks, receipts, calls, code, storage, and bounded log queries.
- Robinhood Chain Blockscout for contract discovery, verified source, ABI, transactions, and corroboration.
- GeckoTerminal public API for DEX, pool, liquidity, trade, and OHLCV discovery.
- Publicly available CoinGecko and DeFiLlama endpoints where authentication is not required.
- Public read-only Morpho and Lighter endpoints when supported, with protocol state corroborated against exact contracts or venue timestamps.
- Official Robinhood Chain and protocol documentation for architecture and claimed behavior.

Starter mode must remain useful when one or more optional services are unavailable. Rate limits, pruning, bot protection, caching, incomplete indexing, timeouts, and unsupported chains are coverage limitations, not findings about the target.

The provider health helper must distinguish at least `available`, `reachable_but_restricted`, `chain_mismatch`, and `unavailable`. An HTTP 401, 403, or 429 proves that a host responded but does not prove the API capability is usable; record the status class without leaking response bodies or credentials. Do not collapse bot protection or rate limiting into a generic offline result.

### Tier 2: configured research mode

Support credentials and endpoints through environment variables, never through committed files or report text:

- `ROBINHOOD_RPC_URL`: preferred Robinhood Chain RPC endpoint.
- `ROBINHOOD_ARCHIVE_RPC_URL`: optional archive endpoint.
- `ROBINHOOD_SECONDARY_RPC_URL`: optional independent corroboration endpoint.
- `ALCHEMY_API_KEY`: optional; construct the correct Robinhood Chain endpoint only after checking current provider documentation.
- `DRPC_URL` or `DRPC_API_KEY`: optional, depending on the provider's current endpoint format.
- `COINGECKO_API_KEY`: optional market and onchain DEX coverage.
- `DEFILLAMA_API_KEY`: optional paid API coverage.
- `X_BEARER_TOKEN`: optional reproducible X search coverage; without it, label public web results as search-visible narrative rather than representative sentiment.
- `TRADITIONAL_MARKET_DATA_API_KEY`: optional licensed equities/reference-market data, with configurable aliases.

Allow equivalent variable names to be mapped in user configuration. Redact credentials in commands, logs, cached artifacts, errors, and reports. Never print a complete credential-bearing URL.

Provider selection must be capability-based rather than brand-based:

- Use raw RPC as the authority for current onchain state.
- Prefer an archive-capable RPC for historical state and large historical log investigations.
- Use Blockscout for discovery and source/ABI retrieval, then verify material claims against deployed runtime and RPC evidence.
- Use GeckoTerminal or CoinGecko to discover pools and market activity, then bind findings to exact pool and token addresses.
- Use DeFiLlama for protocol-level context such as TVL, fees, revenue, yields, and category comparisons; do not treat aggregate dashboards as proof of contract-level behavior.
- If two providers disagree, preserve both observations, compare block/time bases, and leave the issue unresolved until reconciled.

Do not call cached REST data “real time.” Report the observation timestamp, known cache behavior when documented, and the pinned onchain block separately.

## PERSONALIZATION

Create a documented `config.example.yaml` or equivalent portable configuration template. It must be understandable to a non-developer and include sensible defaults such as:

yaml
analyst:
  style: concise
  risk_posture: conservative
  default_mode: focused
  audience: informed_retail

network:
  name: Robinhood Chain
  environment: mainnet
  expected_chain_id: 4663

research:
  focus:
    - identity_and_source
    - contract_controls
    - proxy_and_upgrade_risk
    - liquidity_custody
    - sellability_and_exit_depth
    - holder_concentration
    - fees_and_treasury
    - rwa_rights_and_redemption
    - external_dependencies
  exit_sizes_usd: [1000, 10000, 100000]
  include_historical_launch_analysis: when_triggered
  max_initial_runtime_minutes: 10
  max_initial_provider_requests: 30
  max_initial_provider_operations: 100
  max_failed_attempts_per_check: 2
  pons_default_selection: require_address
  sentiment_window_hours: 72
  social_sample_limit: 200

evidence:
  require_block_pin: true
  require_exact_address_binding: true
  allow_dashboard_only_claims: false
  preserve_raw_evidence: true

providers:
  primary_rpc_env: ROBINHOOD_RPC_URL
  archive_rpc_env: ROBINHOOD_ARCHIVE_RPC_URL
  secondary_rpc_env: ROBINHOOD_SECONDARY_RPC_URL
  use_public_rpc_fallback: true


Document every option. Let users change report depth, risk posture, focus areas, exit sizes, time budget, evidence requirements, and provider preferences without editing `SKILL.md`.

User instructions for a particular investigation take precedence over configuration defaults. The skill must say so explicitly.
PART 2:
OPERATING MODES

Implement three modes:

1. `focused`: Answer the requested question and investigate only dependencies capable of changing that answer.
2. `broad`: Screen every core risk surface, then deepen work only where evidence triggers it.
3. `formal`: Reconcile completed research into a durable report with an executive verdict, methodology, findings, evidence ledger, limitations, and reproducibility appendix. Do not repeat expensive research merely to change formatting.

If the user provides only an address, default to a short identity and control screen, then present the most decision-relevant next investigations. Do not force the user to understand RPC methods or contract internals before receiving value.

Treat `max_initial_runtime_minutes`, `max_initial_provider_requests`, and `max_initial_provider_operations` as execution ceilings, not descriptive metadata. Count HTTP round trips separately from individual RPC/API operations inside batches; batching reduces latency but does not make operations free. Whichever ceiling is reached first stops scope expansion. Answer with the strongest evidence already obtained, label unresolved items, and name the one or two next checks most likely to change the conclusion. Continue beyond a ceiling only when the user explicitly requests deeper work or one already-started check is necessary to avoid a materially misleading answer. Count retries and alternate endpoints, and do not retry the same failed check more than `max_failed_attempts_per_check` times.

## TARGET INTEGRITY AND BLOCK PINS

Every investigation must begin by creating a frozen target packet containing:

- A target kind and stable identity key. Support exact-address targets and scoped `transaction`, `protocol`, `market`, `network`, and `social_query` investigations without inventing placeholder addresses.
- User-provided network, address, transaction, asset, protocol, and question.
- Observed chain ID from `eth_chainId`.
- Checksummed target address where applicable.
- Name, symbol, decimals, and supply, including explicit unresolved states for missing or nonstandard metadata.
- Current block number, block hash, parent hash, and UTC timestamp.
- Runtime bytecode hash.
- Proxy, implementation, beacon, and upgrade-authority information when applicable.
- Candidate pools, related contracts, issuers, custodians, treasuries, bridges, and oracles.
- Requested mode, materiality rules, time budget, and known coverage limitations.

Bind all queries, evidence, caches, and conclusions to this packet. Reject malformed addresses, chain-ID mismatches, placeholder pins, conflicting target identities, and same-symbol substitutions.

For multi-chain dependencies, create an independent pin and target identity for each chain. Never present evidence from one chain as current state on another.

## EVIDENCE STANDARD

Use this evidence hierarchy for material claims:

1. Deployed runtime bytecode, raw RPC state, storage, calldata, successful receipts, correctly decoded logs, and balance deltas.
2. Verified source only after checking that it corresponds to the deployed runtime or resolved implementation.
3. Official protocol, issuer, custodian, bridge, oracle, or network documentation.
4. Explorer, CoinGecko, GeckoTerminal, DeFiLlama, and other indexed data as discovery or corroboration.
5. Secondary reporting and social content as context, clearly labeled and never treated as onchain proof.

Separate:

- Proven facts.
- Strongly supported conclusions.
- Inferences.
- Claims made by the project or issuer.
- Unknowns and unavailable checks.

Never turn an unknown, failed query, skipped check, or unavailable provider into a pass. Never fabricate a value to complete a report.

Preserve raw evidence and reproducible query parameters with credentials removed. Cache by provider, chain ID, address, block, method, and parameters. Record the observation time and whether the response represents current, historical, cached, or simulated state.

## ROBINHOOD CHAIN RESEARCH SURFACES

Create concise procedures for the following core surfaces, with deeper procedures in linked references loaded only when relevant.

### Contract identity, code, and control

Inspect runtime code, verified-source correspondence, proxy patterns, implementation slots, beacons, owners, access-control roles, multisigs, timelocks, guardians, pausers, minters, blacklisters, transfer agents, arbitrary-call paths, delegatecall, self-destruction assumptions, initialization state, and upgrade authority.

Distinguish immutable token logic from upgradeable wrappers, reward systems, routers, settlement contracts, issuers, and custodial layers surrounding it.

### Tokenized real-world assets

For stock tokens and other RWAs, keep these concepts separate:

- The onchain token.
- The referenced security or asset.
- The issuer and legal obligor.
- The custodian and claimed backing.
- Holder eligibility and jurisdictional restrictions.
- Transfer restrictions, allowlists, blacklists, freezes, seizures, and forced transfers.
- Oracle or pricing dependencies.
- Redemption rights, units, fees, timing, minimums, caps, settlement assets, and operational dependencies.
- Corporate actions, distributions, splits, dividends, voting, insolvency treatment, and claim priority.

A price reference or marketing statement does not create an enforceable claim. A custodian balance does not prove that every token is fully backed or redeemable. State exactly which rights are enforced by code, which depend on contracts or legal documents, and which remain unverified.

Do not provide jurisdiction-specific legal conclusions unless the user explicitly requests legal research and appropriate authoritative sources are available.

### Liquidity and sellability

Discover pools by exact address or complete pool key. Support Robinhood Chain DEX designs that are currently active rather than assuming a single venue. Include Uniswap v2/v3/v4-style analysis when detected.

Resolve pool tokens, fee tier, hooks where relevant, reserves or liquidity, LP ownership or position custody, approvals, lockers, and withdrawal authority. Separate canonical pools from side pools.

For sellability, find successful historical sells when available and obtain current read-only quotes at configured sizes. Report route, input, quote asset, expected output, fees, estimated price impact, per-unit degradation, timestamp, and block basis. A quote is not a realized exit, and a historical trade proves only historical execution.

Never sign or broadcast a trade. Transaction simulation may occur only on a verified disposable local fork using synthetic accounts, and must be labeled counterfactual.

### Supply, holders, and launch

Reconcile total supply and material balances. Separate circulating holders, pools, protocol custody, treasuries, lockers, burn addresses, issuers, custodians, bridges, and non-circulating allocations. State the denominator and exclusions for every concentration statistic.

Trigger full Transfer replay or launch-cohort accounting when indexed holder data conflicts with supply, when early concentration is material, or when the user asks a historical question. Account for tokens whose balances can change without ordinary Transfer events.

Do not equate a wallet reaching zero with a sale, or a transfer to a router with a completed trade. Prove sales using successful execution, pool mechanics, receipts, logs, and asset balance changes.

### Fees, treasury, collateral, and proceeds

Map fee bases, rates, denominations, splits, recipients, configurable routes, claim authority, escrow, treasury custody, and subsequent transfers.

When material, reconcile each asset as:

opening balance + inflows + explained adjustments
= outflows + closing balance + bounded unexplained difference

Account for wrapping, bridging, burns, gas, reverted transactions, and commingling. Stop exact attribution when assets become commingled. An exchange deposit does not prove a sale, fiat withdrawal, beneficiary, or profit.

### Chain and external dependencies

Identify material dependencies on the Robinhood Chain sequencer, Arbitrum rollup architecture, Ethereum data availability and settlement, canonical or third-party bridges, oracles, keepers, APIs, custodians, issuers, and offchain operators.

Separate token-specific findings from network-wide assumptions. Do not characterize a provider outage or RPC failure as a protocol vulnerability.

## EFFICIENT EXECUTION

Start with inexpensive checks that can change the conclusion:

1. Verify chain, address, metadata, bytecode, and block pin.
2. Identify architecture, related contracts, privileges, and obvious dependencies.
3. Discover liquidity, market activity, holders, and treasury surfaces.
4. Run targeted historical work only when triggered.
5. Reconcile conflicts before writing the verdict.

For focused work, do not exhaustively enumerate every ABI method, role event, holder, source bundle, legal-document translation, or historical log merely because it is available. Follow only control paths and dependencies that can change the requested answer. Check the remaining time and request budget before each scope expansion. Prefer a bounded useful result at the configured ceiling over an open-ended investigation.

Batch independent RPC reads when safe, paginate and range-limit log queries, apply exponential backoff with jitter, cache immutable results, and deduplicate identical runtimes by code hash. Respect documented provider limits.

If authorized subagents are available, permit bounded parallel lanes only after freezing the same target packet for every lane. Require each lane to return evidence rows, findings, limitations, and unresolved questions rather than a separate narrative report. The skill must work sequentially when subagents are unavailable or not authorized.
PART 3:
OUTPUT STANDARD

Lead with a direct, conditional answer to the user's actual question.

For broad or formal reports, rate these separately rather than averaging them into one safety score:

- Target identity and source correspondence.
- Contract controls and upgrade risk.
- Transfer and compliance restrictions.
- Canonical liquidity custody.
- Side-pool removal risk.
- Sellability and executable depth.
- Current ownership concentration.
- Historical launch integrity.
- Fees, treasury, collateral, and custody.
- RWA backing and redemption rights.
- External and chain dependencies.
- Development quality and disclosure accuracy.

For every material finding include severity, likelihood, confidence, coverage, and time basis. Use bounded language such as:

- “No current executable path was found at the pinned block.”
- “Sellable at the tested sizes under the quoted state.”
- “Strongly supported by the following runtime, storage, and receipt evidence.”
- “Unknown because archive history was unavailable.”
- “The issuer claims X; enforceable holder rights were not established.”
- “NO-GO under the user's stated requirement for unrestricted transferability.”

Never issue an unconditional “safe” verdict or imply that a favorable review predicts returns.

Maintain a finding-to-evidence ledger containing:

- Finding ID.
- Exact proposition.
- Chain ID and address.
- Block pin or transaction hash.
- Artifact, RPC method, endpoint class, or query.
- Decoding basis.
- Evidence type.
- Confidence and alternatives.
- Coverage limitations.
- Conditions that would make the finding stale.

End with the strongest contrary evidence, unresolved questions, and the specific new evidence that could change the conclusion.

## PACKAGE STRUCTURE

Use a concise `SKILL.md` with valid name and description frontmatter. Keep detailed or conditional procedures in linked reference files loaded only when relevant.

At minimum, create equivalents of:

- `SKILL.md`
- `config.example.yaml`
- `references/network-and-providers.md`
- `references/target-integrity.md`
- `references/contract-controls.md`
- `references/liquidity-and-sellability.md`
- `references/rwa-rights-and-redemption.md`
- `references/supply-launch-and-flows.md`
- `references/evidence-and-reporting.md`
- `references/pons-launch-analysis.md`
- `references/token-threat-analysis.md`
- `references/stock-token-price-parity.md`
- `references/morpho-markets.md`
- `references/narrative-and-social-intelligence.md`
- `references/wallet-intelligence.md`
- `references/protocol-contract-review.md`
- `references/lighter-perps.md`
- `references/dex-market-analytics.md`
- `references/market-history.md`
- `references/bridging.md`
- `references/liquidity-provision-risk.md`
- `references/protocol-economics.md`
- `references/pre-deployment-risk-memo.md`
- `schemas/target-manifest.schema.json`
- A provider health-check helper.
- A report/manifest consistency validator.
- Synthetic fixtures and tests.
- A short user-facing setup guide with zero-key and enhanced setup instructions.

Choose a portable implementation language already available in the environment. Avoid large dependency trees. Document all dependencies and exact commands needed to run tests.

