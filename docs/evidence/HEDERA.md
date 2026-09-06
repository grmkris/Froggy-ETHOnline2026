# Hedera x402 — evidence

What the Hedera track asks for: a **hosted** x402 service on Hedera, and an agent that completes a **real paid request** against it. Both halves are this repository.

## The service

- `GET /oracle/snapshot?symbol=USDC` answers **402** with an x402 v2 challenge: scheme `exact`, network `hedera:testnet`, asset HBAR (`0.0.0`), `payTo 0.0.10377647`, and `extra.feePayer` read from the facilitator's `/supported` at boot (Blocky402, `https://api.testnet.blocky402.com`). Without the fee payer no Hedera payment can be built; it is read rather than hardcoded because it changed once already.
- A request carrying `X-PAYMENT` is settled through the facilitator; the answer comes back with `x-payment-response` holding the base64 `SettleResponse` envelope, and the settlement's transaction id lands on the agent's receipt.
- Hosted at `https://app-production-58dd.up.railway.app/oracle/snapshot?symbol=USDC`. Try it:

```bash
curl -i "https://app-production-58dd.up.railway.app/oracle/snapshot?symbol=USDC"
# HTTP/1.1 402 … {"x402Version":2,"accepts":[{"scheme":"exact","network":"hedera:testnet",…}]}
```

## The agent's side

- `packages/payments/src/payer.ts` builds the payment with `@x402/hedera` from the person's own account (opened by the float `0.0.9700388` at their first Hedera payment; the float itself pays on a deployment without `HEDERA_KEK`); `apps/server/src/tools.ts` (`x402_fetch`) sends it only after the mandate allowed the spend and the ledger reserved it.
- `x402_probe` reads any 402 without paying; the person adds a seller to the directory, and only then is its host payable. Every option that cannot be paid says why (scheme, network, amount, fee payer).

## Settlements

