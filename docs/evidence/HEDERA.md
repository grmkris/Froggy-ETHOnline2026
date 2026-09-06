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

- `packages/payments/src/payer.ts` builds the payment with `@x402/hedera` from the pocket account `0.0.9700388`; `apps/server/src/tools.ts` (`x402_fetch`) sends it only after the mandate allowed the spend and the ledger reserved it.
- `x402_probe` reads any 402 without paying; the person adds a seller to the directory, and only then is its host payable. Every option that cannot be paid says why (scheme, network, amount, fee payer).

## Settlements

| When | What | Transaction | Status |
| --- | --- | --- | --- |
| 5 Sep 2026 | 0.05 HBAR, pocket `0.0.9700388` → payee `0.0.10377647`, fee paid by the facilitator | [`1788625330.599677104`](https://hashscan.io/testnet/transaction/1788625330.599677104) | SUCCESS |
| 5 Sep 2026 | 0.05 HBAR paid by the agent's scripted turn against the local oracle in live mode, with an HCS note on each side | facilitator tx [`0.0.7162784@1788632323.333261031`](https://hashscan.io/testnet/transaction/1788632323.333261031); topic [`0.0.10381647`](https://hashscan.io/testnet/topic/0.0.10381647) messages #1 (sold) and #2 (paid) | SUCCESS |
| 6 Sep 2026 06:09 UTC | 0.05 HBAR paid to the **hosted** service at `app-production-58dd.up.railway.app/oracle/snapshot?symbol=USDC` by our own payer code (`packages/payments/src/payer.ts`) from the build box: 402 with `feePayer 0.0.7162784`, payment built, retried with `X-PAYMENT`, 200 with the twelve-index answer (Euler 2.76% cheapest) and the settlement in `payment-response` | [`0.0.7162784@1788674975.439553201`](https://hashscan.io/testnet/transaction/1788674975.439553201) | SUCCESS |
| TODO(tx) | the same request started from the chat, on camera, with the unlocked page opening in the shared Chrome |  |  |
| TODO(tx) | a peer seller's 402, added through the directory, paid by the agent |  |  |

Payer and payee are distinct accounts on purpose: a service paying itself settles fine and demonstrates nothing.

## The public trail

Every settlement leaves one note on Hedera Consensus Service topic `0.0.10381647`: the oracle notes what it sold, the agent notes what it bought — network, transaction, amount, asset, and the app's own receipt reference, never a person. The sequence number of the agent's note is on its receipt. Anyone can read the trail on a mirror node without trusting this server's database:

```bash
curl "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10381647/messages?order=asc"
```

## The pocket

One host account (`0.0.9700388`) pays every Hedera 402; each person spends their **share** of it, kept as a balance in the ledger. A new person is credited a starting allowance once (`POCKET_STARTING_USD`, fifty cents by default); every Hedera payment draws the balance down inside the same lock as the reservation and is given back if the payment is abandoned or fails; a top-up under the Privy policy (`wallet_topup`, USDC on Base Sepolia to the treasury) credits it one-to-one; a freeze zeroes it. The strip shows what is left. A payment the balance cannot cover is refused as `pocket_exhausted` before anything is sent — the mandate's caps still apply on top.

This is deliberately not one Hedera account per person. The wording everywhere is therefore "freeze zeroes your allowance", never "deletes the key": the key stays with the host, and what the person loses on a freeze is their share.

## The service card and the unlocked page

- `GET /.well-known/x402.json` describes what this server sells before anyone pays: the resource, `hedera:testnet`, the `exact` scheme, the price in tinybars, the payee account, the facilitator, and the HCS topic the settlements are noted on. Built from the same challenge the 402 carries, so the card and the 402 cannot disagree.
- When the agent pays a 402, the answer comes back with a one-time link and the agent opens it in the shared Chrome, so the person watches the page unlock. The page shows the seller, the price, the transaction with its HashScan link, the HCS note and the answer. It works once and expires in ten minutes: the browser that opens it holds no token, so the link is the whole credential and is treated like one. The receipt in the workspace is the durable record.

## Not yet

- The payment state machine with mirror-node reconciliation on a facilitator timeout (plan item 2.6, second half). Today a facilitator error after `/settle` was sent is recorded as a failed payment and the pocket is refunded; the mirror node is not consulted to check whether the HBAR moved anyway.
