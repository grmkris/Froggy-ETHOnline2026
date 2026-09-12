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
- Template: `not_applicable` (no masked fingerprint verified across 2+ tokens).
