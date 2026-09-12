# 0023 — Research-gated trading rules

Status: accepted for implementation, 12 September 2026.

(Numbered 0023 because [0022](0022-rollup-fee-budget.md) already records the rollup fee budget.)

Token research and trading authority answer different questions and must not share defaults.

A paid `token_research` read is **tolerant**. Every source reports `observed`, `not_indexed`, `unavailable`, or `not_applicable` at one pinned block. Absence of evidence is visible. GoPlus and indexed holders are research-visible only.

A trading rule that carries a `TradeResearchPolicy` is **strict and fail-closed**. Missing, stale (older than 30 seconds), unreconciled, or wrong-basis facts refuse signing with a named `trade.research_*` reason. Only own-RPC facts may gate signing: template match, venue-event launch cohorts, and reconstructed holder concentration. Indexed holders and GoPlus never authorize a trade.

Research predicates gate **entries only**. An automatic exit sells a position the same rule already acquired; it stays bound by the exit policy, the confirmed acquisition and the fee caps, but no research read runs before it. A failed or stale read must refuse a new buy, never trap an existing position.

Launchers are `LaunchVenue` adapters. Each pins reviewed deployments by address and runtime keccak256, recorded under `docs/evidence/`. Detection asks configured venues for registration; the first hit wins. Adding a launcher costs a primary-source address resolution, a hash pin, an adapter, a loud stub, tests, and a live check. A venue whose deployments cannot be verified is not shipped.

One composite paid operation covers every configured EVM RPC network. Venue-specific free reads such as `pons_token` may add fields, but they do not become separate research products. Nothing that changes spending authority is a tool; research predicates are attached by a human on a rule.

## Addendum, 12 September 2026 (later the same day)

The research spike across Robinhood, Base and Ethereum settled what each venue can honestly gate on, and the code now follows it.

- **Predicates follow the backend's own RPC.** `createRule` accepts a research policy only when the rule names one venue and every enabled predicate is one that venue's execution backend can read itself. Pons keeps template, insider and concentration predicates. Uniswap routes on Base, Ethereum and Robinhood accept the top-holder cap alone, reconstructed from Transfer history on the route's RPC with the same launcher venues the paid read uses for exclusions and launch blocks. Any other venue, and any multi-venue rule, refuses research predicates with a `trade.research_venue` reason.
- **Base launcher templates are research facts, not predicates.** The Clanker v4 token runtime is pinned as a masked template and the Zora coin runtime as a whole-code EIP-1167 proxy pin. Both surface in `token_research`; neither can be required by a rule, because Clanker and Zora are launcher venues rather than execution venues and `requireTemplateMatch` stays Pons-only.
- **What was declined, and why.** Birdeye holder lists for EVM tokens are indexed and would fail the own-RPC rule. Uniswap v4 `Swap.sender` is the router or unlock callback, so it cannot name an insider on Clanker, Flaunch or Pools.trade. Virtuals has no venue trade events worth trusting. A Transfer-only launch cohort was excluded as a heuristic that would let a rule refuse on guesswork. Executing on Base launchers directly stays out of scope; Uniswap is the execution venue there.