| When | What | Transaction | Status |
| --- | --- | --- | --- |
| 5 Sep 2026 | 0.05 HBAR, pocket `0.0.9700388` → payee `0.0.10377647`, fee paid by the facilitator | [`1788625330.599677104`](https://hashscan.io/testnet/transaction/1788625330.599677104) | SUCCESS |
| 5 Sep 2026 | 0.05 HBAR paid by the agent's scripted turn against the local oracle in live mode, with an HCS note on each side | facilitator tx [`0.0.7162784@1788632323.333261031`](https://hashscan.io/testnet/transaction/1788632323.333261031); topic [`0.0.10381647`](https://hashscan.io/testnet/topic/0.0.10381647) messages #1 (sold) and #2 (paid) | SUCCESS |
| 6 Sep 2026 06:09 UTC | 0.05 HBAR paid to the **hosted** service at `app-production-58dd.up.railway.app/oracle/snapshot?symbol=USDC` by our own payer code (`packages/payments/src/payer.ts`) from the build box: 402 with `feePayer 0.0.7162784`, payment built, retried with `X-PAYMENT`, 200 with the twelve-index answer (Euler 2.76% cheapest) and the settlement in `payment-response` | [`0.0.7162784@1788674975.439553201`](https://hashscan.io/testnet/transaction/1788674975.439553201) | SUCCESS |
| 6 Sep 2026 20:57 CEST | 0.619 HBAR ($0.05), a person's **own** account `0.0.10396038` → service account `0.0.10377647`, for a `froggy brief` task bought through the CLI; the account itself opened seconds earlier by the float | [`0.0.7162784@1788721041.121729048`](https://hashscan.io/testnet/transaction/0.0.7162784%401788721041.121729048) | SUCCESS |
| 6 Sep 2026 22:21 CEST | 0.05 HBAR to the **hosted** oracle from account `0.0.10396804`, whose key is a cosmos-type Privy wallet signing through `raw_sign` (ADR 0009); the account itself opened by the float paying the key's alias | [`0.0.7162784@1788726082.952826873`](https://hashscan.io/testnet/transaction/0.0.7162784%401788726082.952826873) | SUCCESS |
| TODO(tx) | the same request started from the chat, on camera, with the unlocked page opening in the shared Chrome |  |  |
| TODO(tx) | a peer seller's 402, added through the directory, paid by the agent |  |  |

Payer and payee are distinct accounts on purpose: a service paying itself settles fine and demonstrates nothing.

## The public trail

Every settlement leaves one note on Hedera Consensus Service topic `0.0.10381647`: the oracle notes what it sold, the agent notes what it bought — network, transaction, amount, asset, and the app's own receipt reference, never a person. The sequence number of the agent's note is on its receipt. Anyone can read the trail on a mirror node without trusting this server's database:

```bash
curl "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10381647/messages?order=asc"
```

## The person's own account

Since 6 Sep each person has a Hedera account of their own. The host account (`0.0.9700388` on testnet) is Froggy's float. At a person's first Hedera payment the server generates an ECDSA key for them, the host creates an account for that key with its EVM alias and an opening balance worth their pocket plus 0.1 HBAR for fees, the key is sealed under `HEDERA_KEK` (AES-256-GCM, `packages/wallet/src/keystore.ts`) and stored on their row, and from then on their account pays every 402: a receipt and a seller's book name them, not the host (`apps/server/src/hedera-accounts.ts`, `packages/payments/src/accounts.ts`). A top-up under the Privy policy credits the ledger and moves the same value in HBAR from the float into their account at the mirror-node rate. The ledger pocket stays the dollar view and the cap. Without a KEK the deployment pays from the host pocket as before and `/health` says `hederaAccounts: host`; with one it says `own`.

Proven on testnet, 6 Sep 2026 at 20:57 CEST, on a local server in live Hedera mode with everything else stubbed:

- The person's account `0.0.10396038` (alias `0xf414b55f8bf6a8be80ba597a5ff48301626b7a4c`) was opened by [`0.0.9700388@1788721040.053929866`](https://hashscan.io/testnet/transaction/0.0.9700388%401788721040.053929866): 6.29 HBAR from the float for a $0.50 pocket at $0.0807 per HBAR plus the margin, creation fee 0.62 HBAR paid by the float.
- `froggy brief USDC` through the served CLI then paid Froggy's task price from that account: [`0.0.7162784@1788721041.121729048`](https://hashscan.io/testnet/transaction/0.0.7162784%401788721041.121729048), 0.619 HBAR ($0.05) to the service account `0.0.10377647`, fee paid by Blocky402's fee payer `0.0.7162784`. Task `tsk_01m1w1ac81esn82wjary5mnjth`, sale `sal_01m1w1ac81esn82wj0ms85qcjk`; the brief came back from twelve live Messari indexes. The account held 5.67 HBAR afterwards and the ledger pocket $0.45; `GET /api/wallet` named the account.

## Mainnet, Mon 7 Sep 2026

The owner's direction on the evening of 6 Sep was mainnet everywhere, with no testnet fallback. What it took, in order:

- **The float exists because one HBAR was sent to its alias from a HashPack account** (`0.0.10847531`) at 00:02 CEST: Hedera creates an account on the first transfer, and every other route was closed. Programs cannot create the first account: LayerZero's executor drop fails with INSUFFICIENT_GAS on a non-existent alias, exchanges and swap services pay only to `0.0.x` ids, onramps need a person. Float **`0.0.10847552`**, service **`0.0.10847556`** (opened by the float, [`0.0.10847552@1788732318.816412966`](https://hashscan.io/mainnet/transaction/0.0.10847552%401788732318.816412966)). Keys live only in `~/.config/froggy-mainnet.env` on the build box.
- **The bridge works once the account exists.** Stargate V2 from Base (`StargatePoolNative` `0xdc181Bd607330aeeBEF6ea62e03e5e1Fb4B6F7C7`, dstEid 30316) with a LayerZero native drop of 2,000,000,000 tinybars, the executor's cap: 20 HBAR per message for about $0.31, paid from the treasury's ETH under a policy rule for exactly that pool. First delivered drop [`0x28d0c01d…0d5e`](https://basescan.org/tx/0x28d0c01da7f60a35d3d2ae516ac98c18f96871e5771c705a1b46ed5da7060d5e) at 00:04 CEST, then five more (`0x5dc7f04a…`, `0xd84fb373…`, `0xc59230d1…`, `0xac5cebac…`, `0x616f83c9…`). The ETH carried alongside arrives as an ERC-20 WETH (`0xCa367694…1ef2`) no Hedera DEX trades; kept minimal. The owner then sent 500 HBAR from HashPack; the float held 538 HBAR at 00:08 CEST.
- **The Blocky402 mainnet gate passed at 00:05 CEST on the production code path**, no API key: a local server in live Hedera mainnet mode, a stub person with a $0.10 credit, `froggy brief USDC`. The float opened account **`0.0.10847558`** for the person and that account paid Froggy's $0.05 task price to the service account through Blocky402's mainnet facilitator (fee payer `0.0.10571514`): [`0.0.10571514@1788732364.891462934`](https://hashscan.io/mainnet/transaction/0.0.10571514%401788732364.891462934), 0.61457527 HBAR, SUCCESS. Task `tsk_01m1wc595nesmbaed8x54e24wa`, sale `sal_01m1wc595mesmbaed7fgw3vhka`. The server created the mainnet HCS topic **`0.0.10847557`** for settlement notes.
- **Production flipped at 00:11 CEST**: `HEDERA_NETWORK=hedera:mainnet`, the float as payer, the service as payee, facilitator `https://api.blocky402.com`, the topic above, `EVM_NETWORK=eip155:8453`, the treasury wallet, `GRAPH_PAY_PER_QUERY=true`, `POCKET_STARTING_USD=0` with the team's `$1` credit, Privy custody of keys on. Verified on the live URL after the deploy (see `docs/plan/STATUS.md`).

## The service card and the unlocked page

- `GET /.well-known/x402.json` describes what this server sells before anyone pays: the resource, `hedera:testnet`, the `exact` scheme, the price in tinybars, the payee account, the facilitator, and the HCS topic the settlements are noted on. Built from the same challenge the 402 carries, so the card and the 402 cannot disagree.
- When the agent pays a 402, the answer comes back with a one-time link and the agent opens it in the shared Chrome, so the person watches the page unlock. The page shows the seller, the price, the transaction with its HashScan link, the HCS note and the answer. It works once and expires in ten minutes: the browser that opens it holds no token, so the link is the whole credential and is treated like one. The receipt in the workspace is the durable record.

## Not yet

- The wallet pane shows the ledger's dollar figure, not the account's on-chain balance; the drawer links the account on HashScan instead.
- A top-up whose HBAR transfer fails leaves the ledger credited and the account short; the tool's answer says so, and nothing retries it yet.
- `HEDERA_KEK` is one secret on the deployment: lose it and every person's key is unrecoverable (testnet HBAR today). The owner keeps a copy outside Railway.
