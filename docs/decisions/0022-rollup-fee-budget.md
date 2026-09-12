# 0022 — Rollup native-fee budget for Uniswap on Base

Status: accepted, 12 September 2026. Supersedes the Base-execution paragraph of [0021](0021-trading-capital.md).

## Context

Uniswap quotes and reviewed deployments already covered Base (`eip155:8453`) and Base Sepolia (`eip155:84532`). Live execution was refused because L1 data fees (and, after Isthmus, operator fees) sit outside the signed EIP-1559 `maxFeePerGas` cap. An oracle estimate alone is not an on-chain maximum.

Settlement already required a Base receipt `l1Fee` and treated a missing value as unresolved. The missing piece was an enforceable budget model that lets `maxNativeFee` cover both the signed execution cap and the off-cap fees before signing.

## Decision

The approved `maxNativeFee` is split:

1. **Execution cap** — Σ `gasLimit × maxFeePerGas` across the unsigned steps. Enforced by the signed transaction, as before.
2. **Data-fee allowance** — `maxNativeFee − executionCap`. It must cover `DATA_FEE_MARGIN` (2×) the OP Stack GasPriceOracle estimate of L1 data fee plus Isthmus operator fee for every remaining unsigned step.

The estimate is checked at prepare and again immediately before sign with a fresh oracle read. Both fail closed with `trade.fee_bound`. The GasPriceOracle predeploy `0x4200…000F` is pinned from the OP Stack predeploys spec and viem's Base chain definitions; the call passes that address explicitly so the client does not need a configured chain.

Settlement adds `l1Fee` and, when present on the receipt, the Isthmus operator fee computed from `operatorFeeScalar` and `operatorFeeConstant`. An overshoot beyond `maxNativeFee` surfaces as the existing `trade.fee_exceeded`. Residual exposure is the short window between sign and sequencer inclusion, bounded by the margin and reported on the receipt.

Non-rollup networks have a zero data-fee component, so Ethereum mainnet and Sepolia share the same prepare-time fee check.

## Consequences

- `uniswapExecutionNetwork` means "has a reviewed Uniswap deployment", including Base, Base Sepolia and Robinhood Chain (`eip155:4663`).
- Capabilities advertise Base and Robinhood as `live` when Uniswap, Tenderly, RPC and Privy are configured, with no rollup-fee limitation string.
- Robinhood Uniswap uses the published Universal Router 2.1.1 and V3 factory from [Uniswap's Robinhood deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments). V3_SWAP_EXACT_IN appends an empty `minHopPriceX36` array. Pons curve/hooked pools stay on the Pons venue.
- Robinhood Nitro is unchanged for fee settlement: parent gas stays inside `gasUsed` and is not treated as an OP Stack rollup.
- Enabling further OP Stack chains requires adding them to `ROLLUP_NETWORKS` and pinning a reviewed Uniswap deployment; the budget model itself does not change.

## References

- [OP Stack Fjord GasPriceOracle](https://specs.optimism.io/protocol/fjord/predeploys.html)
- [OP Stack Isthmus operator fee](https://specs.optimism.io/protocol/isthmus/exec-engine.html)
- Implementation: `apps/server/src/trading/rollup-fees.ts`
