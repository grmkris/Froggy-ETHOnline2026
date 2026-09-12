# Pons execution evidence

9 September 2026. These checks establish bounded local behavior and compatibility with the observed contracts. No mainnet transaction was submitted. Live Privy signing and Tenderly simulation on Robinhood remain separate operator activation checks; `PONS_EXECUTION_ENABLED` defaults to false.

## Primary deployment sources

- [Pons V2 source and deployment README](https://github.com/ponsdotdev/ponsfamily/tree/8b9bf371030279133017b5c1b713823f5889c5d2): factory and curve semantics. The implementation follows its buy refund and proportional price bound, and its sell reserve checks.
- [Robinhood network configuration](https://docs.robinhood.com/chain/connecting/) and [canonical contracts](https://docs.robinhood.com/chain/contracts/): chain 4663, ETH gas and six-decimal USDG.
- [Uniswap deployment feed](https://developers.uniswap.org/deployments.json): PoolManager, StateView, V4Quoter, UniversalRouter and Permit2. The router is the current published deployment, not the older router used in the Trading Desk research.
- [Arbitrum gas and fees](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees): Nitro's parent-chain component is converted into gas units inside `gasUsed`. It must not be added again as a separate `l1Fee`.

The read-only factory getters bind its hook, launch deployer and pool manager. Every preparation and pre-sign check verifies the observed runtime hashes, registered launch, currency pair, phase, curve bindings, pool key and current state. State becoming ready for graduation or changing phase requires a new proposal.

## Observed runtime identities

Observed at block `58375958`, hash `0x8f3f1361377a38b20817bca272d62ac69bd04608db546194ca0a911908cdbae0`.

| Dependency | Address | Runtime keccak256 |
| --- | --- | --- |
| factory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` | `0x89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84` |
| hook | `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044` | `0xc21b1e6c1b45403e81a581f22ed6d9c747997af1cfdac1b1dc9f4b1d346a10db` |
| deployer | `0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42` | `0xeade22566c766377f6adfb99534f2772251efad9568642c0704a7051418e624c` |
| manager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | `0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626` |
| state | `0xF3334192D15450CdD385c8B70e03f9A6bD9E673b` | `0x7d9c591e0956fd89d98feb4ffcfe8bf1f7a62bd485edd979fa21d104b49878a6` |
| quoter | `0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94` | `0xd707b1da8cb165e5ea35a3b4450d971eb562ec171e23492aa117036b78a868f6` |
| router | `0x06AfBA43Fd06227fA663b0DAecF536f6EaA6bf99` | `0xbe8e8191bb42d843c2e948a5a55772eaab864ce01e54dcd47c9d089170b302d5` |
| permit | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | `0x5208783f52488f7d3493e5e38311ab707c1d75457fe472a19b0b4d57d66a7fca` |
| quote | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6` |

## Token template fingerprint

Observed at block `60969329` on eight factory-registered tokens (including the curve and graduated fixtures below). Every token's runtime is exactly 3248 bytes. Three 20-byte immutable address slots differ between tokens — deployer/fee recipient at offsets `391` and `541`, and the registered curve at offset `1106`. Zeroing those slots before hashing yields one shared fingerprint:

| Field | Value |
| --- | --- |
| length | `3248` |
| maskedOffsets | `391, 541, 1106` |
| masked keccak256 | `0x36133854884d6c3e4287713e2d4f213db1fcc39913fcdf619960ab8fd0bd9101` |

A factory registration plus this masked hash match is the control screen for a genuine, unmodified Pons V2 token. A registration without a hash match is reported, not treated as a clean template.

## Synthetic local fork

A localhost-only Anvil fork used synthetic ETH and USDG balances and an impersonated local test address. Its upstream proxy allowed only reads pinned to one block, rejected transaction-submission methods and never forwarded local transaction identifiers. Synthetic balance changes were accepted only after an independent token balance read matched the injected amount.

Source block `58395433`, hash `0x62f4f84fe0ed00f437c35f3951d4b868bfbde7276c9403ff1c7b64e58b691235`.

The production Pons state reader, quoter and transaction builder generated every tested allowance and swap. Each allowance and swap succeeded. Exact net output matched the quote in all four cases:

| Phase | Direction | Input used (base units) | Quoted and received output (base units) | Local swap gas |
| --- | --- | --- | --- | --- |
| curve | buy | 1000000 | 266644045596512616028756 | 131361 |
| curve | sell | 266644045596512616028756 | 980100 | 96450 |
| graduated | buy | 1000000 | 343366633483416723866650 | 194824 |
| graduated | sell | 343366633483416723866650 | 960409 | 175699 |

Curve token: `0xF07f625E92e75d519f3287fb33D16b8D24318b0a`; registered curve: `0xb21d435363dec74d845e2081ceb3e6bbd0795e2a`. Graduated token: `0x0531d44ec26cc032c5d7f304ee5b7e74b00c093b`. These are verification fixtures, not recommended assets or production defaults.

The graduated route used the published UniversalRouter with one V4 exact-input action, bounded settlement and owner-directed collection. The quote already includes hook fees; receipt accounting does not subtract them again. Local gas is not a measurement of mainnet Nitro data costs.

## Receipt and regression checks

The existing public [curve transaction](https://robinhoodchain.blockscout.com/tx/0x92ef61b29ca17d34f2e5e8bde18f91d922ef818641af4cea9ed652890869935c) reports `gasUsedForL1: 0x0`, `gasUsed: 0x4f3e3` and `effectiveGasPrice: 0x13492240`; the product is `105020781240000` wei. Reading this historical receipt did not submit a transaction.

Unit tests cover allowance reset and amount caps, nonce sequencing, gas-budget refusal, recipient/minimum tampering, phase changes, unavailable curve liquidity, proportional rounding, net refunds, missing/duplicate/foreign curve events, and Nitro parent-gas evidence. Partial refunds are tested with decoded receipt fixtures; the four fork swaps above consumed their full input.

Mobile demo buy/sell checks at 320px verify the visible simulation marker, approved phase, maximum input, proportional minimum explanation, approval, settlement, reload persistence, no horizontal overflow and no browser exceptions. Demo results do not establish live settlement.

Raw local evidence is retained under `.froggy/pons-*-evidence.json`. Those files contain synthetic local transaction hashes; they must not be presented as mainnet receipts. The public explorer blocked source API access during this check; router compatibility was established through the pinned deployment feed, runtime identity and local fork swaps.
