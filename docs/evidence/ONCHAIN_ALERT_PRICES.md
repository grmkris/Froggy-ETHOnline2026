# Onchain alert price-source evidence

13 September 2026. This records read-only verification of the price resolver in the shared checkout. The public observations are retained in [onchain-alert-prices-2026-09-13.json](onchain-alert-prices-2026-09-13.json). The probe did not sign, transfer funds, write application data, send Telegram messages, or deploy the application.

## Observed results

| Network and source | Block | Result | Proof boundary |
| --- | --- | --- | --- |
| Base ETH/USD Chainlink | `51236115` | `2524.56578916` USD per ETH | Substreams sealed block matched configured RPC hash |
| Base hookless Uniswap v4 ETH/USDC | `51236115` | Approximately `2524.991916138847763451` USDC per ETH | Same sealed stream block; pool identity and active quote-depth floor passed |
| Robinhood ETH/USD Chainlink | `61553009` | `2516.61512973` USD per ETH | Official public RPC block and hash only |
| Robinhood NVDA token/USD Chainlink | `61553009` | Source resolved; observation unavailable because the oracle round was stale | Official issuer contract joined to official feed; Sunday observation retained without substituting a pool price |
| Robinhood pools.trade hookless Uniswap v4 | `61553009` | Approximately `0.00000002480680659113384373` ETH per token | Official public RPC block; pool identity and at least 5 ETH active equivalent quote depth passed |

The exact rational values and full decimal display strings are in the JSON artifact. Rounded values in this table are for reading only.

Base block hash: `0xfde83a52f30df56d969836440c4d0447eff7de69877f76428e70251e76222a05`, timestamp `2026-09-13T01:06:17Z`.

Robinhood block hash: `0xdc662f193b01c6da1e6578c75b1126bebcb0247e90dc02616722664bff3fd56a`, timestamp `2026-09-13T01:06:26Z`.

### Exact source identities

| Source | Proxy or pool identifier | Pinned dependency |
| --- | --- | --- |
| Base ETH/USD | Proxy `0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70` | Aggregator `0x05c84a58fe042275b37db038baacd15f410c7bb0`; sequencer `0xbcf85224fc0756b9fa45aa7892530b47e10b6433` |
| Base ETH/USDC | Pool ID `0x96d4b53a38337a5733179751781178a2613306063c511b78cd02684739288c0a` | PoolManager `0x498581ff718922c3f8e6a244956af099b2652b2b`; native ETH/USDC, fee 500, tick spacing 10, zero hook |
| Robinhood ETH/USD | Proxy `0x5058adee53b04e374d8bedbad634bc4778f50b22` | Aggregator `0x6091e64eb7138eef066a80fd3a0d7427b91f2721` |
| Robinhood NVDA/USD | Proxy `0xcf169363636d73dbbf77733629cb38919d14232d` | Token `0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec`; aggregator `0xc9d16e4f2569b9e3ea0468fd85844953713dc2a2` |
| Robinhood pools.trade | Pool ID `0x9e3ce8a652954bd9b43019286b7f3b5d18cfb93bf8e35e1de6a5e93ee5a4c33f` | Token `0xfcb999fa31cc0abf3a072bec610a621eaee62998`; official PoolManager `0x8366a39cc670b4001a1121b8f6a443a643e40951`; native ETH/token, fee 2500, tick spacing 25, zero hook |

The Robinhood launch scan covered the last 100,000 blocks at the captured head and found 37 launch events across the four previously verified InstantLaunchStrategy contracts. Of the last three token candidates tested, two did not produce an eligible source and the third produced the recorded pool observation. Their rejection does not prove the tokens have no other markets.

A separate bounded public-RPC check of the previously verified graduated Pons fixture, token `0x0531d44ec26cc032c5d7f304ee5b7e74b00c093b`, at Robinhood block `61556154` did not resolve an eligible direct quote pool. This evidence therefore does not claim a successful live graduated-Pons price observation.

## Source selection and safeguards

