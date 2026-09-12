# apps/server/src/trading

Trading capital is its own money path. Service purchases still go through `spend()`. A trade goes through `spendTrade()` in `session.ts`: the coordinator prepares unsigned steps, serializes human or rule approval, reserves token principal and native fees in the durable book, and only then asks the venue backend to sign and broadcast. Nothing in this folder pays around that call.

Two venue families:

- **EVM** — Uniswap (quoted swaps), Pons on Robinhood (`PONS_NETWORK`), Enso (deposit/withdraw).
- **Solana** — Jupiter (swaps) and Pump (bonding-curve launches) on `SOLANA_MAINNET`.

A loud stub is the only execution backend when a venue is not live. `stub-execution.ts` marks every simulation `provider: "fixture"` and `stubbed: true`. A faked fill that could pass for a chain fill is the failure this exists to prevent.

`jupiter-fixture.ts` and `pump-fixture.ts` are test-only fake RPC servers. They speak the provider codecs and produce real signatures over a synthetic local bank. No network request leaves the test. Do not import them from production code.
