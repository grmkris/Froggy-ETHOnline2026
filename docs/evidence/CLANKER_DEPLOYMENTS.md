# Clanker v4 deployment evidence (Base)

12 September 2026. Read-only `eth_getCode` against public Base RPC `https://mainnet.base.org` (no `TRADING_RPC_ENDPOINTS` Base entry was configured in the local checkout). No transaction was submitted.

## Primary deployment sources

- [clanker-devco/v4-contracts README](https://github.com/clanker-devco/v4-contracts/blob/main/README.md): Base mainnet v4.0 factory, FeeLocker, LpLocker, and Vault addresses.

## Observed runtime identities

Observed at block `51206991`, hash `0x01d7115283e20c341b05bf59d90bbfe78b04c13a4d021244b40c7572c92b6527`.

| Dependency | Address | Runtime keccak256 |
| --- | --- | --- |
| factory | `0xE85A59c628F7d27878ACeB4bf3b35733630083a9` | `0x43acb1f309cc223c71169825b9ab9c0f703669c25156e2999102dcfbb1826bee` |
| feeLocker | `0xF3622742b1E446D92e45E22923Ef11C2fcD55D68` | `0x771f566794aa68f1e5498fdb5cb59e2bb7c3e8daeed340f2bb45f8856d4187c7` |
| lpLocker | `0x29d17C1A8D851d7d4cA97FAe97AcAdb398D9cCE0` | `0x216d1e06b97f936ddace1453431fec8b8d2d75dfc1ca013b4ea7ed594a734939` |

Vault `0x8E845EAd15737bF71904A30BdDD3aEE76d6ADF6C` is listed in the same README and used as a holder exclusion only; it is not hash-pinned in `verifyDeployments`.

## Registration detection

- View: `tokenDeploymentInfo(address)` on the factory (`IClanker`).
- Launch: `TokenCreated` with indexed `tokenAddress` / `tokenAdmin` (same interface).
- Template: `not_applicable` (no masked fingerprint verified across 2+ tokens).
- Trade events: empty (Uniswap v4 swap path not decoded for insiders).