Implementation: [server resolver](../../apps/server/src/onchain-price.ts), [official registry adapter](../../apps/server/src/onchain-price-registry.ts), and [domain schemas and exact arithmetic](../../packages/domain/src/onchain-price.ts).

- A verified official USD feed takes precedence. Robinhood stock tokens are identified through the issuer's chain-specific contract deployment, then matched to the corresponding tokenized-equity feed. A symbol alone cannot establish token identity.
- Stock prices are USD per token. The selected feed already incorporates the issuer's `uiMultiplier`; the resolver does not multiply the answer again. Each observation checks `oraclePaused`, the round timestamp, the published heartbeat, and the regular weekly market closure. Holiday/session freshness remains bounded by the feed heartbeat; the resolver does not maintain an exchange holiday calendar.
- Verified official feeds can be pinned while closed, paused, or stale. Their unavailable observations keep a watch waiting; they cannot satisfy a threshold. The live NVDA observation demonstrated this source-versus-observation distinction.
- Base uses its published sequencer uptime feed and a 3,600-second recovery grace period. No Robinhood sequencer uptime feed was present in the official catalog. Robinhood sources disclose that limitation and require a recent block, within 120 seconds, whose hash matches RPC. That fallback supports read-only alerts and is not a claim of equivalent sequencer coverage.
- Direct pool prices support official Uniswap v2/v3/v4 deployments, Base Aerodrome volatile pools, and the reviewed graduated Pons hook. Factory registration, pair identity and parameters are verified; v4 requires the complete pool key at the official PoolManager and StateView. Pons additionally requires the pinned factory/hook runtime hashes and current graduated registration.
- Quote units are canonical USDC on Base, USDG on Robinhood, or native/wrapped ETH. USD conversion requires a verified official quote-asset feed. An explicit USD request cannot silently become a stablecoin-unit or ETH-unit alert.
- The pool floor is 10,000 stable quote units or 5 ETH. For v2/volatile pools it uses quote reserves; for concentrated pools it uses the active equivalent quote amount derived from liquidity and square-root price. This is not total pool TVL, executable depth at an arbitrary slippage, or manipulation resistance.
- Prices and thresholds use exact integer ratios and decimal strings. Above/below comparisons are strict; equality does not match. Display rounding does not affect comparison. Threshold matching is pure arithmetic; the worker enforces stream/provider mode. The demo adapter labels its sources `Demo` and every observation carries `stubbed: true`.
- Each observation reads the requested block number and checks its hash before and after the read. A changed aggregator or pool identity requires source resolution again. Subscriptions include the pool and, where relevant, feed proxy, pinned aggregator, sequencer and stock-token dependencies.
- Observation calls share a 200-RPC-call budget per network/block. Each price read is also bounded to 40 calls; activation discovery has a separate bounded call budget. Public catalog reads are capped to 2 MB, time out after 10 seconds, and cache for 10 minutes.

Automatic discovery covers bounded v2/v3 factories, Aerodrome volatile pairs, common hookless v4 fee/tick-spacing keys, the fixed pools.trade key, and graduated Pons registration. Other v4 keys need a candidate with complete pool metadata from a supported indexer adapter. Candidates remain untrusted until independently verified. There is no Pons curve-price adapter, arbitrary-hook price adapter, Aerodrome stable-curve adapter, or invented USD peg.

## Reproduction approach

The probe was a temporary Bun script importing the same `createPriceResolver`, `liveTradingRpc`, `tradeEvmClient`, and `liveWalletStream` adapters as the application. It loaded Effect through the installed `dist/index.js` entry point, avoiding a second runtime instance when handling redacted configuration.

