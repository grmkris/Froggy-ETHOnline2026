# Pools.trade launch venue evidence

12 September 2026. These checks pin Robinhood Chain (`eip155:4663`) deployments for the research `LaunchVenue` adapter. No transaction was submitted. Addresses were resolved from Uniswap's published deployment feed where present; Bitquery's pools.trade guide was used only for addresses Uniswap does not list on Robinhood, and only after on-chain code verification via the public Robinhood RPC.

## Primary sources (Uniswap)

- [Uniswap deployments feed](https://developers.uniswap.org/deployments.json) — Robinhood `liquidity-launchpad` and `v4` rows:
  - `LiquidityLauncher` (current entry) `0x0000FffFBE8efE702c8703aE3477FF5dE3d319C0` — `liquidity-launchpad-liquiditylauncher-robinhood-chain`, sourceRef `v3.2.0`
  - `LiquidityLauncher#v3.0.0` (original entry, deprecated) `0x00004c4ccc709Ef590F7C81102C0689F0263D4e9` — `liquidity-launchpad-liquiditylauncher-v3-0-0-robinhood-chain`
  - `InstantLaunchStrategy#creator-fees` `0x23f8209572b4a1C2AD88A42749E830791Fb027f1`
  - `InstantLaunchStrategy#no-creator-fees` `0xAD44D55E7f8337C3cE113fBb591486E85be104b2`
  - `PoolManager` `0x8366a39CC670B4001A1121B8F6A443A643e40951` — `v4-poolmanager-robinhood-chain`
- [InstantLaunchStrategy.sol](https://github.com/Uniswap/liquidity-launcher/blob/v3.2.0/src/strategies/InstantLaunchStrategy.sol) — `TokenLaunched(PoolId indexed poolId, address indexed token, address indexed finalPositionRecipient, PoolKey key)`; topic0 `0x3b3d2bafdcae274a232217e1f80ee4305d3af6aa25c8b14b1681bd68d18042a4`
- [Robinhood Chain connecting docs](https://docs.robinhood.com/chain/connecting/) — chain id 4663; public RPC `https://rpc.mainnet.chain.robinhood.com`

Uniswap does **not** publish a Robinhood row for the token factory address, nor for the two original-path InstantLaunchStrategy addresses below. Those are secondary.

## Secondary sources (Bitquery, verified on-chain)

- [Bitquery pools.trade API guide](https://docs.bitquery.io/docs/blockchain/robinhood/pools-trade-api/) lists the same entry and current InstantLaunchStrategy addresses as Uniswap, plus:
  - Token factory `0x000000e200088D55C39a11F609E5F667729ad49b` (Uniswap lists this CREATE2 address as `UERC20Factory` on Ethereum/Sepolia only — not as a Robinhood deployment row)
  - Launchpad (original path) `0xcE57498D3474DCC244dFb6710fFbE6D4441cD2b2`
  - Launchpad (original path, alt) `0x60D73b21cDf2EA846ab3d58699BBbb8F29d72491`

Each secondary address returned non-empty runtime bytecode on the public Robinhood RPC before it was pinned.

## Observed runtime identities

Observed at block `60979304`, hash `0x716b35d70af3dc136ecb6d997811259554cd0f8db164a3df4ba2a01d41a9f239`, via `https://rpc.mainnet.chain.robinhood.com`. Runtime identity is `keccak256` of `eth_getCode` at that block.

| Dependency | Address | Source | Runtime keccak256 |
| --- | --- | --- | --- |
| launchEntryCurrent | `0x0000FffFBE8efE702c8703aE3477FF5dE3d319C0` | Uniswap primary | `0x4a586d925c9d59ece13ce2239ebd7dea9ee725f9d33c6667e0fd16ae8d977d80` |
| launchEntryOriginal | `0x00004c4ccc709Ef590F7C81102C0689F0263D4e9` | Uniswap primary (deprecated v3.0.0) | `0x672007315147b9202d825c5a4f5fed556179de55a89d8052f64d1c49ef366ed6` |
| tokenFactory | `0x000000e200088D55C39a11F609E5F667729ad49b` | Bitquery secondary (+ Uniswap UERC20Factory on other chains) | `0x9f042af1533641f048ced56b55898d9e87b2ccb0ec6854292e2cd8ea733e6aeb` |
| launchpadCurrentCreatorFees | `0x23f8209572b4a1C2AD88A42749E830791Fb027f1` | Uniswap primary | `0x29df27cf43533e9b3708dcd2a2c0fd17a1a8796407e7d39375f47e5c809cffca` |
| launchpadCurrentNoCreatorFees | `0xAD44D55E7f8337C3cE113fBb591486E85be104b2` | Uniswap primary | `0x6944058fa8339bcf018c4a2ddc043d378b47516f8756db34202bdc6cf93a9a8e` |
| launchpadOriginalA | `0xcE57498D3474DCC244dFb6710fFbE6D4441cD2b2` | Bitquery secondary | `0x50c9d66d818a575b0c8ac7af64fd0beeb92aeed26db5a71c6901cdbd135539ba` |
| launchpadOriginalB | `0x60D73b21cDf2EA846ab3d58699BBbb8F29d72491` | Bitquery secondary | `0x2562884d759c0753bffcd3e7fb60891bb1df15be441e6fe399e45fb5f3c87c4e` |
| poolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | Uniswap primary | `0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626` |

PoolManager runtime hash matches the Pons evidence pin at an earlier block (`docs/evidence/PONS_DEPLOYMENTS.md`).

## Event and adapter notes

- Registration and launch block: `TokenLaunched` filtered by indexed `token` across the four InstantLaunchStrategy addresses.
- `finalPositionRecipient` is the fee-splitter (or equivalent permanent LP recipient), not the human creator; `deployer` is left null until a primary creator field is wired.
- There is no bonding-curve contract: phase is `standard`, `curveOrPool` is the shared PoolManager, and `tradeEvents` stays empty until v4 `Swap` filtering by `poolId` is implemented. `capabilities.insiders` is therefore false.
- Template fingerprint: `not_applicable` — no stable masked bytecode clone recorded yet.
