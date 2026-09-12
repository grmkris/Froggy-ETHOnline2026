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
- Template: masked runtime fingerprint, see below.
- Trade events: empty. Uniswap v4 `Swap.sender` is the router or unlock callback, not the trader, so no insider cohort is claimed.
- `poolId`: `TokenCreated.poolId`, reported on the launcher fact as research metadata.

## Token template

Observed at block `51208941`, hash `0xe88d4baa4651d27b5a89358a83fe2adc0c7267d149032ff42c2844b2fc8edeee`, over six tokens the factory emitted `TokenCreated` for between blocks `51204088` and `51208189`:

| Token                                        | Name       | Runtime bytes |
| -------------------------------------------- | ---------- | ------------- |
| `0x391BaEA8c1cB44C79440c29eB8dc46E5eD564b07` | Kamzio Pay | 12791         |
| `0xF3985B86b7f47aD7B5dA2c96864D706Ef9116b07` | moonhood   | 12791         |
| `0xC5baBa0f4d57Cba65C432095c9a3999644473b07` | Glow-Base  | 12791         |
| `0xEC5673783b5e15eC40781C50FB13dAFb2f19Cb07` | embercurve | 12791         |
| `0xBC25bC4C56F8ae34FBE6b506d97f8fDDc70dDb07` | A9F59      | 12791         |
| `0x8cea7A94a06B91198A6D6591BEc5453E5eC6aB07` | 595666     | 12791         |

Byte-wise diff across the six runtimes falls inside seven slots. Each is zeroed before hashing:

| Offset | Length | Content                         |
| ------ | ------ | ------------------------------- |
| 1849   | 20     | token admin (immutable, site 1) |
| 3148   | 32     | `PUSH32` ShortString name word  |
| 4905   | 20     | token admin (site 2)            |
| 6785   | 20     | token admin (site 3)            |
| 9056   | 20     | the token's own address         |
| 9091   | 32     | 32-byte deployment word (salt)  |
| 9170   | 32     | 32-byte deployment word (salt)  |

Masked keccak256 for all six: `0x7e60889bd35b49b4aec7446d94e67b59dfbcd5456b5dd560d0e108963834a5bf`. Pinned as `CLANKER_TOKEN_TEMPLATE` in `apps/server/src/trading/venues/clanker.ts`; the runtime of `0x391BaEA8…4b07` is kept as a test fixture in `clanker-token-fixture.ts`. The factory, FeeLocker and LpLocker hashes above were re-read at the same block and unchanged.

The template is a research fact on Base. It is not a rule predicate: Clanker is a launcher venue, not an execution venue, and `requireTemplateMatch` stays Pons-only.
