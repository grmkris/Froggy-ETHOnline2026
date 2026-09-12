# Robinhood Chain research capability

12 September 2026. What Froggy can and cannot answer about a token on Robinhood Chain (`eip155:4663`), what landed, and what to build next. Every claim here was established by calling the live endpoint on 10–12 September, not read from provider documentation; the check that produced each one is named so it can be repeated when a provider changes.

The prompt that started this is kept as a research note at [`docs/research/robinhood-chain-research-skill-prompt.md`](../research/robinhood-chain-research-skill-prompt.md). It describes an evidence-bounded due-diligence skill for Robinhood Chain: identity and source, contract controls, liquidity and sellability, holder concentration, fees and treasury, RWA rights. This document is the honest gap analysis against it.

## The short version

Froggy was already further into this than the prompt assumes. The Pons V2 deployments were pinned by address _and_ runtime hash, launch logs were read with reorg-safe cursors, and an archive-capable Robinhood endpoint was configured. Holder reconstruction, bounded `eth_getLogs`, GoPlus screening, a composite paid `token_research` op, Pools.trade venue detection, and fail-closed research predicates on trading rules landed on 12 September 2026. See [decision 0023](../decisions/0023-research-gated-rules.md).

**No API keys need to be bought** for the remaining free adapters (Sourcify, GeckoTerminal). See [Provider decisions](#provider-decisions) for what not to buy and why.

## What landed

| Change | Detail |
| --- | --- |
| Birdeye / Uniswap on Robinhood | Markets and ordinary pool quotes |
| `pons_token` | Free Pons launch state at one pinned block, including template fingerprint |
| `token_research` | Paid composite: launcher detection (Pons + Pools.trade), template, cohort, reconstructed holders, GoPlus |
| Bounded `eth_getLogs` | On `rpc_read` and inside research; span ≤ 10k blocks, ≤ 100 logs |
| Research-gated rules | Human attaches fail-closed predicates; only own-RPC bases may refuse signing. Pons: template, insiders, concentration. Uniswap on Base, Ethereum and Robinhood: concentration only. Entries only; exits are never gated |
| Venue adapters | Pons and Pools.trade on Robinhood; Clanker, Zora, Flaunch, Virtuals on Base (see `docs/evidence/`) |

`pons_token` reports, at one pinned block: whether the Pons V2 factory registered the token at all, its phase, curve address, deployer, creator fee recipient, creator tax, graduation threshold and buyback flag, then either the curve's reserves, sellable supply and fee basis points, or the graduated pool's key, price, tick and active liquidity. It also reports whether runtime bytecode matches the reviewed masked template.

It reads through its own function rather than `readPonsSnapshot`, which refuses exactly the states research cares about — a closed curve, a pool with no active liquidity, an unsupported phase. Those refusals are correct in front of the signer and wrong for research, where "this curve is closed" is the answer. The pool key and its hashing are imported from the execution path rather than re-derived, so a second encoding cannot drift from the one that gets signed. A changed dependency runtime hash stops the read instead of answering through a contract nobody reviewed.

Verified against Robinhood mainnet on four addresses: a curve-phase token, a graduated token, USDG, and an unrelated token, each reported correctly. Tests cover the dependency guard, the block pin and the stub. The happy path cannot be faked in a test, because passing the guard needs bytecode that hashes to the recorded runtime.

## What works today

| Question | How | Evidence |
| --- | --- | --- |
| Chain-pinned bounded reads | `rpc_read` | Verifies `eth_chainId` against the requested CAIP-2 before every read, which is the prompt's "never silently switch chains" rule |
| Pons launch state, curve or pool | `pons_token` | Four live addresses, above |
| Composite research | `token_research` | Launcher, template, cohort, holders, GoPlus at one block |
| Pons launch detection | `watch_launches` / `watch_status` | `TokenLaunched` logs on bounded block cursors, reorg-safe |
| Market cap, price, volume, new listings, trending | `market_search`, `token_inspect` | Live: YOLO overview; listings STUBO / VESSEL / WHADAR minutes old |
| Quotes on ordinary Robinhood pools | `quote_action` | Live USDG→WETH quote with approval information |
| Recent X sentiment | `x_search` supplier | Seven-day window, ten posts, labelled as claims |
| Any public URL | `x402_fetch` | Reaches free endpoints, but each is a human-approved purchase, so it is not a research loop |
| Explorer pages, rendered | `browse_task` and the browser tools | The only route past the Blockscout block, below |

### Chain facts worth not rediscovering

Measured on the public RPC (`https://rpc.mainnet.chain.robinhood.com`) and on the endpoint configured in `TRADING_RPC_ENDPOINTS` for `eip155:4663`:

- Blocks are about **0.1 s** apart — 10,000 blocks spanned 1,009 s.
- The **public RPC prunes historical state between 4,000 and 6,000 blocks**, roughly ten minutes. `eth_getBalance` at head−4,000 answered; head−6,000 returned `metadata is not found`. Any keyless tier of a research skill can read log history but not historical state.
- **Historical logs are complete on both endpoints.** `eth_getLogs` against the Pons factory answered at head−10,000,000 and returned an empty set at head−50,000,000, which is before deployment.
- **Our configured endpoint is archive-capable**: `eth_getBalance` at head−5,000,000 answers.
- **No internal-call traces anywhere.** The public RPC rejects `debug_traceTransaction` and `trace_transaction` as non-existent. Our endpoint reports `debug_traceTransaction` as gated behind a paid tier, and `trace_transaction` as _not available on ROBINHOOD_MAINNET_ at any tier.
- `alchemy_getAssetTransfers` and `alchemy_getTokenBalances` both answer on Robinhood.

## What does not work

### Holder count and distribution — landed in `token_research`

Birdeye's holder endpoint still answers `"Chain robinhood is not supported yet"`. Reconstruction pages `Transfer` logs via bounded `eth_getLogs`, sums balances, excludes venue custody addresses, and reconciles against `totalSupply()` at the same pinned block. Partial coverage and supply mismatch are reported, never rounded into an authoritative number. Rule gates require `basis: "reconstructed"` and a reconciled complete scan.

### Token security screening — landed (research-only)

**GoPlus** supports chain 4663 with **no key at all**. The adapter distinguishes observed / not indexed / unavailable. GoPlus never gates signing.

Birdeye cannot fill this: its `token_security` endpoint answers **401** for Robinhood on this plan. `token_inspect` therefore reports `security.status = "unavailable"` with no facts, which is the honest result — an absence of evidence, not a clean screen.

### Verified source and ABI — free, not built

**Sourcify** lists chain 4663 and returned `exact_match` on both creation and runtime for the Pons factory. Not every token is verified there: the graduated Pons token I checked returned `match: null`.

### Price, volume and liquidity history — free, not built

**GeckoTerminal** carries a `robinhood` network with live pools and token detail, free and without a key. Nothing else we have provides OHLCV or liquidity history. It is also how the non-Pons side of the chain becomes visible — the USDG/WETH 0.01% pool surfaced there first.

### Bounded `eth_getLogs` — landed

`rpc_read` allows `eth_getLogs` with a required address, span ≤ 10,000 blocks, ≤ 4 topics and ≤ 100 logs. Research uses the same helper internally; the model never drives the paging loop.

### Not easily fixable — stop trying

- **Blockscout.** `https://robinhoodchain.blockscout.com/api/v2/*` is behind a Cloudflare browser challenge. Without a User-Agent it answers 403; with a full browser User-Agent it answers **200 carrying a "Just a moment…" interstitial**, which is worse, because a naive check reads it as success. An API key will not help: Blockscout keys are rate-limit tokens applied behind the WAF. Sourcify replaces most of the reason we wanted it; the browser covers the rest.
- **Internal call traces.** `trace_*` is not offered on Robinhood at any tier, so even paying buys only `debug_*` call tracers. Log-based reconstruction covers most of what traces were wanted for. One **unverified lead**: Quicknode documents a Robinhood RPC (`https://www.quicknode.com/docs/robinhood/api-overview`). Whether it exposes `debug_traceTransaction` or `trace_*` there is untested — the check is one POST per method against a Quicknode Robinhood endpoint, and it should be run before anyone pays Alchemy for tracing.
- **Pons tokens through Uniswap quotes.** Deliberate, not a bug. The adapter sends `hooksOptions: "V4_NO_HOOKS"` and every graduated Pons pool carries the Pons hook, so the router answers `NoRouteFoundError` for those pairs. Ordinary pools quote normally. Pons pricing stays with the Pons quoter, which matched the local fork exactly on all four tested swaps. Router version matters independently: on `/quote` for chain 4663, `2.1.1` answers 200, `2.0` answers 404 and `1.2` answers 400.
- **Birdeye security and holders on Robinhood.** Provider-side, 401 and "not supported yet". Nothing on our end changes either.

## Provider decisions

Buy nothing. Recorded so the question is not reopened from scratch:

| Provider | Verdict | Why |
| --- | --- | --- |
| Blockscout | **Do not buy** | Cloudflare challenge sits in front of the app; keys are rate-limit tokens applied behind it |
| CoinGecko | **Do not buy** | Its on-chain DEX endpoints _are_ GeckoTerminal, which is free and already covers `robinhood`. Only reconsider for CEX reference prices for stock-token parity, a different question |
| Birdeye upgrade | **Do not buy** | GoPlus answers the security question free; the holder endpoint is unsupported on this chain regardless of plan |
| GoPlus | **Free, no key** | Supports 4663 today |
| Sourcify | **Free, no key** | Supports 4663 today |
| GeckoTerminal | **Free, no key** | Supports `robinhood` today |
| DeFiLlama | **Free, no key** | Lists "Robinhood Chain", chainId 4663, TVL about $894M. Lowest value for a single-token question; skip for now |
| Alchemy tracing | **Defer** | Test Quicknode's Robinhood RPC for trace support first |

### Cheapest tool per question

| Question | Route it to |
| --- | --- |
| Verified source, ABI | Sourcify |
| Honeypot, mint, proxy, pausable, blacklist | GoPlus |
| Price, volume, liquidity history | GeckoTerminal |
| Market cap, new listings, trending | Birdeye |
| Curve phase, reserves, sellable supply, taxes, graduation | `pons_token`, our own read |
| Holder concentration, launch cohort | `token_research` (reconstructed Transfer history + venue events) |
| Quote at size | The Pons quoter for Pons tokens; Uniswap for everything else |

## Next steps

Ordered. Each new provider costs a loud stub and both markers as well as the adapter — per [`AGENTS.md`](../../AGENTS.md), that is the per-integration tax, not the HTTP call.

1. **Sourcify adapter.** Removes the Blockscout dependency entirely.
2. **GeckoTerminal adapter.** History, and visibility into the non-Pons side of the chain.
3. **Pools.trade insider trades.** Registration is live; v4 Swap cohort filtering is still empty (`capabilities.insiders: false`).

## Open decisions

- **Should `pons_token` stay free?** It is currently the only unpaid chain read in the trading surface, which is a slight inconsistency with `rpc_read` and `token_research` being sold.

## Repeating these checks

Keys live in server configuration and never in this file. The endpoint for `eip155:4663` is the one in `TRADING_RPC_ENDPOINTS`; `BIRDEYE_API_KEY` and `UNISWAP_API_KEY` are as named.

- Chain identity: `eth_chainId` against the public RPC returns `0x1237`.
- Birdeye chain support: `GET https://public-api.birdeye.so/defi/networks`, expect `robinhood` in the list.
- Birdeye per-endpoint support: send `x-chain: robinhood`; the free tier rate-limits at about one request per second, so space the calls or the answer is `Too many requests` rather than a real result.
- GoPlus: `GET https://api.gopluslabs.io/api/v1/token_security/4663?contract_addresses=<token>`, no auth.
- Sourcify: `GET https://sourcify.dev/server/v2/contract/4663/<address>`.
- GeckoTerminal: `GET https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/<address>`, send a browser User-Agent.
- Uniswap: `POST https://trade-api.gateway.uniswap.org/v1/quote` with `x-universal-router-version: 2.1.1` and `tokenInChainId: 4663`.
- Blockscout: check the response **body**, not the status. A 200 carrying `Just a moment...` is the challenge page, not data.
