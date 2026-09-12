# Zora Coins deployment evidence (Base)

12 September 2026. Read-only `eth_getCode` against public Base RPC `https://mainnet.base.org` (no `TRADING_RPC_ENDPOINTS` Base entry was configured in the local checkout). No transaction was submitted.

## Primary deployment sources

- [Creating a Coin — Zora docs](https://docs.zora.co/coins/contracts/creating-a-coin): factory address on Base (`8453`) and creation event set (`CoinCreated`, `CoinCreatedV4`, `CreatorCoinCreated`, `TrendCoinCreated`).

## Observed runtime identities

Observed at block `51206991`, hash `0x01d7115283e20c341b05bf59d90bbfe78b04c13a4d021244b40c7572c92b6527`.

| Dependency | Address | Runtime keccak256 |
| --- | --- | --- |
| factory | `0x777777751622c0d3258f214F9DF38E35BF45baF3` | `0xd5e3301e737ae8f1471ced5089ae8e950baa3844e353ce76bdad2edb6b44da2e` |

The factory runtime is 130 bytes (EIP-1167 minimal proxy). The pin is the proxy bytecode; implementation upgrades do not change this hash.

## Registration detection

- Views on the coin: `currency()`, `payoutRecipient()`, `hooks()` (`ICoin` / `IHasRewardsRecipients`).
- Launch confirmation: factory creation logs (coin address is not indexed — decode and match `coin`).
- Trade events: `CoinBuy` / `CoinSell` on the coin when present (`insiders: true`).
- `poolId`: `poolKeyHash` from the v4 creation events, reported on the launcher fact as research metadata; legacy `CoinCreated` (v3 pool) reports `null`.
- Template: whole-runtime pin of the coin proxy, see below. `capabilities.template` stays `false`: the fact says which implementation a coin delegates to, not that a per-token runtime was reviewed.

## Coin proxy and implementation

Observed at block `51209251`, hash `0xf610d378c3134c07916ad13532079240c1de9d4f86f276ae54021c6f9bd3a897`, over eight `CoinCreatedV4` coins (version `2.6.0`) the factory emitted between blocks `51208373` and `51208986`:

| Coin | Runtime bytes | Runtime keccak256 |
| --- | --- | --- |
| `0xDb50A74a5d8C0eC88f4298005c04aA1479673014` | 45 | `0xe4c5ad7d4a813d9a2f632ccb653b95c93b40680043250b3d84d4fdb1448e0bf8` |
| `0x1675BcD25840a27Aa1f6327B089D381e9DA25591` | 45 | same |
| `0x297033A4e1745542aC49D3c135A7CF73507798fA` | 45 | same |
| `0x3103e3Dfb33dC9875caDc23Aa8734678fF678060` | 45 | same |
| `0x16312D0BEF6f4DA7Dbe68b21bb0f126A2Bc6068D` | 45 | same |
| `0xFA0EF86F08Ff54C09a3f55E62C4B25fe2937F70D` | 45 | same |
| `0x003910319922b65855484525298235883b63EEcE` | 45 | same |
| `0x4A8BD6fa0982D34d15737712f8a83Ec4Be465944` | 45 | same |

Each runtime is the EIP-1167 minimal proxy `363d3d373d3d3d363d73<implementation>5af43d82803e903d91602b57fd5bf3`, all delegating to:

| Dependency | Address | Runtime bytes | Runtime keccak256 |
| --- | --- | --- | --- |
| coinImplementation | `0x5DbD43785954d43C1643a0CaF2ECEf9E0056Ff13` | 18550 | `0xfc1474fb66df4d6af5cee402ff1d99b3958ad7f4f15c591244cdaac0c72bbb1e` |

Pinned as `ZORA_COIN_PROXY_HASH` and `ZORA_DEPLOYMENTS.coinImplementation` in `apps/server/src/trading/venues/zora.ts`. The factory hash above was re-read at the same block and unchanged. `CreatorCoinCreated` and `TrendCoinCreated` coins were not emitted in the sampled window; a coin behind a different implementation reports `matches: false` with the note naming the proxy, which is the honest answer rather than a defect.
