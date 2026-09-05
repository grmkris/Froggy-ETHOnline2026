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
| TODO(tx) | the same request from the hosted URL, on camera |  |  |
| TODO(tx) | a peer seller's 402, added through the directory, paid by the agent |  |  |

Payer and payee are distinct accounts on purpose: a service paying itself settles fine and demonstrates nothing.

## Not yet

- One pocket per user (today one shared pocket account, capped by the mandate per user).
- An HCS message per settlement, and the payment state machine with mirror-node reconciliation (plan item 2.6).
