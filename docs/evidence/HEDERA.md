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
| TODO(tx) | the same request from the hosted URL, on camera |  |  |
| TODO(tx) | a peer seller's 402, added through the directory, paid by the agent |  |  |

Payer and payee are distinct accounts on purpose: a service paying itself settles fine and demonstrates nothing.

## The public trail

Every settlement leaves one note on Hedera Consensus Service topic `0.0.10381647`: the oracle notes what it sold, the agent notes what it bought — network, transaction, amount, asset, and the app's own receipt reference, never a person. The sequence number of the agent's note is on its receipt. Anyone can read the trail on a mirror node without trusting this server's database:

```bash
curl "https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10381647/messages?order=asc"
```

## Not yet

- One pocket per user (today one shared pocket account, capped by the mandate per user).
- The payment state machine with mirror-node reconciliation on a facilitator timeout (plan item 2.6, second half).