1. Read Froggy's linked production service configuration through the Railway CLI into process memory. Extract only the Base RPC endpoint and Pinax key needed for the already authorized Base proof. Never print or save the configuration response. The service was `393648df-65e9-4491-87f3-1b896c736b9f` in environment `44c2247f-e0a2-43f8-9b46-586a29126157`.
2. Verify `eth_chainId`. On Base, open one bounded stream using the compiled `packages/graph/substreams/froggy-wallet-activity-v0.1.0.spkg`, the stable-token price subscription, and start at RPC head minus two blocks. Stop after the first extended, non-truncated block, with a 25-second overall stream timeout. Compare its hash with `eth_getBlockByNumber`.
3. Resolve and read Base native ETH in USD and explicitly in USDC at that exact block. The selected direct pool must pass its normal production verification and depth checks; no fixture or supplied answer is used.
4. On Robinhood, use only the issuer-documented public RPC `https://rpc.mainnet.chain.robinhood.com`. Resolve/read native ETH in USD, join the official NVDA token deployment and resolve/read its USD feed, then query the four known launch strategies over at most 100,000 blocks and test at most three recent tokens in explicit ETH units.
5. Retain only network, label, proof boundary, resolved public source metadata, and decoded observation. The committed JSON contains no credentials, configured private RPC URL, wallet-account metadata, or conversation contents.

This price probe did not authenticate to Robinhood Substreams. Automatic approval review rejected that additional credential/destination combination, and it was not retried. Earlier independent Robinhood stream verification is separate evidence; it must not be represented as the source of the Robinhood block headers in this artifact.

Focused local verification at capture:

```sh
bun test packages/domain/src/onchain-price.test.ts apps/server/src/onchain-price.test.ts apps/server/src/onchain-price-registry.test.ts
bunx --bun oxlint --type-aware packages/domain/src/onchain-price.ts packages/domain/src/onchain-price.test.ts apps/server/src/onchain-price.ts apps/server/src/onchain-price.test.ts apps/server/src/onchain-price-registry.ts apps/server/src/onchain-price-registry.test.ts
```

Result: 16 tests passed; the six price files passed type-aware lint. Whole-application checks and browser/Telegram verification belong to the integration evidence.

## Primary provenance

- [Uniswap deployment feed](https://developers.uniswap.org/deployments.json) supplies the Base and Robinhood factory, PoolManager and StateView addresses. The resolver does not trust a candidate's claimed factory.
- [Aerodrome official contracts README](https://github.com/aerodrome-finance/contracts/blob/main/README.md) lists Base PoolFactory `0x420DD381b31aEf6683db6B902084cB0FFECe40Da`.
- [Circle's USDC contract registry](https://developers.circle.com/stablecoins/usdc-contract-addresses) identifies Base USDC; [Robinhood's canonical contracts](https://docs.robinhood.com/chain/contracts/) identify Robinhood USDG and wrapped ETH.
- [Chainlink's official chain metadata source](https://github.com/smartcontractkit/documentation/blob/main/src/features/data/chains.ts) explicitly selects the [Base catalog](https://reference-data-directory.vercel.app/feeds-ethereum-mainnet-base-1.json) and [Robinhood catalog](https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json). Both public catalog decoders were exercised live. Hidden feeds are excluded.
- [Robinhood stock-token API documentation](https://docs.robinhood.com/chain/stock-token-apis/) documents the issuer registry used at [the public assets endpoint](https://api.robinhood.com/rhj/assets). The live NVDA contract-to-feed join was verified.
- [Chainlink's Robinhood tokenized-equity documentation](https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood) defines the multiplier-adjusted token value, token oracle pause flag, and 24/5 feed behavior. [Robinhood's oracle documentation](https://docs.robinhood.com/chain/oracles-and-price-feeds/) describes issuer integration expectations.
- [Uniswap InstantLaunchStrategy v3.2.0](https://github.com/Uniswap/liquidity-launcher/blob/v3.2.0/src/strategies/InstantLaunchStrategy.sol) defines the hookless native-ETH pool key with fee 2500 and tick spacing 25. Existing deployment verification is recorded in [POOLS_TRADE_DEPLOYMENTS.md](POOLS_TRADE_DEPLOYMENTS.md).
- [PONS_DEPLOYMENTS.md](PONS_DEPLOYMENTS.md) records the existing reviewed Pons factory/hook hashes and fixtures used by the resolver; the alert feature does not introduce a new deployment identity.
