# 0023 — Research-gated trading rules

Status: accepted for implementation, 12 September 2026.

(Numbered 0023 because [0022](0022-rollup-fee-budget.md) already records the rollup fee budget.)

Token research and trading authority answer different questions and must not share defaults.

A paid `token_research` read is **tolerant**. Every source reports `observed`, `not_indexed`, `unavailable`, or `not_applicable` at one pinned block. Absence of evidence is visible. GoPlus and indexed holders are research-visible only.

A trading rule that carries a `TradeResearchPolicy` is **strict and fail-closed**. Missing, stale (older than 30 seconds), unreconciled, or wrong-basis facts refuse signing with a named `trade.research_*` reason. Only own-RPC facts may gate signing: template match, venue-event launch cohorts, and reconstructed holder concentration. Indexed holders and GoPlus never authorize a trade.

Launchers are `LaunchVenue` adapters. Each pins reviewed deployments by address and runtime keccak256, recorded under `docs/evidence/`. Detection asks configured venues for registration; the first hit wins. Adding a launcher costs a primary-source address resolution, a hash pin, an adapter, a loud stub, tests, and a live check. A venue whose deployments cannot be verified is not shipped.

One composite paid operation covers every configured EVM RPC network. Venue-specific free reads such as `pons_token` may add fields, but they do not become separate research products. Nothing that changes spending authority is a tool; research predicates are attached by a human on a rule.
