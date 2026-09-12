# Base simulation verification — 12 September 2026

The Tenderly v2 REST adapter was checked against live Base RPC, Uniswap V3 quotes and Tenderly simulations. Verification used the existing wallet's actual balances, with no balance or allowance overrides. Composed actions used proceeds created by earlier calls in the same simulated bundle. No trade record was saved, no owner signature was requested, and no transaction was broadcast.

## Decoder correction

A live HTTP 200 response encoded `gas_used`, `block_number` and child `trace_address` indices as decimal strings. The root call omitted `trace_address`. The old fixture used JSON numbers and required an explicit empty root path, so the decoder rejected valid responses.

The corrected decoder accepts bounded nonnegative decimal strings within the safe integer range and checks the first trace as the unique root. Block, sender, destination and calldata identity checks remain mandatory. Limits remain 512 KiB per response, 512 trace entries per simulation, eight transactions and two post-state balance probes. Errors now distinguish malformed/oversize JSON from a schema mismatch.

Provider documentation: [Tenderly bundled simulations](https://docs.tenderly.co/simulations/bundled-simulations). The exact v2 field representation above was established by the live response; the documentation also describes other API/RPC variants.

## Live matrix

| Scenario | Observation |
| --- | --- |
| 0.10 USDC → native ETH | Preparation passed; positive native proceeds |
| 1 USDC → native ETH | Preparation passed; one three-call approval/swap bundle |
| 5 USDC → native ETH | Preparation passed; exact USDC input consumed |
| Full starting USDC balance → native ETH | Preparation passed; simulated USDC balance reached zero |
| USDC approval followed by revocation | Both calls passed; token and native balances unchanged |
| 0.10 USDC transfer to configured treasury | Passed; exact USDC debit |
| USDC → ETH → USDC | Both directions passed within one stateful bundle |
| USDC → WETH → USDC | ERC-20 output and reverse allowance/swap calls passed |
| USDC → ETH, then WETH deposit and withdrawal | Passed; WETH returned to its starting balance |
| USDC → ETH, then native transfer to treasury | Passed using simulated swap proceeds |
| Swap with a pre-existing insufficient allowance | Simulated allowance reset and exact replacement passed |
| Swap with a pre-existing sufficient allowance | Swap passed without redundant ERC-20 approval |
| Eight approval calls plus two balance probes | All ten simulation results passed within the existing limits |
| USDC transfer exceeding actual balance | Provider returned a revert; adapter reported failed simulation |
| Expired router deadline | Provider returned a revert; adapter reported failed simulation |
| Impossible minimum output | Provider returned a revert; adapter reported failed simulation |
| Unfunded standalone native transfer | Tenderly returned success despite zero starting native balance; provider status alone does not prove affordability |
| Unfunded native ETH → USDC preparation | Froggy rejected the result because token changes did not match the requested input and minimum output |

The unfunded-transfer result is a provider limitation, not a successful negative test. Froggy's independent input/output checks rejected the corresponding unfunded native swap. Durable principal reservation remains a separate requirement before submission; simulation must never replace it.

Positive composed responses observed here stayed below 42 KiB, and their largest individual trace had 65 entries. These observations are not universal upper bounds.

## Scope and remaining proof

This verifies unsigned preparation and simulated state transitions on the tested Base routes. It does not prove Privy signing, EIP-7702 delegation, sponsorship billing, bundler inclusion, confirmed settlement, or every venue/network. A real owner-approved browser swap is still required to exercise those stages. Composed transfers and wrapping in this matrix test EVM simulation behavior; they do not add new sponsored actions to the app.

Regression coverage exercises provider decimal strings, omitted root paths, child paths, duplicate roots, malformed and unsafe quantities, call/block mismatches, reverted transactions, incomplete responses and native balance probes. Existing trading browser checks cover the proposal and exact owner-approval boundary.
