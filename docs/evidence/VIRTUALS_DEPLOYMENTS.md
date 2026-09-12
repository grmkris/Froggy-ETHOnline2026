# Virtuals Protocol bonding-curve deployment evidence (Base)

12 September 2026. Read-only `eth_getCode` against public Base RPC `https://mainnet.base.org` (no `TRADING_RPC_ENDPOINTS` Base entry was configured in the local checkout). No transaction was submitted.

## Primary deployment sources

- [Virtuals Protocol contract addresses](https://whitepaper.virtuals.io/info-hub/important-links-and-resources/virtuals-protocol-contract-addresses): Base bonding curve `0x1A540088125d00dD3990f9dA45CA0859af4d3B01`.
- Bonding semantics / events: [Virtual-Protocol/protocol-contracts `Bonding.sol`](https://github.com/Virtual-Protocol/protocol-contracts/blob/main/contracts/fun/Bonding.sol) (`tokenInfo`, `Launched`, `Graduated`).

## Observed runtime identities

Observed at block `51206991`, hash `0x01d7115283e20c341b05bf59d90bbfe78b04c13a4d021244b40c7572c92b6527`.

| Dependency | Address | Runtime keccak256 |
| --- | --- | --- |
| bondingCurve | `0x1A540088125d00dD3990f9dA45CA0859af4d3B01` | `0xcb419134161f24654d0518e596f790269a2d4e010e8340765793c44dbc738d47` |

The address is a proxy (observed runtime 1167 bytes). The pin is the proxy bytecode at the observed block.

## Registration detection

- View: `tokenInfo(address)` public mapping getter (creator, token, pair, trading / tradingOnUniswap).
- Launch: `Launched(address indexed token, address indexed pair, uint256)` on the bonding curve.
- Trade events: empty — Bonding emits launch/graduate, not clear buy/sell with trader addresses (`insiders: false`).
- Template: `not_applicable` (no masked fingerprint verified across 2+ tokens).
- Phase: `curve` while `trading`, `graduated` when `tradingOnUniswap`.
