# Uniswap Robinhood Chain deployments (execution)

Verified 12 September 2026 against primary Uniswap docs and the public Robinhood RPC (`https://rpc.mainnet.chain.robinhood.com`, `eth_chainId` `0x1237`).

## Sources

- [V3 Robinhood deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments)
- [Trading API supported chains](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains) — Robinhood lists Universal Router **2.1.1 only** (`0x8876…0904`); no 2.0 row
- [Universal Router 2.1.1 release](https://github.com/Uniswap/universal-router/releases/tag/2.1.1) — V3_SWAP_EXACT_IN requires trailing `uint256[] minHopPriceX36` (empty disables per-hop checks)

## Pinned for Uniswap venue execution

| Role | Address | `eth_getCode` bytes (2026-09-12) |
| --- | --- | --- |
| UniswapV3Factory | `0x1f7d7550b1b028f7571e69a784071f0205fd2efa` | 24535 |
| Universal Router 2.1.1 | `0x8876789976decbfcbbbe364623c63652db8c0904` | 24546 |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | 9152 |

These live in `apps/server/src/trading/uniswap-transactions.ts` under `eip155:4663` with `routerVersion: "2.1.1"`.

## Not the Pons router

Pons graduated swaps pin a different Universal Router (`0x06AfBA43…`, see [PONS_DEPLOYMENTS.md](PONS_DEPLOYMENTS.md)) for V4 + hook exact-input. That address also has code on Robinhood; it is **not** the Uniswap Trading API 2.1.1 router. Ordinary no-hook V3 pools use the Uniswap venue pin above. Pons curve and hooked pools stay on the Pons venue (`V4_NO_HOOKS` quotes return `NoRouteFound` for those pairs).
