# Flaunch deployment evidence (Base)

12 September 2026. Read-only `eth_getCode` against public Base RPC `https://mainnet.base.org` (no `TRADING_RPC_ENDPOINTS` Base entry was configured in the local checkout). No transaction was submitted.

## Primary deployment sources

- [flayerlabs/flaunchgg-contracts releases](https://github.com/flayerlabs/flaunchgg-contracts/releases) (`v1.1.5-base` deployment table): Flaunch `0x516af52d0c629b5e378da4dc64ecb0744ce10109` and PositionManager `0x23321f11a6d44fd1ab790044fdfde5758c902fdc`.
- Interfaces: [`IFlaunch.sol`](https://github.com/flayerlabs/flaunchgg-contracts/blob/main/src/interfaces/IFlaunch.sol), [`IPositionManager.sol`](https://github.com/flayerlabs/flaunchgg-contracts/blob/main/src/interfaces/IPositionManager.sol).

## Observed runtime identities

Observed at block `51206991`, hash `0x01d7115283e20c341b05bf59d90bbfe78b04c13a4d021244b40c7572c92b6527`.

| Dependency | Address | Runtime keccak256 |
| --- | --- | --- |
| flaunch | `0x516af52d0c629b5e378da4dc64ecb0744ce10109` | `0x8be29288e3373d71c49957887e6a27029fb2cb1021a03dc4f8d2eba81fc333fe` |
| positionManager | `0x23321f11a6d44fd1ab790044fdfde5758c902fdc` | `0x5eca45e09bd789d828359554b41353c7f4d2468e71766fe3a79b7853aa1adf8a` |

## Registration detection

- Views: `tokenId(memecoin)` then round-trip `memecoin(tokenId)` / `memecoinTreasury(tokenId)` on Flaunch; optional `poolKey(token)` on PositionManager.
- Launch: `PoolCreated` on PositionManager (`_memecoin` not indexed — decode and match).
- Trade events: empty (v4 / internal swap complexity; `insiders: false`).
- Template: `not_applicable` (no masked fingerprint verified across 2+ tokens).
