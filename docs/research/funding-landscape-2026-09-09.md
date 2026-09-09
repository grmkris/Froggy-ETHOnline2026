# Funding landscape for Froggy — 9 September 2026

**Ship Privy’s own deposit addresses this week, not a third-party UDA.** Enable crypto deposits to native USDC on Base (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) with `source.mode: "all"` ([create API](https://docs.privy.io/wallets/funding/crypto-deposits/create-deposit-account), [blog 28 May 2026](https://privy.io/blog/introducing-universal-deposit-addresses)). Keep the copy-address fallback. Add Coinbase “send existing crypto” next to the card: **$0 Coinbase fee** ([CDP FAQ](https://docs.cdp.coinbase.com/onramp/additional-resources/faq)).

**BTC / long-tail:** Relay `POST /quote/v2` `useDepositAddress: true` (self-serve, 61 chains). **EU fiat:** Stripe Embedded needs L2 ID+selfie; hosted Stripe **does not** deliver USDC on Base in the EU ([hosted currencies](https://docs.stripe.com/crypto/onramp/stripe-hosted)). Lightest first buy: Banxa Express €0–500, no ID. Recurring EUR: Bridge SEPA via Privy.

**Do not** use Biconomy MEE as a deposit address, **do not** let the agent sign bridges, **do not** treat “any token” as literal — every rail is an allowlist plus a USD floor. Destination of record is native Base USDC; USDbC will not pay a Graph 402.

Methods: eight parallel researchers against provider docs, API references, pricing pages, and changelogs, plus independent fetches of the same primary URLs. Numbers without a URL are marked **UNVERIFIED**. No live quotes were purchased. Live `/chains` snapshots (Relay, Openfort) were taken on 9 September 2026 and will drift. Froggy today: copy the Privy Base address (“send USDC on Base”) plus `fund()` with `source.defaultAsset: "eur"`.

---

## Comparison table (what actually decides the choice)

| Provider | Shape | Person signs? | BTC | Solana | Dest USDC Base | Reusable address? | Arrival signal | Hostile / junk tokens | Production | Notes for Froggy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Privy crypto deposits** | Persistent UDA on the existing wallet | No | No (EVM+SOL only) | Yes | Yes | Yes | Automations + swap; **no documented funding webhook** | Recoverable via key export | GA 28 May 2026 | **First pick.** Dashboard + `depositAccounts.crypto.create`. |
| **Privy card onramp** | `fund()` modal | Card KYC, not a chain signature | n/a | n/a | Yes (embedded) | n/a | `submitted` / `confirmed` | n/a | GA; Stripe Embedded is private preview | Already wired. EU = Stripe L2 KYC. |
| **Privy / Bridge VA** | Named IBAN / ACH | Bank KYC, then SEPA/ACH | n/a | n/a | Yes (`payment_rail: base`) | Permanent bank details | Bridge `payment_processed` | Dust not returned | Production | Best recurring EUR. KYC before the IBAN exists. |
| **Relay deposit addresses** | Quote with `useDepositAddress: true` | No | Yes (native BTC, 1–2 conf) | Yes (solver SPL only) | Yes, native `0x833589…` | Open: same route. Strict: one-shot | Poll `/requests/v3` or webhook `request.status.updated` | **Non-solver tokens not recoverable** | Production, self-serve | Best self-serve “any solver token”. Origin is an allowlist. |
| **Openfort Funding** | Session + mint per route (Relay underneath) | No | **No** in live `/v2/funding/chains` | Yes | Yes, first-class example | `strict: false` reusable per route | `funding.session.updated` HMAC | Same as Relay | Live 19 Jun 2026 | Works as dest = Privy address. Extra Openfort ops fee. |
| **Particle Simple Deposit** | One EVM + one SOL address → always USDC | No | No L1 (`BTC` is a token type, not `bc1`) | Yes | Yes (`CHAIN.BASE`) | Deterministic UA | **Client poll only, not a server webhook** | `minValueUSD` default $0.50; unwatched tokens sit | Docs treat as live | Particle Auth Core is the intermediary. Custom project ID: **1%**. |
| **Biconomy MEE / Nexus** | Supertransaction | **Yes, once** | No | No | Yes after the signed flow | Nexus address is not an auto-swap inbox | Poll explorer | Quote fails / cleanup | MEE production | Wrong primitive. UDA demo has **no public mint API**. |
| **NEAR Intents 1-Click** | Per-quote `depositAddress` | No (send to address) | Yes | Yes | Yes (set dest assetId) | Quote `deadline`; not persistent | Poll `/v0/status` | Quote-then-send; refunds | Production, no testnet | Widest chain list. JWT avoids the extra **0.2%**. |
| **LI.FI Smart Deposit Addresses** | Per-quote unique address | No | Beta as source | Yes (gated) | Yes | 24 h, single-use; extras accumulate | `GET /v1/status?depositAddress=` | No native ETH in; no fee-on-transfer | **Enterprise, per-key enable** | Announced 19 Aug 2026. Not self-serve. |
| **Rhino.fi SDA** | One standing address | No | Documented inbound | Separate POST | Yes (`tokenOut: USDC`) | 7-year watch | Webhooks | KYT before credit; **&lt;$5 not processed** | Production, commercial | Strongest “one address forever” if you take a Rhino account. |
| **Fun.xyz UDA** | Checkout Transfer Crypto | No | Yes | Yes | Yes (into the dapp token) | **Do not store** (help centre) | Widget status | Unsupported = **irrecoverable** | Production (Polymarket, Ostium, Lighter) | First-party REST is gated. Retail mins $3–$10. |
| **Socket V3 `userOps=deposit`** | Per-quote address | No | Not in V3 source list | Yes | Yes | Older Bungee: **10 min, one deposit** | Poll `/v3/swap/status` | Socket: 0 extra fee | Production | Quote-scoped, not a standing address. |
| **Gum.ag** | GET deposit-addresses | No | No | Yes (in sample) | Yes | UNVERIFIED | UNVERIFIED | Below min “may be lost” | REST live | Sample: **$0.30** + **1 USDC** min. USDC-in. |
| **Rhinestone Deposits** | Register managed dest | No | No | Yes | Yes (quickstart is Base USDC) | Deterministic | `bridge-complete` | UNVERIFIED | Production | Self-custodial SCA. Never takes custody. |
| **ZeroDev Smart Routing Address** | CREATE2 intent address | No | UNVERIFIED | UNVERIFIED | Yes | Persistent | Status helper | Listed `srcTokens` only | Production SDK | Non-custodial. Native ETH as input: UNVERIFIED. |
| **Bridge.xyz liquidation address** | Permanent stables inbox | No | No | USDC/CASH/USDB | Yes | Permanent | Drain webhooks | **Stables only**; wrong asset may be lost | Production, KYC | EEA: USDC & EURC only. |
| **CCTP V2** | Burn on source, mint on Base | **Yes on source** | No | Yes (USDC) | Native mint | n/a | Poll Iris | Only native USDC | Production | Recipient signs nothing. Initiator needs a source wallet. |
| **Coinbase withdraw Base** | CEX send | Exchange 2FA | n/a | n/a | Yes | The Froggy address | Balance poll | Coinbase allowlists networks | Production | $0 Coinbase fee on existing crypto via Pay. |
| **1inch Fusion+** | Gasless intent | **One EIP-712** | No | Yes | Yes | n/a | Poll orders | Resolver refuses junk | Production | Best *same-EOA* path. Not a CEX send. |
| **LI.FI / Squid / deBridge / Rango / 0x / Enso / Across swap** | Quote + source tx | Yes (except Across gated deposit addresses) | Varies | Varies | Yes | n/a | Poll | Quote simulation | Production | Worse than a deposit address unless funds already sit on the Privy EOA. |

---

## 1. Universal deposit addresses

### 1.1 What Froggy actually needs

A product is a match only if:

1. The person can **send a plain transfer** (wallet, CEX withdraw, onramp) with **no dapp signature**.
2. The fill lands as **native USDC on Base** at the Privy address the agent already spends from.
3. Froggy does **not** widen `docs/privy-agent-policy.json` so the agent can call a router.

Biconomy MEE, LI.FI `/quote`, Enso shortcuts, and Across `/swap/approval` fail (1) or (3). They are section 2.

### 1.2 Privy (already in the stack)

**Product.** “Universal deposit addresses”, GA 28 May 2026. One persistent address per user; Privy bridges/swaps inbound assets into the destination you configure. [Blog](https://privy.io/blog/introducing-universal-deposit-addresses). API name in current docs: **crypto deposit accounts**. [Overview](https://docs.privy.io/wallets/funding/crypto-deposits/overview).

**Auth.** App ID + secret. User JWT on the create call.

**Mint.**

```ts
await privy.wallets().depositAccounts.crypto.create(walletId, {
  type: "inline_route",
  source: { mode: "all" }, // or include/exclude a list
  destination: { asset: "usdc", chain: "eip155:8453" },
  authorization_context: { user_jwts: [userJwt] },
});
```

[Create a crypto deposit account](https://docs.privy.io/wallets/funding/crypto-deposits/create-deposit-account).

**Same chain type as the wallet:** the deposit address **is** the wallet. A wallet automation converts inbound tokens in place. **Different chain type (Solana → EVM):** Privy provisions a sibling wallet with the same `owner`. [Overview](https://docs.privy.io/wallets/funding/crypto-deposits/overview).

**Sources.** Docs: “Chains must be EVM or Solana.” Bitcoin as a crypto-deposit **source is UNVERIFIED** on this API. (Older `useFundWallet` lists Bitcoin as a *destination* chain — different product.)

**Dest USDC Base.** Yes. `destination.chain` must match the wallet `chain_type`.

**Fees.** **UNVERIFIED** as a published bps table. Under the hood: [wallet automations](https://docs.privy.io/controls/automations/overview) + [swap API](https://docs.privy.io/financial-flows/swap). Setup requires **swaps** and **app-pays gas sponsorship** on every source chain. [Setup](https://docs.privy.io/wallets/funding/crypto-deposits/setup). Froggy pays that gas budget.

**Lifetime.** “Safe and reusable; the same address works for every future deposit on the configured route.” [Overview](https://docs.privy.io/wallets/funding/crypto-deposits/overview).

**Arrival.** No funding-event webhook named in the crypto-deposits pages. Poll the Base USDC balance (Froggy already does, “about a minute after the transfer confirms” in `add-funds.tsx`).

**Custody.** Receiving wallet has the same `owner` as the target. “Invalid assets sent to that wallet are cryptographically recoverable through private key export.” [Overview](https://docs.privy.io/wallets/funding/crypto-deposits/overview). That is the best hostile-token story in this file.

**Rate limits.** **UNVERIFIED** on these pages.

**Production.** Blog: “live today for all Privy accounts.” Enable on the Funding page. [Dashboard](https://dashboard.privy.io/apps).

**Prerequisite Froggy does not have yet:** swaps + app-pays on each source chain. Without those, `deposit_accounts` cannot be created. [Setup](https://docs.privy.io/wallets/funding/crypto-deposits/setup).

### 1.3 Relay (relay.link)

**Product.** Not a separate mint resource. `POST https://api.relay.link/quote/v2` with `useDepositAddress: true`. User sends a plain transfer. Relay sweeps into the Depository and fills dest from solver inventory. [Feature guide](https://docs.relay.link/features/deposit-addresses). Protocol: CREATE2 + EIP-1167 counterfactual proxies. [Protocol](https://docs.relay.link/references/protocol/components/deposit-addresses).

**Auth.** Optional `x-api-key` on quote; **required** on `/requests/v3` and webhooks. Self-serve at [dashboard.relay.link](https://dashboard.relay.link). [API keys](https://docs.relay.link/references/api/api-keys).

**Mint (open address, ETH Base → OP example from docs):**

```bash
curl -X POST 'https://api.relay.link/quote/v2' \
  -H 'Content-Type: application/json' \
  -d '{
    "user": "0xF0AE622e463fa757Cf72243569E18Be7Df1996cd",
    "originChainId": 8453,
    "originCurrency": "0x0000000000000000000000000000000000000000",
    "destinationChainId": 10,
    "destinationCurrency": "0x0000000000000000000000000000000000000000",
    "tradeType": "EXACT_INPUT",
    "recipient": "0xF0AE622e463fa757Cf72243569E18Be7Df1996cd",
    "amount": "100000000000000000",
    "useDepositAddress": true,
    "refundTo": "0xF0AE622e463fa757Cf72243569E18Be7Df1996cd"
  }'
```

Response carries `steps[].depositAddress` and `requestId`. [Feature guide](https://docs.relay.link/features/deposit-addresses). For Froggy, set `destinationChainId: 8453`, `destinationCurrency: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, `recipient` = Privy address.

**Open vs strict.** Open: variable amount, reusable same route, may adapt token/chain within a VM. Strict: `refundTo` required, one-shot. Changelog **2026-09-08**: `strict` is ignored on `/quote/v2`; behaviour follows trade type (`EXACT_OUTPUT` ≈ one-time). Confirm against the live OpenAPI before coding. [Changelog](https://docs.relay.link/changelog).

**Sources (live `GET https://api.relay.link/chains`, 9 Sep 2026).** 61 mainnet chains. **Bitcoin yes** (id `8253038`, native BTC only). **Solana yes** (id `792703809`); deposit-address solver currencies on that snapshot were PENGU, USDC, USDT, CASH, PYUSD, USDG, SOL — **not** “any Jupiter token”. Jupiter “any token” is the **signed** swap path. [Solana](https://docs.relay.link/references/api/api_guides/solana). Origin for deposit addresses is **`solverCurrencies` only**. [Caveats](https://docs.relay.link/features/deposit-addresses).

**Dest USDC Base.** Native Circle USDC `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`, 6 decimals, in Base `solverCurrencies`. Docs include a BTC → Base USDC example. [Bitcoin](https://docs.relay.link/references/api/api_guides/bitcoin).

**Fees** ([fee structure](https://docs.relay.link/references/api/api_core_concepts/fees)):

| Component | Amount |
| --- | --- |
| Execution | **$0.02 flat** + destination fill gas |
| Platform, token bridge / wrap | **0.00%** |
| Platform, stablecoin swap | **0.01%** |
| Platform, major swap | **0.06%** |
| Platform, minor swap | **0.15%** |
| Deposit-address extra gas | ~33k (native) / ~70k (ERC-20) |

Sender pays origin gas to the deposit address. Remaining fees come out of the fill. `sponsoredFeeComponents` **does not work** on deposit addresses. [Fees](https://docs.relay.link/references/api/api_core_concepts/fees). App fees (integrator bps) **do** work on this flow. [App fees](https://docs.relay.link/features/app-fees).

**Minimums.** Same-chain swap USD value **&gt; 0 and &lt; $0.05** → `AMOUNT_TOO_LOW` (2026-04-28 changelog). No global dollar floor for cross-chain deposit addresses; too-small open deposits refund if `refundTo` is set. App-fee extra swap must be **&gt; $0.025**. [Changelog](https://docs.relay.link/changelog).

**Lifetime.** Open addresses reusable for the same route. Same CREATE2 address exists across EVM chains (wrong-chain recovery via reindex). Support article: quote pricing guaranteed **30 s**. [How do deposit addresses work](https://support.relay.link/en/articles/10269920-how-do-deposit-addresses-work).

**Arrival.** Poll `GET https://api.relay.link/requests/v3?depositAddress=` (`x-api-key` required). Webhook event `request.status.updated`, HMAC-SHA256 of `${timestamp}.${body}` with the API key, headers `X-Signature-Timestamp` / `X-Signature-SHA256`, up to 10 retries. [Webhooks](https://docs.relay.link/references/api/api_guides/webhooks). Websocket: `wss://ws.relay.link?apiKey=`. BTC: status `pending` in mempool; fill waits **1 confirmation** typical, **2** for high-value; blocks can take **30–50 min**. [Bitcoin](https://docs.relay.link/references/api/api_guides/bitcoin).

**Custody.** EVM deposit address has **no private key** (counterfactual proxy). BTC/SOL deposit wallets: Lit Protocol PKP in a TEE. After sweep: non-upgradable Depository; BTC Depository is MPC. “Funds are typically held for seconds to minutes.” [Security](https://docs.relay.link/references/protocol/security). Integrators **cannot yet independently derive** the address from order data. [Input validation](https://docs.relay.link/references/api/api_core_concepts/input-validation).

**Rate limits (default per key).** `/quote` **50/min**; `/requests` **200/min**; elevated `/quote` **10 rps**. [API keys](https://docs.relay.link/references/api/api-keys).

**Production.** Self-serve, no waitlist. Commerce page claims 99.9%+ reliability and sub-3 s on most routes — **not a contractual SLA**. [Commerce](https://docs.relay.link/solutions/commerce-and-payments). Status: [status.relay.link](https://status.relay.link/).

**Hostile tokens.** “Non-solver tokens and NFTs sent to deposit addresses are **not recoverable** through normal processes.” Wrong solver token: sometimes requote, else [relay.link/withdraw](https://relay.link/withdraw). CEX senders: do **not** set `refundTo` to the user (the sender is the exchange hot wallet); use an app-controlled address + `recoveryAddress`. [Refunds](https://docs.relay.link/features/deposit-addresses).

### 1.4 Openfort

**Product.** Funding sessions. Marketing says “one address per user, across every supported chain” ([UDA blog, 19 Jun 2026](https://www.openfort.io/blog/universal-deposit-address)). REST says crypto transfers mint **a single deposit address per route**. [Funding overview](https://www.openfort.io/docs/configuration/funding/). The rail is **Relay**.

**Auth.** Publishable key `Authorization: Bearer pk_…`. Secret-key server flow is still “Coming soon.” [Headless](https://www.openfort.io/docs/configuration/funding/headless).

**Mint.**

1. `POST https://api.openfort.io/v2/funding/sessions` with `target: { chain: "eip155:8453", currency: "0x833589…", address: privy }`.
2. `POST /v2/funding/sessions/{id}/payment_methods` — **this mints** `receiverAddress`.

[Headless](https://www.openfort.io/docs/configuration/funding/headless).

**Sources.** Documented: Base, Arb, OP, Polygon, Ethereum, BNB, Solana. Live `GET /v2/funding/chains?livemode=true` on 9 Sep 2026: Relay EVM + Solana. **No Bitcoin.** Tokens = Relay solver currencies.

**Dest USDC Base.** Yes; the docs use that example. Fiat onramp “mainnet-only, delivering USDC on Base, Ethereum, Polygon, Arbitrum, Optimism, or Solana.” [Funding](https://www.openfort.io/docs/configuration/funding/).

**Fees.** Openfort ops: Free $0/mo + 2,000 ops then **$0.01/op**; Growth $99/mo + 25,000 then **$0.008/op**. [Pricing](https://www.openfort.io/pricing). Whether a funding-session create counts as an op: **UNVERIFIED**. Route fees are Relay’s, in `paymentMethod.fees[]`. Sender pays (deducted from inbound).

**Lifetime.** Session `expiresAt`. Webhook example is 24 h — **example only**. `strict: false` (default) reusable for the route. Terminal: `succeeded` | `bounced` | `expired`.

**Arrival.** Webhook `funding.session.updated`, HMAC `openfort-signature`. Poll `GET /v2/funding/sessions/{id}`. [Webhooks](https://www.openfort.io/docs/configuration/webhooks).

**Custody.** In-flight funds sit in Relay’s depository. Bounce refunds on the **source** chain, less gas.

**Production.** UDA live 19 Jun 2026; fiat onramp 28 Aug 2026.

### 1.5 Biconomy

**MEE / Nexus / Supertransactions** are production orchestration. The user **signs once**. `toMultichainNexusAccount` computes a counterfactual address; sending tokens there does **not** auto-swap. [What is MEE](https://docs.biconomy.io/new/learn-about-biconomy/what-is-mee). Base is a supported chain. [Supported chains](https://docs.biconomy.io/contracts-and-audits/supported-chains). Bitcoin and Solana: **no**.

**“Universal Deposit Address” demo** (Feb 2026, [universal.biconomy.io](https://universal.biconomy.io/)): claimed silent deposit, Privy + Across, early access Google Form. **No mint endpoint in docs.biconomy.io.** Do not invent one.

**Verdict.** Wrong primitive for Froggy funding. Useful later if the person already has tokens in the Privy EOA and you want one signed Supertransaction (that is a policy expansion).

### 1.6 Particle Network

Two products.

**Simple Deposit** (`@particle-network/simple-deposit`) is the silent-deposit one. “Deposit address for every chain supported by Universal Accounts… bridged to your configured destination chain in **USDC**.” [Overview](https://developers.particle.network/simple-deposit/overview).

```ts
const client = new DepositClient({
  ownerAddress: privyAddress,      // generation reference only
  intermediaryAddress: "0x…",      // Particle Auth Core JWT wallet
  authCoreProvider: provider,      // required to sweep
  destination: { chainId: CHAIN.BASE },
  minValueUSD: 0.5,
});
await client.initialize();
const { evm, solana } = await client.getDepositAddresses();
```

[Core SDK](https://developers.particle.network/simple-deposit/core-sdk). **No documented REST mint.** Incompatible with Particle Connectkit/Authkit.

**Sources.** 17 chains in `CHAIN` (ETH, OP, BNB, Polygon, Monad, Sonic, X Layer, HyperVM, Merlin, Mantle, Base, Arb, Avalanche, Linea, Plasma, Berachain, Solana). Default tokens: ETH, USDC, USDT, BTC, SOL, BNB. **`BTC` is not a Bitcoin L1 address** (addresses are `0x` + Solana base58). UA Primary Assets (stricter spend list): ETH, USDT, USDC, SOL, BNB on ETH/BNB/X Layer/Base/Arb/Solana. [UA chains](https://developers.particle.network/universal-accounts/chains).

**Dest.** Always USDC. `CHAIN.BASE` = 8453. Optional `destination.address` (defaults to `ownerAddress`).

**Fees.** Own `uaProjectId`: “deposits are subject to a **1% fee** going to Particle.” [Reference](https://developers.particle.network/simple-deposit/reference). Default SDK project fee: **UNVERIFIED**. `minValueUSD` default **0.50** (quickstart example uses `1`). [Quickstart](https://developers.particle.network/simple-deposit/quickstart). GitHub runbook default **0.50**. [RUNBOOK](https://github.com/Particle-Network/universal-deposit/blob/main/sdk/docs/RUNBOOK.md).

**Arrival.** `pollingIntervalMs` default **3000**. Events are **client-side and best-effort**. “Don't use them as the source of truth for crediting funds.” [Core SDK](https://developers.particle.network/simple-deposit/core-sdk). Froggy would need its own watcher.

**Custody.** Deposit lands in a Particle Auth Core intermediary + Universal Account. Solvers are Particle-operated. [Universal Liquidity](https://developers.particle.network/intro/what-is-ul). More Particle-custodial in flight than Relay’s non-upgradable depository.

**Universal Accounts** themselves: one EVM UA + one Solana UA, unified balance, **signature required** to spend across chains. 7702 mode works with Privy `signAuthorization()`. That is spend-side chain abstraction, not a funding inbox.

### 1.7 Other current deposit-address products

**Rhino.fi Smart Deposit Addresses.** `POST https://api.rhino.fi/sda/deposit-addresses` with `destinationChain: 'BASE'`, `tokenOut: 'USDC'`. Reusable, monitored **7 years**, webhooks, KYT before credit. Deposits **below $5** not processed. Test default **500 SDAs / 50 per hour**. [SDA](https://docs.rhino.fi/api-integration/smart-deposits), [get started](https://docs.rhino.fi/get-started/sda). Strongest “one standing address” if Froggy will take a commercial account.

**LI.FI Smart Deposit Addresses.** Announced **19 Aug 2026**. Enterprise, enabled per integrator key. Unique address per quote, valid **24 hours**; extras accumulate. Failed/expired refunded, LI.FI covers gas. Native EVM tokens (ETH, BNB) **not** supported as input; **fee-on-transfer tokens not supported**. Bitcoin → EVM **beta**. Solana lane gated separately. Status: `GET /v1/status?depositAddress={address}&fromChain={chainId}`. [Docs](https://docs.li.fi/enterprise/smart-deposit-address), [blog](https://li.fi/knowledge-hub/introducing-smart-deposit-addresses).

**NEAR Intents 1-Click.** `POST https://1click.chaindefuser.com/v0/quote` → `depositAddress`. Send, then `GET /v0/status?depositAddress=`. JWT: protocol fee only **0.0001% (1 pip)**; without key **+0.2%**. [Fees](https://docs.near-intents.org/resources/fees). Chains include Bitcoin (all address types), Solana, Base, Tron, TON, Sui, XRP, Stellar, Aptos, Cardano, … [Chain support](https://docs.near-intents.org/resources/chain-support). Quote-scoped, not a forever address. No testnet.

**Fun.xyz UDA.** Used by Polymarket, Ostium, Lighter. Help centre: “Sending non-supported tokens may cause an irrecoverable loss.” Direct Deposit mins: **$50 Ethereum**, **$10** Arb/Polygon/Base (older article); a later article **$10** ETH/BTC/Tron, **$3** Polygon/Base/Arb/Solana. [Transfer FAQ](https://intercom.help/funxyz/en/articles/10003876-transfer-crypto-guide-faqs), [Where’s my order](https://intercom.help/funxyz/en/articles/9791937-where-s-my-order). First-party REST is **gated** (`docs.fun.xyz`). Public mint: Lighter’s `POST https://bridge.lighter.xyz/v1/uda` (dest = Lighter, not Base).

**Socket / Bungee.** V3 `userOps=deposit`. Older Bungee: address **expires after 10 minutes**, **one deposit**. Socket “does not charge any additional fees.” [Socket deposit addresses](https://docs.socket.tech/integrate/integration-guides/deposit-addresses), [fees](https://docs.socket.tech/about/fees-monetization). Sources: EVM, Tempo, Solana, Tron, Stellar. **BTC not in that list.**

**Gum.ag.** `GET /v2/deposit-addresses?chainId=8453&destinationAddress=`. Sample: `feesUsd: 0.3`, `minDeposit: "1"` USDC, “Deposits below this may be lost.” Destinations: Solana 900, Base 8453, Arbitrum 42161, Sui 101. [Docs](https://docs.gum.ag/universal-deposit/api-reference/get-deposit-addresses).

**Rhinestone Deposits.** `POST https://v1.orchestrator.rhinestone.dev/deposit-processor/register-managed` → `evmDepositAddress` + `solanaDepositAddress`. Dest example is Base USDC. “Rhinestone never takes custody.” [Quickstart](https://docs.rhinestone.dev/deposits/api/quickstart). BTC: not documented.

**ZeroDev Smart Routing Address.** CREATE2 intent address, non-custodial, dest USDC on Base in the quickstart. [Quickstart](https://docs.zerodev.app/onramp/smart-routing-address/quickstart).

**Layerswap.** `use_deposit_address: true` / Easy Deposit tab. 70+ networks, BTC as a source in the widget. Fees: per-route % + bridge expenses (includes sweeping). Example quote **$1000** ETH→Arb USDC: `total_fee: 0.55`. [Fees](https://docs.layerswap.io/fees). Has a [Privy wallets recipe](https://docs.layerswap.io/recipes/privy-wallets).

**Garden / Chainflip / THORChain.** Native BTC. Garden dest examples are WBTC/cbBTC, **USDC Base UNVERIFIED**. Chainflip channels **close after 24 hours**; Base dest **UNVERIFIED** on the mainnet asset list. THORChain: shared inbound + **memo** (easy to get wrong).

**Bridge.xyz liquidation addresses.** Permanent, KYC customer, **stables only**. `chain: "evm"`, dest Base USDC. EEA: “USDC & EURC are the only stablecoins supported.” Wrong asset “may be irretrievable.” [Liquidation](https://apidocs.bridge.xyz/platform/orchestration/liquidation_address/liquidation_address), [routes](https://apidocs.bridge.xyz/get-started/introduction/what-we-support/payment-routes).

**Coinbase CDP Deposit Destinations.** `POST /platform/v2/deposit-destinations`, USDC on named networks including Base. Not any-token. Sandbox addresses are fake — “Do **not** send real funds.” [Quickstart](https://docs.cdp.coinbase.com/payments/crypto-deposit-destinations/quickstart).

**Circle Mint deposit addresses.** One address per chain, USDC/EURC only, same-chain credit, **not** auto-CCTP. Transfers **&lt; 0.01 USDC** not credited (Mint). [On-chain transfer](https://developers.circle.com/circle-mint/howtos/transfer-on-chain).

**Fireblocks Flow via Dynamic.** Per-transaction unique address; reuse refunds. Sources include BTC. [Dynamic Flow](https://www.dynamic.xyz/docs/overview/fireblocks-flow-api).

**Mesh.** Does not mint a converter. User connects a CEX and Mesh **pulls** a withdrawal to *your* dest. Manual QR window **15 min**. [Quickstart](https://docs.meshconnect.com/build/15min-quickstart).

**Allbridge Core Deposit Addresses.** **Deprecated.** [Docs](https://docs-core.allbridge.io/product/deposit-addresses).

---

## 2. Alternatives with a different shape

These require the **app or the person** to sign on the source chain, except where a provider also offers a deposit-address mode (called out).

**Hard constraint.** The live Privy agent policy only allows Base USDC EIP-712 x402 (`TransferWithAuthorization`) and a treasury `transfer` for pocket top-up. A bridge/swap is a different `to` and usually `eth_sendTransaction`. Server-side execution under the **agent** signer is **no**, unless you punch a hole in the leash. Owner-signed flows are allowed; they are still more gymnastics than “send to this address.”

| Provider | Who signs | Source gas? | BTC | SOL | Typical take | vs deposit address for Froggy |
| --- | --- | --- | --- | --- | --- | --- |
| **LI.FI aggregator** | Source tx (approve or Permit2 then Diamond) | Yes | PSBT + memo ~30 min | Yes | **0.25%** service + 0.5% default slippage/step ([fees](https://docs.li.fi/faqs/fees-monetization), [slippage](https://docs.li.fi/faqs/slippage-price-impact)) | Worse as default fund path. Better priced if tokens already sit on the Privy EOA. |
| **Across Swap `/approval`** | Origin tx | Yes | No | USDC only | LP + relayer; can be ~0; ~2 s fill ([features](https://docs.across.to/introduction/features)) | Complementary. Across **deposit addresses** (gated) are the right Across product for Froggy. |
| **Across `/gasless`** | One EIP-712 | No user gas | No | — | Same | Endpoint page currently says origin **HyperCore only**, “additional origin chains coming soon.” Treat EVM-origin gasless as **not GA**. [Gasless](https://docs.across.to/api-reference/swap/gasless/get). |
| **deBridge DLN** | Approve + source tx | **Always native `value`** (Base **0.001 ETH**) | No | Yes (**0.015 SOL** flat) | **4 bps** protocol + ~4 bps taker + opex. Worked **1000 USDC**: ~**0.83 USDC** ([fees](https://docs.debridge.com/dln-details/overview/fee-structure)) | Worse. Forces source native even for ERC-20. |
| **Squid / Axelar** | Source tx; intents have deposit-address types | Yes (Axelar gas prepaid in source native). Intents deposit types: no | Closed beta / Chainflip | Same | Squid **0%**; user pays gas ([times and fees](https://docs.squidrouter.com/additional-resources/architecture/transaction-times-and-fees.md)) | Worse for EVM→Base. Intents deposit-address types are a Relay-class product if enabled on the integrator ID. |
| **Rango** | Approve + swap, sometimes multi-step | Yes | Yes (BTC/BCH/DOGE/LTC) | Yes | API typically **0.15%** on top of affiliate ([fees](https://docs.rango.exchange/technical/fee-structure.md)) | Worse UX. Widest “weird chain” coverage if you drive it in the shared Chrome. |
| **Socket `userOps=tx`** | Source tx | Yes (Solana can be sponsored) | Deposit-style origin | Yes | Socket **0**; integrator `feeBps` optional ([fees](https://docs.socket.tech/about/fees-monetization)) | Use `userOps=deposit` instead. |
| **1inch Fusion+** | One EIP-712; resolvers pay gas | No after allowance | No | Yes (id 501) | Dutch auction; completes **&lt;5 min**; Base finality lock **4 s** below $100k ([intro](https://business.1inch.com/portal/assets/docs-v2/apis/swap/cross-chain-swap/introduction.md)) | **Best same-EOA path.** Worse than an address if funds are on a CEX. |
| **0x Cross-Chain** | Origin tx | Yes | No | Yes | **0.15%** on Swap, Cross-Chain, Gasless ([pricing](https://0x.org/pricing)). Gasless is **same-chain only**. | Worse for funding from another chain. Fine as a same-chain Base swap if junk lands. |
| **Enso** | Source tx | Yes | No | No | Protocol bps **UNVERIFIED**. Docs suggest **3%** slippage cross-chain ([crosschain](https://docs.enso.build/pages/build/get-started/crosschain-routing.md)) | Froggy already uses Enso for **vaults**. Not a fund rail. |
| **Relay swap API** (no deposit address) | Approve + deposit, or `usePermit: true` | Permit: no user gas for USDC | PSBT or deposit address | Yes | Same platform schedule as §1.3 | Worse than Relay **deposit addresses** for the stated goal. Permit is the same-EOA exception. |
| **Stargate / LZ OFT** | `send` + native message fee | Yes (~**$0.000338** feeUsd on a 1 USDC sample) | No | Where OFT exists | LZ fee | Infrastructure inside aggregators. Do not integrate directly. |
| **Mayan Swift** | Sign on source | `gasless` flag exists | No | Native strength | **0 protocol fee**, up to ~**$1M** Swift / ~**$10M** MCTP ([Swift](https://docs.mayan.finance/architecture/swift)) | Phantom users: Swift. Everyone else: Mayan `mpsDeposit`. |
| **Jupiter** | Solana swap | Gasless if &lt;0.01 SOL, min ~$10 | No | Same-chain only | — | Does **not** deliver Base USDC. |
| **UniswapX / CoW** | Permit2 / EIP-712 | Filler pays gas | No | No | — | Same-chain. Not a fund-from-anywhere path. |
| **ERC-7683 / Across OriginSettler** | Approve + `open()` | Yes | — | — | — | Do not integrate the standard. Use Across Swap API. |
| **Hop / Synapse** | Source tx | Yes | No | No | — | Aging. Let an aggregator pick them. |
| **Wormhole NTT** | Issuer standard | — | — | — | — | For issuing a token, not funding Froggy. |

**CCTP** is section 2.5 because it is the native-USDC rail aggregators already wrap.

### 2.5 CCTP (native USDC → Base)

Permissionless burn-and-mint. No API key. V2 is canonical; V1 is legacy with a 2026 phase-out (Circle pages disagree on the start date: 31 Jul vs 31 Oct 2026). [CCTP](https://developers.circle.com/cctp), [migration](https://developers.circle.com/cctp/migration-from-v1-to-v2).

**Base is domain 6.** Native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. TokenMessengerV2 `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`. [Contracts](https://developers.circle.com/cctp/references/contract-addresses).

**Initiator** must hold native USDC + source gas and sign `approve` + `depositForBurn`. **Recipient** (Froggy’s Base address) signs nothing if `mintRecipient` is set and Forwarding or the host submits `receiveMessage`.

**Fees** ([fees](https://developers.circle.com/cctp/concepts/fees)): Standard **0 bps**. Fast **0–13 bps** by source (Base as source **1.3 bps**; Ethereum **1 bps**; Linea **13 bps**). “$0–$1.30 per $1,000.” Do not hardcode; `GET https://iris-api.circle.com/v2/burn/USDC/fees/{src}/6`. Forwarding to Base: service **$0.05** + dest gas. [Forwarding](https://developers.circle.com/cctp/concepts/forwarding-service). Per-tx cap **$10M**. Fast: ~**8 s** from Base/Arb/OP, ~**20 s** from Ethereum. Standard from OP-stack sources: ~**15–19 min** (wait for L1 batch). [Finality](https://developers.circle.com/cctp/concepts/finality-and-block-confirmations).

**There is no Circle product that is “here is an ETH address; any USDC sent there is auto-CCTP’d to Base.”** Closest: USDC Bridge UI (user still connects the source wallet), Forwarding (still need a source burn), Circle Mint (same-chain credit), Gateway (deposit into a Gateway Wallet contract — a plain ERC-20 transfer to that contract **loses funds**). [Gateway](https://developers.circle.com/gateway).

**Gateway** unified balance: deposit, wait finality, then mint dest in **&lt;500 ms**. Chains include Base. Fee **0.5 bps** listed as early access ending 30 Jun 2026 — developer fees page still showed 0.5 bps on 9 Sep; **treat as possibly changed**. [Gateway fees](https://developers.circle.com/gateway/references/fees).

**x402:** only native Base USDC has the documented EIP-3009 path. [x402 tokens](https://docs.x402.org/core-concepts/network-and-token-support). USDbC will not debit a 402 that names `0x833589…`.

**Hedera.** Native USDC exists (`0.0.456858`) but **CCTP does not include Hedera**. Inverting funding to Hedera USDC does not remove the Base USDC need for Graph x402.

**Verdict vs deposit address.** CCTP is what Relay/LI.FI/Across already call for USDC→USDC. Integrating it yourself only pays off if Froggy operates a **hot wallet** that watches inbound USDC on ETH/Arb/Sol and burns to the user’s Base address. The person still needed a source-chain wallet to get USDC there. Coinbase withdraw-on-Base is simpler for CEX-held funds.

---

## 3. Fiat

Native Base USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.

**EU legal floor (every CASP).** MiCA is live. Travel Rule (Reg. 2023/1113) since 30 Dec 2024: transfers **≥ €1,000 to/from a self-hosted wallet** require the CASP to verify the customer owns the wallet (usually a signature). Unhosted-wallet onramps still work; they are not anonymous. [Stripe EU KYC](https://docs.stripe.com/crypto/onramp/eu-kyc-integration-guide), [Ramp wallet ownership](https://support.rampnetwork.com/en/articles/378822-wallet-ownership-verification).

### 3.1 What Froggy already has

`apps/web/src/lib/privy.tsx` calls `fund({ destination: { asset: USDC_BASE_MAINNET, chain: "eip155:8453", address }, source: { defaultAsset: "eur" } })`.

Privy routes card onramps through **Stripe (USD, EUR), MoonPay (AUD, BRL), Coinbase, and Meld (after KYB)**. Bank transfer is a **separate** Funding toggle that uses **Bridge**. [Configuration](https://docs.privy.io/financial-flows/deposits/configuration), [card onramps](https://docs.privy.io/wallets/funding/fiat-onramp). Privy platform fee for the developer: **$0**. The person pays the processor.

### 3.2 Provider table (EU → unhosted USDC on Base)

| Provider | Lands USDC on Base? | First-buy EU KYC | Card / AP / GP | SEPA / bank | Documented user fee | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **Privy `fund()`** | Yes via Stripe Embedded | Whatever Stripe requires = **L2 ID+selfie** | Yes | Bridge VA is a different switch | Processor’s | Production |
| **Stripe Embedded Components** | Yes, US+EU list includes USDC Base | **L2 mandatory**. L0/L1 `not_available` in EU. ≥€1k wallet sign | Card, AP, GP; ACH US-only; Amex **EU only** | No | Quotes example ~**$4.04 + $0.17** on $100 USDC Base ([quotes](https://docs.stripe.com/api/crypto/onramp_quotes)). **Do not use 1.5%** — that is merchant stablecoin payments ([Stripe pricing](https://stripe.com/pricing)) | **Private preview** (what Privy ships) |
| **Stripe Hosted** (`crypto.link.com`) | **USDC Base not supported in the EU** ([footnote](https://docs.stripe.com/crypto/onramp/stripe-hosted)) | Same stack | Same | No | Same quote API | Public preview, application required |
| **Bridge VA (via Privy)** | Yes, `payment_rail: "base"` | Full KYC/KYB **before** the IBAN | No | **SEPA + SEPA Instant**, min **€1** | Developer fee optional (example `"1.0"` = 1%). Bridge FX **not a published single %**. Gas “usually 0” | Production. Estonia in the EEA list |
| **Coinbase Onramp** | Yes (L2 table includes Base) | EU: Coinbase account. Guest widget **deprecated 30 Jun 2026** | Debit 90+ incl. EU; credit EU (not US) | ACH US only in the Onramp table | **2.5%** card, **0.5%** ACH + spread. Existing crypto → self-custody: **$0 Coinbase fee**. Zero-fee USDC for **select partners**. Apple Pay/Google Pay min ~**$5**. Buy Quote API **10 rps** | Production |
| **MoonPay** | Yes (Agents program names Base; consumer widget inferred) | EEA starts **Tier 2**: ID + liveness + TIN + questionnaire. **No light tier** | Yes (= card %) | Yes | Direct: cards/APMs **up to 4.5%**, bank **up to 1%**, min **€3.99**. Partner path: up to 4.5%, min never more than **€4.50**. [Europe pricing](https://www.moonpay.com/legal/europe_pricing_disclosure), [US disclosure](https://www.moonpay.com/legal/pricing_disclosure) | Production; Dutch MiCA/EMI announced 8 Sep 2026 |
| **Transak** | Yes, Buy+Sell Base | Light **$10–$200**, no ID/selfie **if** `isLightKycAllowed`. Apple Pay = **L2+** | Card, AP (L2), GP | SEPA; Open Banking includes **Estonia** | Official: card **3.99%+$1**, AP **3.99%+$1**, GP **3.99%**, bank **2%+$1**, wire **0.75%+$9** ([fees](https://transak.com/fees-pricing-calculation)) | Production. Post-1 Jul 2026 CASP status **UNVERIFIED** |
| **Meld** | Via partners | Of the routed ramp | Depends | Depends | No public Meld %. Aggregator | Production; Privy uses after KYB. 38 partners on [coverage](https://www.meld.io/coverage/service-providers) |
| **Ramp Network** | Wallet top-up is Base USDC; widget Base **UNVERIFIED** vs wallet | **ID for all EU purchases** (NL/IT/FR carve-out UNVERIFIED) | Visa/MC, AP=card, GP=card | Manual bank up to **1.40%**; Easy Bank up to **2.40%**; min **€2.49**. Cards EUR/USD/GBP up to **3.9%** ([Ramp fees](https://support.rampnetwork.com/en/articles/10415-what-fees-are-charged-when-buying-crypto)) | Production; MiCA CASP Jan 2026 (third-party reports) |
| **Banxa** | Yes, USDC BASE buy+sell | **Express first tx €0–500: name/address/DOB/TIN, no ID/liveness.** Then Standard ID+selfie €501–9k | Yes | SEPA 1–3d; iDEAL NL instant | Cards/AP **1.99% processing** + typical **2–4% spread** (max 15%); other methods **0% processing** + spread. PayPal EU **1.90%**. [KYC](https://docs.banxa.com/products/native-api/docs/compliance/global-kyc-framework) | Production; AFM CASP |
| **Wert** | Yes, `network: 'base'` | **LKYC** name/DOB/address, **$1,000 lifetime**; then FKYC | Card, AP (extra setup), GP, SEPA | Yes | Partner-set %; min **$1/€1**. Operator SHA2 Solutions OÜ (EE) | Production |
| **Sardine** | Multi-chain claimed; Base **UNVERIFIED** | Reusable KYC | Card + bank | Instant ACH (US) | **Not public** | Enterprise |
| **Onramper** | Via 25+ ramps | Of the routed ramp | 175+ methods | Per ramp | **No extra user fee**; Essentials **$199/mo** | Production (NL) |
| **Alchemy Pay** | USDC listed; Base **UNVERIFIED** | Sumsub KYC | Visa/MC, AP, GP | SEPA Instant | Cards/AP/GP **up to 3.99% + $0.40** | Production |
| **PayPal PYUSD** | **No Base**. PYUSD on ETH/SOL/ARB/Stellar/Polygon | PayPal KYC | In-app | — | 1:1 in-app | Does not meet dest |
| **Revolut** | Base withdraw **UNVERIFIED**. In-app 1:1 USDC | Full Revolut KYC | In-app | SEPA | Appears as a method on MoonPay/Meld | Not a Base widget |
| **Kraken** | Yes, USDC on Base | Full exchange KYC | Region-dependent | SEPA deposit **€0.15**, withdraw free (exchange, not widget) | Spot + withdraw | Production, high friction |
| **Binance** | Yes, USDC BASE; withdraw **0.2 USDC** ([Cexorer 10 Aug 2026](https://cexorer.com/exchanges/binance/usdc)) | Full KYC; EU entity restrictions | Region-dependent | Where live | Trading + 0.2 USDC | Restricted in parts of EU |
| **Mt Pelerin** (extra) | Base delivery **free** on their table | Swiss/EU | Card 2.5–3.8% by volume; bank 0–1.3% | Bank first **€500/year free** | [On-ramp pricing](https://developers.mtpelerin.com/service-information/pricing-and-limits/on-ramp-pricing) (page dated 8 Sep 2026) | Not in the original ask; listed because Base delivery is free |

**Apple Pay / Google Pay in the EU** still need a supported card (usually Visa/MC) and the provider’s KYC tier. Transak Apple Pay is **not** Light KYC. Coinbase native Apple Pay onramp is **US + iOS + verified US phone**.

**Time to funds.** Cards / AP / GP / Instant SEPA: minutes after KYC. Standard SEPA: 1–3 business days. Bridge on-chain settlement “up to 30 minutes” 24/7. [Cutoffs](https://apidocs.bridge.xyz/platform/orchestration/more/cutoffs.md). Coinbase Onramp: “not immediate,” a few minutes.

**KYC friction, lowest first, for unhosted Base USDC:**

1. Banxa Express — one shot, €500, TIN+PII, no ID.
2. Wert LKYC — PII, $1,000 lifetime.
3. Transak Light — PII, $10–$200, **if** the country flag allows; no Apple Pay.
4. Ramp — ID on purchase 1.
5. MoonPay EEA — ID + liveness + TIN + questionnaire on purchase 1.
6. Stripe / Privy EU — ID + selfie + MiCA IDs + attestation on purchase 1; ≥€1k wallet sign.
7. Coinbase EU — full account. Guest widget is dead.
8. Bridge / Privy bank — full KYC before the IBAN, then cheap recurring SEPA.
9. Kraken / Binance / Revolut — full exchange/neobank KYC, then withdraw.

There is **no documented production CASP** that sends USDC to an unhosted Base wallet in the EU with **zero identity data** in 2026.

**Sessions 2026** previewed a Stripe “separate KYC mode on transactions up to $500” for **US businesses**. Not an EU claim. [Sessions](https://stripe.com/blog/everything-we-announced-at-sessions-2026).

---

## 4. The hostile-token problem

A universal deposit address is a public inbox. People, scanners, and griefers will send:

- worthlessness (airdropped scam tokens, NFTs, dust)
- fee-on-transfer / rebase / pausable / blacklist tokens
- honeypots that revert on sell
- the right token on the wrong chain
- CEX withdrawals whose `from` is a hot wallet you must not refund to

### 4.1 What providers actually document

| Provider | Policy | Source |
| --- | --- | --- |
| **Relay** | Origin must be a **solver currency**. Non-solver / NFTs: **not recoverable**. Wrong solver token: requote on some VMs, else withdraw page. Too small: refund if `refundTo` set. Sanctioned: no auto-refund. CEX sender + auto-refund-to-depositor: **aborted** | [Deposit addresses](https://docs.relay.link/features/deposit-addresses) |
| **Openfort** | Same as Relay (it is Relay). Unroutable target: 400 at create. Bounce refunds source, less gas | [Funding](https://www.openfort.io/docs/configuration/funding/) |
| **Particle Simple Deposit** | Watch-list `supportedTokens` ∩ `supportedChains`. Default ETH/USDC/USDT/SOL/BNB. Below `minValueUSD` (default **$0.50**): `deposit:below_threshold`. Refund **experimental**, default off | [Core SDK](https://developers.particle.network/simple-deposit/core-sdk), [RUNBOOK](https://github.com/Particle-Network/universal-deposit/blob/main/sdk/docs/RUNBOOK.md) |
| **Fun.xyz** | “Only send supported token-chain combinations. Sending non-supported tokens may cause an **irrecoverable loss**.” Below min: funds sit until topped up | [Transfer FAQ](https://intercom.help/funxyz/en/articles/10003876-transfer-crypto-guide-faqs) |
| **LI.FI Smart Deposit** | No native ETH/BNB as input. **No tokens that tax transfers.** Expected sender/refund address required. 24 h then refund | [Enterprise](https://docs.li.fi/enterprise/smart-deposit-address) |
| **Rhino.fi** | KYT **before** credit. Below **$5** not processed | [SDA](https://docs.rhino.fi/get-started/sda) |
| **Gum.ag** | Below `minDeposit` “may be lost” | [API](https://docs.gum.ag/universal-deposit/api-reference/get-deposit-addresses) |
| **Bridge** | Unsupported pair “may be **irretrievable and permanently lost**.” Dust **not credited or returned**; VA microdeposits **accumulate** until they clear the min. EEA: USDC & EURC only | [Routes](https://apidocs.bridge.xyz/get-started/introduction/what-we-support/payment-routes), [mins](https://apidocs.bridge.xyz/platform/orchestration/fees-and-mins/mins) |
| **Privy crypto deposits** | Invalid assets **recoverable via private key export** (same owner) | [Overview](https://docs.privy.io/wallets/funding/crypto-deposits/overview) |
| **Coinbase CDP deposit dest** | “Only send supported assets.” Sandbox addresses are fake | [Quickstart](https://docs.cdp.coinbase.com/payments/crypto-deposit-destinations/quickstart) |
| **Circle Mint** | &lt; **0.01 USDC** not credited. Wrong chain = loss | [Mint FAQ](https://help.circle.com/s/article/FAQs-of-transferring-USDC-into-your-account) |
| **Circle Gateway** | Direct ERC-20 transfer to the Gateway Wallet contract **loses** that USDC | [Technical guide](https://developers.circle.com/gateway/references/technical-guide) |
| **NEAR Intents** | Quote first; `INCOMPLETE_DEPOSIT` / `REFUNDED`. Hyperliquid USDC hop deducts a flat **0.2 USDC** | [Making a request](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request), [Hyperliquid](https://docs.near-intents.org/integration/distribution-channels/1click-api/hyperliquid) |
| **Biconomy MEE** | “No route found” → change tokens / amount / slippage. Failed SuperTx: cleanup if configured | [Execute](https://docs.biconomy.io/overview/supertransaction-api/execute) |

Fee-on-transfer as a **named** Relay case: **UNVERIFIED**. Closest fill errors: `DESTINATION_TOKEN_TRANSFER_REJECTED`, `TOKEN_NOT_TRANSFERABLE`, `TRANSFER_FAILED`.

### 4.2 What serious teams do (real implementations)

- **Allowlist, not “any ERC-20.”** Relay `solverCurrencies`. Particle Primary Assets. Bridge stables. Coinbase/Circle USDC-only addresses. Uniswap default lists and 0x/1inch token lists are the same idea on the swap side.
- **USD value floor.** Particle `$0.50`. Rhino `$5`. Fun `$3–$50` by chain. Gum `1 USDC`. Bridge mins after developer fee. LI.FI price-impact filter off under **$10**.
- **Quote before conversion.** NEAR/Relay/Socket/LI.FI all requote the actual inbound amount. If the new quote cannot cover fees, refund (if configured) or leave it.
- **Do not auto-refund to `tx.from`.** Relay’s CEX warning is the canonical lesson: the sender is the exchange, not the person. Use an app-controlled `refundTo` + `recoveryAddress`.
- **Quarantine / ignore.** Unsupported tokens stay on the address. Privy’s version is kinder (owner can export). Fun/Relay/Bridge version is “maybe gone.”
- **KYT / sanctions.** Rhino 100% KYT before credit. Relay `SANCTIONED_CURRENCY` / `BLOCKED_WALLET` holds funds for compliance review.
- **CEX deposit rules (pattern, not Froggy-specific).** Binance/Kraken credit after N confirmations and only for listed assets; smart-contract deposits are delayed or rejected; memo-less sends to memo chains are a support ticket. Coinbase: send only listed networks; USDbC deposits convert to native USDC on withdraw.
- **Bitcoin / Solana extras.** Inscriptions and Runes on a BTC deposit address are not USDC. Token-2022 transfer-fee tokens on Solana: Relay’s Solana Depository claims Token-2022 support at the program level ([Depository](https://docs.relay.link/references/protocol/components/depository)); whether fee-on-transfer SPL is a solver currency is a `/chains` question, not a promise.

A published post-mortem of a deposit-address product griefed by junk ERC-20s was **not independently found** in this pass (UNVERIFIED as “none exist”; Fun’s help centre is the closest operational warning).

### 4.3 Recommended Froggy policy if we mint a UDA

1. **Prefer Privy’s UDA** so junk is still in a wallet the person owns.
2. If using Relay/Openfort: **open addresses only for solver currencies you display**. Copy must name the token **and** the chain. One QR per rail, not “any token to this one hex.”
3. **USD floor** at whatever the quote says will cover execution ($0.02 + dest gas on Relay; never show a QR for $0.10 of SHIB).
4. **`refundTo` = Froggy-controlled address** on the origin chain, plus `recoveryAddress`. Never the person’s Base address, never `tx.from`.
5. **Do not auto-swap** tokens outside a hard include-list (native + USDC/USDT/ETH/SOL/cbBTC). Everything else: “we see it, we will not convert it, here is how to recover.”
6. **Sanctions / KYT:** if the rail does not do it (Relay does some; Rhino does more), do not build a custom one in a hackathon — just refuse the fill.
7. **Never** present a CREATE2 EVM address as valid on Solana or Bitcoin.

---

## 5. Approaches we had not put in the first list

**Better than a third-party UDA for Froggy, in practice:**

1. **Privy’s own UDA + crypto deposit accounts** (section 1.2). Same vendor, same owner, recoverable junk.
2. **Coinbase Onramp `defaultExperience=send` / Privy `defaultFundingMethod: 'exchange'`.** Person who already has Coinbase never copies an address. $0 Coinbase fee on existing crypto. [Exchange funding](https://docs.privy.io/wallets/funding/methods/exchange), [CDP FAQ](https://docs.cdp.coinbase.com/onramp/additional-resources/faq).
3. **Copy that is honest:** “Buy USDC on Coinbase, withdraw, network = Base.” Official Base.org path. [Ecosystem bridges](https://docs.base.org/base-chain/network-information/ecosystem-bridges). Coinbase International Exchange: “USDC withdrawals are FREE across all supported networks” on that INTX page — **do not quote INTX as retail**. Retail exact $0 on Base: **UNVERIFIED** on the public help page (Coinbase charges an estimated network fee, often sub-cent on Base).
4. **Privy app-pays / user-pays-USDC gas.** Not a funding method. It is what makes the Hedera conversion `eth_signTransaction` work when the wallet holds USDC and **no ETH**. Receiving USDC does not need a paymaster. [Gas](https://docs.privy.io/wallets/gas-and-asset-management/gas/overview).
5. **Bridge virtual IBAN** for EUR people who will SEPA twice. [Fiat deposits](https://docs.privy.io/wallets/funding/fiat-deposits/overview). Stripe acquired Bridge for $1.1B (Feb 2025). [Sessions 2026](https://stripe.com/blog/everything-we-announced-at-sessions-2026).
6. **Daimo Pay session** or **WalletConnect Pay** invoice: ephemeral “pay this $N however you want,” dest = Froggy Base USDC. Not a persistent UDA. [Daimo](https://docs.daimo.com/introduction), [WC Pay](https://docs.walletconnect.com/payments/merchant/quickstart). Access / EU / fees: **UNVERIFIED**.
7. **Base Pay** (`pay({ amount, to })` from `@base-org/account`): one tap from a Base Account / Coinbase, **no extra fees**, gas sponsored. Only for people who already live in that app. [Base Pay](https://docs.base.org/base-account/guides/accept-payments).
8. **Mesh connected-exchange pull** if testers are on Binance/Kraken as well as Coinbase. Travel-rule filters can hide Coinbase in parts of the EU without a VASP ID. [Mesh](https://docs.meshconnect.com/build/15min-quickstart).

**Not better:**

- **Privy Cards.** Spend, not fund. Requires ERC-20 `approve` to Bridge’s issuer — a drain hole unless the policy is rewritten to deny everything else. ETHOnline text already says Cards need guided onboarding. [Cards](https://docs.privy.io/financial-flows/cards).
- **EIP-3009 as a receive path from exchanges.** Exchanges already pay gas and `transfer`. Froggy already uses 3009 for **spend**.
- **Session-key batching of approve+swap+bridge.** Still a signature; if the agent holds it, the leash is gone.
- **Lightning / Strike / Lightspark.** Extra asset. Lightspark Grid can land USDC on Base (Marcus, Mar 2026) — extra KYC, extra hop.
- **PayPal PYUSD / Revolut-on-Polygon.** Wrong chain. Would need a UDA to finish the job.
- **Hedera-native USDC as the primary fund path.** Exists (`0.0.456858`), $0.001 transfers, **not** on CCTP, does not pay Graph on Base.
- **x402 as a funding invoice to a human.** Humans do not speak 402.
- **Circle Gateway as the first rail.** User must deposit via a Gateway method first; a naive send loses funds.

---

## What would take under a day, and what it would cost per deposit

### Under a day (no new vendor, no policy hole)

1. **Dashboard.** Funding → enable **crypto deposits**. Enable **swaps** and **app-pays** gas on Base plus the source chains you will watch (Ethereum, Arbitrum, Optimism, Polygon, Solana is the honest minimum). [Setup](https://docs.privy.io/wallets/funding/crypto-deposits/setup).
2. **Server.** After wallet mint, `depositAccounts.crypto.create(walletId, { type: "inline_route", source: { mode: "include", values: [{ asset: "usdc" }, { asset: "eth" }, { asset: "usdt" }, { asset: "sol" }] }, destination: { asset: "usdc", chain: "eip155:8453" } })`. Show `deposit_address` in Add funds. Same-VM address **is** the address you already copy.
3. **Exchange.** Enable Coinbase Onramp keys. Add a second button: “Send from Coinbase.” `defaultFundingMethod: 'exchange'` / `defaultExperience=send`.
4. **Copy.** Keep “Send USDC on Base to …” first. Add one line: “From Coinbase, set network to Base. Coinbase does not charge a Coinbase fee to move existing crypto.”
5. **Gas.** Turn on app-pays (or user-pays USDC) so Hedera conversion does not require ETH. Do not add router spenders to the agent policy.

Optional same day, new vendor: Relay `quote/v2` for **Bitcoin** only (Privy will not take BTC). Show a `bc1…` QR with “native BTC, 1 confirmation ~10 min, high-value 2 conf.” Set `refundTo` to a Froggy-controlled BTC address.

**Do not try in a day:** Openfort (extra platform + Relay wrap), Particle (Auth Core intermediary + no webhook), Rhino commercial account, LI.FI enterprise enablement, Bridge KYB + first VA, Banxa/Wert as a second onramp.

### Cost per deposit (person pays unless noted)

Worked at **$100** inbound, native USDC out on Base, 9 Sep 2026 published schedules. Live quotes will differ.

| Path | What the person pays | What Froggy pays | Source |
| --- | --- | --- | --- |
| Direct Base USDC transfer | Origin gas. Model ~**$0.001–$0.01** on Base | $0 | [USDC.org fee model](https://usdc.org/tools/fee-calculator) |
| Coinbase existing-crypto send / Pay | **$0 Coinbase fee** + estimated network fee | $0 | [CDP FAQ](https://docs.cdp.coinbase.com/onramp/additional-resources/faq) |
| Coinbase Onramp card | **2.5%** + spread + network (~**$2.50+** on $100) | $0 | Same FAQ |
| Coinbase Onramp ACH (US) | **0.5%** + spread | $0 | Same |
| Privy/Stripe card (EU) | Quotes sample **~$4.21** all-in on $100 USDC Base (**~4.2%**) | $0 platform | [Onramp quotes](https://docs.stripe.com/api/crypto/onramp_quotes) |
| MoonPay partner widget | Up to **4.5%**, min ≤ **€4.50**, plus spread | $0 | [Europe pricing](https://www.moonpay.com/legal/europe_pricing_disclosure) |
| Transak card | **3.99% + $1** = **$4.99** on $100 before spread | $0 | [Transak fees](https://transak.com/fees-pricing-calculation) |
| Banxa card | **1.99%** processing + **2–4%** spread ≈ **$4–6** | $0 | Banxa pricing article |
| Banxa SEPA | **0%** processing + **2–4%** spread | $0 | Same |
| Ramp card (EUR) | Up to **3.9%**, min **€2.49** | $0 | [Ramp fees](https://support.rampnetwork.com/en/articles/10415-what-fees-are-charged-when-buying-crypto) |
| Bridge SEPA VA | Bridge FX **UNVERIFIED** (~1% class in comparable VA copy) + optional `developer_fee_percent` | KYC/ops | [Dev fees](https://apidocs.bridge.xyz/platform/orchestration/fees-and-mins/devfees) |
| Relay USDC→USDC bridge | **$0.02** execution + dest gas + **0.00%** platform + origin gas | $0 (or app-fee if we set one) | [Relay fees](https://docs.relay.link/references/api/api_core_concepts/fees) |
| Relay ETH→USDC (major) | **$0.02** + swap cost + **0.06%** platform | $0 | Same |
| Relay minor token | **$0.02** + swap + **0.15%** | $0 | Same |
| NEAR Intents with JWT | **0.0001%** protocol (+ solver spread) | $0 | [NEAR fees](https://docs.near-intents.org/resources/fees) |
| NEAR Intents without key | **0.2%** extra | $0 | Same |
| Particle custom project | **1%** to Particle | Auth Core / sweep gas **UNVERIFIED** | [Simple Deposit reference](https://developers.particle.network/simple-deposit/reference) |
| Openfort | Relay route fees + **$0.01/op** on Free if the session counts | Same | [Openfort pricing](https://www.openfort.io/pricing) |
| Gum.ag sample | **$0.30** flat | $0 | [Gum API](https://docs.gum.ag/universal-deposit/api-reference/get-deposit-addresses) |
| CCTP Fast ETH→Base | **1 bps** ($0.10 / $1,000) + source gas; dest gas **$0.05** if Forwarding | Host dest gas if we mint ourselves | [CCTP fees](https://developers.circle.com/cctp/concepts/fees) |
| CCTP Standard | **0 bps** + source gas + dest gas; **15–19 min** from OP-stack | Same | Same |
| 1inch Fusion+ | Resolver margin in the curve; user: one signature | $0 | Fusion+ intro |
| LI.FI signed quote | **0.25%** + slippage | $0 | LI.FI fees FAQ |
| Privy UDA (swap + app-pays) | Swap impact **UNVERIFIED** | **App-pays gas on source + dest** | Privy setup |

For a $20 test deposit, **fixed** costs dominate: Relay’s $0.02 is fine; MoonPay’s €3.99 minimum is not; Fun’s $3–$10 floor will hold the funds; Particle will ignore sub-$0.50.

---

## What this research could not verify

- Live Relay `/quote/v2` dollar output for USDC Polygon → USDC Base (schedule is published; a fill was not purchased).
- Whether Privy’s UDA `source.mode: "all"` includes every token Privy’s swap API can price, or a hidden allowlist.
- Exact Privy/Relay/Rhinestone/ZeroDev/Particle bps on a $100 fill.
- Whether Stripe **Embedded** actually quotes USDC on Base in **every** EU country in production (hosted docs still say no; Privy claims yes).
- Stripe onramp % for **EUR** (the public quotes sample is USD).
- Transak Light KYC + CASP status for EE/DE/FR/NL/ES/IT after 1 Jul 2026.
- Transak EUR SEPA % (official USD bank table is 2%+$1; reviews still say ~0.99%).
- MoonPay consumer-widget USDC-on-Base contract (Agents program is explicit).
- Ramp **widget** vs Ramp **Wallet** Base USDC; NL/IT/FR KYC.
- Bridge’s own EUR→USDC FX take-rate.
- Coinbase.com **retail** Base USDC withdraw fee as a hard $0.
- Fun.xyz first-party REST; Openfort `/v2/funding` vs `/v2/funding/sessions`.
- Biconomy UDA mint API (not in docs).
- Garden USDC-on-Base dest; Chainflip Base dest; ChangeNOW/SimpleSwap exact `usdcbase` tickers.
- Across EVM-origin gasless (docs disagree).
- CCTP V1 phase-out start date; Gateway 0.5 bps after 30 Jun 2026; CCTP protocol minimum burn.
- Aptos CCTP V2 package addresses on Circle docs (GitHub only).
- A named public post-mortem of a UDA product griefed with honeypot ERC-20s.
- Formal SLAs (Relay 99.9% is marketing).
- Whether enabling Privy crypto deposits on this app requires a Privy plan change or sales conversation.

Re-quote every route before shipping a number in the UI. Re-fetch `/chains` and Iris fee tables; they are living documents.
