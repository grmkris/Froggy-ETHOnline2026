# Froggy wallet activity

Bounded wallet and price-source activity on Base and Robinhood Chain for the existing Froggy Watchlist. Chain selection belongs to the configured stream endpoint; no deployed addresses or network-specific branches live in the WASM.

`map_wallet_activity` composes Pinax's native transfer and ERC20 transfer modules with successful transaction call/log evidence. Parameters accept the original comma-separated list of at most twenty EVM addresses, including the empty string, or JSON with `addresses` and optional `priceSources`:

```json
{
  "addresses": [],
  "priceSources": [
    {
      "key": "token:usd",
      "contract": "0x0000000000000000000000000000000000000001",
      "poolId": null
    }
  ]
}
```

The address above is a schema example. Sources come from the server's verified pool/feed/proxy/token/sequence configuration. There may be twenty distinct source keys and one hundred concrete subscriptions. Repeated keys allow one price to subscribe to several dependencies. A successful receipt log from the configured contract marks its key in `changedSources`, once per block; a non-null `poolId` also requires an exact 32-byte match in indexed topic 1. This is a change signal, not a price or proof that a source is trustworthy.

Every sealed block emits progress and `changedSources`, even with no wallet subscriptions or no matching activity. Wallet evidence collection is skipped for price-only streams. Each block contains at most 200 wallet transactions and each transaction at most 200 transfers and 200 combined swap/curve candidates; overflow is explicit. Native transfers exclude root duplication, failed/reverted calls and DELEGATECALL; ERC721's four-topic Transfer is excluded.

Swap events are **candidates**. A sink must verify the emitting deployment and attribute connected wallet flows before presenting a trade. The transaction's sender, a router's address, or a generic Swap topic alone is not attribution. Pons `CurveBuy`/`CurveSell` events are also candidates, returned as `curvesPons` with side, actor, recipient, integer input/output amounts, fee, tax and log/call location. Receipt-only block models preserve candidate logs with an unknown (zero) call scope. The server must verify the curve registration and connect wallet flows before treating these as Pons trades.

This module does not assign prices, identify meme coins, or execute transactions.

## Build

Requires Rust 1.90+, the `wasm32-unknown-unknown` target, protoc, and Substreams CLI v1.22.0. Generated Rust protobufs remain in Cargo's build output.

```sh
cargo test --locked --lib
cargo build --locked --release --target wasm32-unknown-unknown
substreams pack substreams.yaml -o froggy-wallet-activity-v0.1.0.spkg
```

Do not run a bare pack after editing Rust: it packages the existing WASM. Commit the lockfile and regenerated package together. `vendor/sources.json` records the pinned upstream package/protobuf hashes, combined descriptor hash, rebuilt package/WASM hashes and license. Refresh those hashes after a rebuild.

**Descriptor mismatch:** the upstream checkout's protobuf text differs from its published artifacts. The embedded ERC20 `Log` has no `block_index`, and its `Call` uses `caller=1,index=2,depth=3,call_type=4`, unlike the newer source layout. `build.rs` therefore derives Rust transfer bindings from `vendor/transfer-descriptors.bin`, extracted from the two pinned packages. The source `.proto` files remain provenance references, not the decoding contract. Changing this to compile the source files silently corrupts call metadata. Receipt log positions and full call evidence come from the raw block.

The additive protobuf fields retain `froggy.wallet.v1` compatibility. Consumers must fence checkpoints with `identity()` (package SHA256, module name and adapter schema v2) and the configured network; the changed binary cannot reuse an older package checkpoint silently. Address-only requests preserve their legacy params. A request with price subscriptions refuses an old package descriptor instead of silently omitting price events.

## Event layout sources

- [Uniswap v2](https://github.com/Uniswap/v2-core/blob/master/contracts/interfaces/IUniswapV2Pair.sol)
- [Uniswap v3](https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol)
- [Uniswap v4](https://github.com/Uniswap/v4-core/blob/main/src/interfaces/IPoolManager.sol)
- [Aerodrome classic](https://github.com/aerodrome-finance/contracts/blob/main/contracts/interfaces/IPool.sol)
- Pons CurveBuy/CurveSell layouts: reviewed Froggy adapter `apps/server/src/trading/venues/pons.ts`; this module does not assert deployment identity.
- [Pinned Pinax composition](https://github.com/pinax-network/substreams-evm/tree/970a665e15619de8ad7f686bd89412a1030d46dc)

Development followed StreamingFast's `substreams-dev`, `substreams-ethereum`, and `substreams-sink` skills. The installed JavaScript SDK v0.16.0 uses the v2 request API; use its installed types, not the current main-branch SDK examples.

## Live adapter verification — 13 September 2026

The rebuilt package (`3ae6a411d679c10cd04cde1ae87e54562ea51c762b49aa8127fe3858f98db6ec`) passed the Bun Connect transport with the configured Pinax key on both endpoints. Each probe first discovered a public ERC20 contract from recent upstream events, then replayed that block through Froggy's adapter with no wallet subscriptions.

| Network | Price-only block | Result | Changed-parameter cursor resume |
| --- | --- | --- | --- |
| Base | 51235482 | `changedSources=["probe:token"]`, zero wallet rows, extended block | 51235483, empty progress |
| Robinhood | 61540462 | `changedSources=["probe:token"]`, zero wallet rows, extended block | 61540463, empty progress |

Observed block-to-probe lag was 6082 ms on Base and 2169 ms on Robinhood. These single samples establish working live change detection and resume, not a latency SLA, calculated price correctness, verified trade attribution or Telegram delivery. The probes made no database writes, signatures, transfers or Telegram sends.
