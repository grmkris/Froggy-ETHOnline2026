---
name: froggy-door
description: Buy live data and paid tasks from Froggy over x402 on Hedera, paying from your own account with no signup, and verify any settlement against the public ledger.
---

# Buying from Froggy

Froggy sells live data and paid tasks over the x402 payment protocol on Hedera. You can buy from it with no account, no API key and no subscription: the price arrives in an HTTP 402 challenge, and the payment is a Hedera transfer you sign yourself.

You pay from your own Hedera account. Froggy holds nothing of yours, opens nothing on your behalf, and never signs with anything but your own key.

## Install

```sh
curl -fsSL https://your-froggy.example/froggy-mcp.js -o froggy-mcp.js
claude mcp add froggy \
  -e FROGGY_HEDERA_ACCOUNT_ID=0.0.your-account \
  -e FROGGY_HEDERA_PRIVATE_KEY=0xyour-ecdsa-key \
  -- node ./froggy-mcp.js
```

Prefer a `.mcp.json` with `${FROGGY_HEDERA_PRIVATE_KEY}` expansion, so the key lives in the shell environment rather than in a file that could be committed. Never print the key, and never put it in a tool argument, a commit, or a message to anyone.

Two optional variables: `FROGGY_URL` (defaults to the server you installed from) and `FROGGY_NETWORK` (`hedera:mainnet` or `hedera:testnet`, defaulting to mainnet).

## What you get

- `froggy_catalogue` — what is for sale, at what price, on which network, settled by whom. Costs nothing and needs no key. Start here.
- `froggy_buy` — takes the 402, signs a transfer with your key, retries, and returns what you bought plus the settlement id. **This spends real money.**
- `froggy_receipt` — takes any settlement id and answers whether it really happened. Costs nothing, needs no key, and works for settlements you did not make.

## What it costs to start

Only the price itself. The facilitator pays the Hedera transaction fee, so you need no HBAR for gas — the account just has to hold the amount being paid. On testnet, an anonymous faucet will fund an account with no login.

## How to behave

**Read the refusal before retrying.** Buying twice costs twice. A refusal from `froggy_buy` names what is wrong: how much you are short and in what units, or which network the seller offered that this door cannot pay, or that the settlement path and not the seller is what failed. None of those are fixed by asking again.

**A 409 means an earlier payment with the same proof is still open.** Wait and ask again. Do not start a new purchase.

**If a purchase settles and then the seller fails to deliver**, the door says so and gives you the settlement id. The money moved. Report that to the person rather than buying again.

**Check the receipt when it matters.** `froggy_receipt` reads two independent sources: the Hedera mirror node for what the ledger recorded, and a public consensus topic for what was claimed about it. The topic has no submit key, so anyone can write to it — a note alone is a claim, and the transfer beside it is the evidence.

**The door never substitutes a facilitator.** The one named in the challenge is part of what is being sold. If it is unavailable, that is the answer.

**Nothing is ever simulated.** An unconfigured door refuses and says so. If you see a settlement id, a settlement happened.

## Ask before you spend

Money leaving an account is the person's decision, not yours. Show them what `froggy_catalogue` says a thing costs and get an answer before calling `froggy_buy`, unless they have already told you to buy that specific thing.
