# The README section for the agent door

Written 10 September 2026. This is the companion file for a change to `README.md`, which is a team-authored file: the section below is proposed rather than applied, so that whoever owns the README decides whether it lands and in what words.

**It is also applied**, in its own commit on the branch `agent-door`, so that commit alone can be dropped without touching anything else. This file is the record of what that commit says.

It answers the Hedera track's third requirement — "a public GitHub repo with a README covering setup, architecture, and the payment flow" — for the half of the product an outside agent uses.

---

## Where it goes

As a new `## The second door: buy from Froggy with no account` immediately after `## The demo, in order` and before `## On-chain and live evidence`. It follows the demo because it is the fastest path from nothing to a real payment, and it sits before the evidence table because the table's last row now has something to point at.

## The section

````markdown
## The second door: buy from Froggy with no account

Everything above needs a Froggy account. This does not.

Froggy sells over x402 on Hedera mainnet, and any agent can buy from it directly, paying from its own Hedera account. No signup, no API key, no subscription: the price arrives in the seller's 402 challenge and the payment is a transfer the caller signs themselves. The facilitator pays the Hedera transaction fee, so a buyer needs no HBAR for gas — only the 0.05 HBAR being paid.

```bash
curl -fsSL https://app-production-58dd.up.railway.app/froggy-mcp.js -o froggy-mcp.js
claude mcp add froggy \
  -e FROGGY_HEDERA_ACCOUNT_ID=0.0.your-account \
  -e FROGGY_HEDERA_PRIVATE_KEY=0xyour-ecdsa-key \
  -- node ./froggy-mcp.js
```
````

Three tools, and no fourth:

| Tool | What it does | Costs |
| --- | --- | --- |
| `froggy_catalogue` | What is for sale, at what price, on which network, settled by whom | Nothing, and needs no key |
| `froggy_buy` | Takes the 402, signs a transfer with your key, retries, returns what you bought and the settlement id | The listed price |
| `froggy_receipt` | Takes any settlement id and answers whether it really happened | Nothing, and needs no key |

`froggy_receipt` works for settlements you did not make, including ours. Nothing in this repository has to be taken on our word:

```
froggy_receipt 0.0.10571514@1788733693.213156813

Settled. 0.05 HBAR moved from 0.0.10847552 to 0.0.10847556 on hedera:mainnet
at 2026-09-06T22:29:01.000Z.
Public note #1 on topic 0.0.10847557, written by 0.0.10847552.
```

### The payment flow

1. The door asks for the resource. The seller answers **402** with an x402 v2 challenge — amount, asset, `payTo`, network, and the facilitator's account in `extra.feePayer`.
2. It builds a `TransferTransaction` debiting the caller and crediting `payTo`, sets the transaction id to the **facilitator's** account so the facilitator is the fee payer at the network level, freezes it, and signs with the caller's key. Nothing is submitted.
3. It retries with the signed bytes in `payment-signature`. The seller sends them to [Blocky402](https://blocky402.com) to verify and settle, writes a note to HCS topic `0.0.10847557`, does the work, and answers **200** with the settlement id in `payment-response`.
4. `froggy_receipt` resolves that id against two independent sources: the Hedera mirror node for what the ledger recorded, and the consensus topic for what was claimed about it. The topic has no submit key, so anyone can write to it — the note says what was claimed, the transfer says what happened, and neither stands alone.

Your key never leaves your machine. The door holds nothing, opens no account for you, and never signs with anything but your own credentials. Prefer `.mcp.json` with `${FROGGY_HEDERA_PRIVATE_KEY}` expansion so the key lives in your shell rather than in a file you might commit.

When it cannot buy, it says why: what you are short and by how much, or which network the seller offered that this door cannot pay, or that the facilitator and not the seller is what did not work. It will not substitute a different facilitator — the one in the challenge is part of what is being sold. When it is not configured it refuses and says so; it never returns something that could pass for a settlement.

Also published for agents that have never heard of Froggy: `GET /discovery/resources`, the x402 listing in the standard's own shape, carrying an HCS-14 identifier derived from facts printed beside it.

Built and served from this repository: `apps/server/src/agent-door/`, `docs/decisions/0020-agent-door.md`, and what was actually checked in `docs/evidence/AGENT_DOOR_FABLE51.md`.

````

## One row for the evidence table

To add to `## On-chain and live evidence`:

```markdown
| The agent door, and what was verified of it | `GET /froggy-mcp.js`, [evidence](docs/evidence/AGENT_DOOR_FABLE51.md) | — |
````

## What the section deliberately does not claim

That a stranger has completed a purchase through it. At the time of writing nobody outside the team has, and `docs/evidence/AGENT_DOOR_FABLE51.md` says so under **Pending**. If that changes before submission, the transaction id belongs in the evidence table and this paragraph goes away.
