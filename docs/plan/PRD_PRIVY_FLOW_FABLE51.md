# PRD: money that arrives from anywhere, earns while it waits, and spends on a leash

Written Wed 9 Sep 2026, 22:30 CEST, for the Privy **Best financial flow** track ($2,500, `docs/prizes.md` lines 295-300). This is a product requirements document: it describes behaviour, screens and how the feature sits inside the flow Froggy already has. It is not an implementation plan; the builders decide how each requirement lands in the tree. It follows the FABLE51 conventions (`README.md` in this folder) and leaves the team's files untouched.

**Status of the ground it stands on.** Every claim about the current product was checked against the tree at commit `798778a` on 9 Sep. Every claim about Privy was read from the live docs on 9 Sep; anything not read there is marked _unverified_.

---

## 0. In one paragraph

Today a person funds Froggy with USDC on Base, from another chain through a Privy deposit address, or by card, and the money sits idle until an agent spends it. This feature makes the idle part earn: a small amount stays ready to spend, the rest is moved into a Privy self-service Earn vault on Base, and when a purchase needs more than is ready, Froggy withdraws exactly the shortfall from the vault before it pays. A new **Send** action pays a person on Base, Arbitrum or Solana with a quote shown first, and Privy does the bridging. Every step is a named Privy wallet action with a reference id, every step is judged by a Privy policy rule that pins the vault and caps the amount, and every step leaves a receipt in the Activity the person already has. The person never sees a chain, a gas token, an approval or a bridge. The qualifying flow for the track is **Earn plus transfer**; both are generally available and self-serve. The deposit address is the entry point, not the claim.

## 1. What the track rewards, in its own words

The requirement is one functional financial flow on a generally available Privy feature, with Privy hiding on-chain complexity from the user. The named eligible flows are transfers, bridging, stablecoin conversions, swaps, **self-service Earn vaults** and onramps. A mocked card is allowed only beside another live flow. Judges at earlier events rewarded one story told end to end with the exact named feature, not breadth. So the shape is: one story, four stages, each stage a Privy primitive a Privy engineer recognises by name.

| Stage | Verb in the track text | Privy feature, by its documented name | Status today |
| --- | --- | --- | --- |
| 1. Fund from anything | funding, bridging, stablecoin conversion, onramp | Crypto deposit account (universal deposit address); Add funds modal with card onramp | **Built 9 Sep** (ADR 0015, commit `d998ff2`), arrival is polled, no receipt |
| 2. Idle money earns | growing | Earn deposit, vault position, `earn_deposit` policy method | **Nothing exists** |
| 3. Pay when short | spending | Earn withdraw under `earn_withdraw` per-request cap, then x402 or transfer | **Nothing exists**; the USDC-to-HBAR conversion is the template |
| 4. Move money out | moving, cross-chain transfer | Transfer action with bridging, `transfer` policy method, quote endpoint | **Nothing exists**; today's `wallet_send` is same-chain USDC only |

Stage 2 and 3 together are the qualifying feature. Stage 4 is the second named feature and the closing beat of the demo. Stage 1 is already live and becomes the opening beat.

## 2. Where the product is, and the words it uses

The wallet page is one card with one big dollar number (USDC on Base plus HBAR on Hedera, in dollars), an **Add funds** button, the copy-for-your-agent block, and a "Where it is" disclosure that lists the two balances. There is no Send, no spend bar, no earn, no yield, no payout, no contacts anywhere in the product. The Add funds dialog already has three doors in this order: **Send from another chain** (Privy's deposit-address modal, EVM chains and Solana, lands as USDC on Base), **Send USDC on Base to** (the raw address with a copy button), and **Or pay by card** (Privy's onramp; Stripe, MoonPay and Coinbase sit behind it, there is no Stripe code of our own).

Two things in the bounty draft need translating into the product's live vocabulary. "Pocket" and "allowance" were retired from the UI on 7 Sep (ADR 0011): the person sees **one balance**, a **wallet**, **receipts** as tickets, a **Refused** stamp, a **Your call** ticket for approvals, **Activity**, and Telegram as the **pager**. This PRD uses those words, plus two new ones it introduces on screen:

- **Ready**: the part of the balance that can be spent right now.
- **Earning**: the part that sits in the vault, shown with the yield it has made so far.

The total stays one number. Ready plus earning plus HBAR is the balance; the split is the second line, not a second balance.

Two invariants from the repository's operating contract bind the design and are restated here because they decide the shape of stages 2 and 3:

- **Nothing that changes spending authority is a tool.** The sweep into the vault and the withdraw out of it are things Froggy does on the person's standing instruction, never things the model calls. This is exactly how the USDC-to-HBAR conversion works today: it happens inside a payment the mandate already allows, as a nested, receipted spend, and there is no `convert` tool.
- **Reserve on the ledger before the outbound call, with an idempotency key; write a receipt for a refusal as well as a payment.** A withdraw that fails is a receipt that says so, and the purchase it was for is refused with the reason named.

## 3. The person's journey, stage by stage

### Stage 1: money arrives from anywhere (already built; polish only)

**Who.** Anyone funding Froggy for the first time, and the judge in the first thirty seconds of the video.

**What they see.** Unchanged: Add funds, three doors. They pick "Send from another chain", choose ETH on Base, or USDT on Polygon, or SOL, and send. The dialog already says the arriving amount is a little less than the amount sent and that Bitcoin and Hedera are not covered.

**What changes.**

1. **Arrival becomes an event, not a silent number.** When the balance read sees the deposit land, the conversation gets a timeline marker in the style of the existing conversion marker: _"$4.98 arrived from Polygon as USDC on Base."_ Activity gets a receipt of kind **deposit** carrying the Privy deposit reference, the source chain and asset if Privy reports them, the amount that landed, and no rule id, because a deposit needs no signature and is judged by nothing.
2. **The pager fires.** If Telegram is paired, the same sentence arrives as a card. This is the first time the pager carries anything but questions and digests; it is one new card type.
3. **Earning starts on its own** if the person has turned it on (stage 2): the marker reads _"$4.98 arrived from Polygon. $2.00 is ready, $2.98 is earning."_

**What stays out.** Bitcoin, Hedera as a source, and a mocked Privy Card. The card door is live already; Privy Cards (the spend card product) is a different thing and is not built, mocked or mentioned in the submission.

### Stage 2: what waits, earns

**Who.** Anyone whose balance is larger than what the next few tasks need. In the demo, the person who just funded $5 for a $0.05 purchase.

**Turning it on.** Earning is a choice the person makes once, not a default. On the wallet card, under the big number, a single row reads _"Keep the rest earning"_ with a switch. Tapping it opens a short sheet:

```
Keep the rest earning

Froggy keeps $2.00 ready to spend. Anything above that goes into
Gauntlet USDC Prime, a USDC vault on Base run by Morpho, where it
earns while it waits. When a purchase needs more than is ready,
Froggy takes exactly the difference back out first. You can turn
this off any time and the money comes back the same day.

Vault  Gauntlet USDC Prime · current rate 4.1% a year · Froggy keeps 10% of the yield

                                    [ Keep earning ]   [ Not now ]
```

The reserve figure and the vault name are the two things the person is told; the rate line is shown only when Privy's vault details endpoint reports one (a freshly deployed fee wrapper may report no metrics for a week). The yield share line is honest and stays: revenue sharing is a documented part of the feature and the judge will look for it.

**What happens after.** Whenever the balance read sees ready money above the reserve by at least one dollar, Froggy moves the excess into the vault. This is one Privy **Earn deposit** call, signed by the agent's signer under a policy rule that pins the vault id and caps each deposit (proposal: $25 per request, $100 a day host-side). It is gas-sponsored, so the person needs no ETH. The sweep is never a tool the model can call; it runs after a deposit lands, after a purchase settles, and on the daily digest schedule, so a balance never sits idle for more than a day.

**The wallet card gains one line.** Under the total:

```
$5.12
$2.00 ready · $3.12 earning  +$0.0041 so far
```

"So far" is accrued yield from the Privy vault position endpoint (redeemable value minus net deposits), read with the same cadence and the same rate-limit protection as the balances. An unavailable position reads "earning unavailable", never zero, exactly as the balances do today. The "Where it is" disclosure gains a third row: _Earning in Gauntlet USDC Prime · $3.12 · +$0.0041 · Morpho on Base_, with the vault address linked to the explorer.

**Receipts.** Every sweep is a receipt of kind **earn deposit** filed in Activity, with the Privy wallet-action reference id on the stub, the rule that allowed it, the vault name, the amount, and the transaction id linked once Privy reports it. In the conversation it appears as a timeline marker, not a ticket, because nothing was bought: _"Froggy moved $3.12 to earning."_

**Turning it off.** The switch off opens: _"Bring it all back? $3.12 comes back to ready. Yield made so far stays yours."_ One Earn withdraw for the whole position, receipted the same way. The switch is the only person-facing control; there is no amount picker, no vault picker, no APY chase. One vault, one reserve, one switch.

### Stage 3: a purchase that needs more than is ready

**Who.** Everyone, every time an agent buys something and the reserve is short. In the demo, the agent asked to buy a result whose price is above what is ready.

**What the person sees.** Exactly what they see today, plus one sentence. A purchase the mandate allows runs as it does now. If it is over the approval threshold, the **Your call** ticket pins above the composer and reads:

```
YOUR CALL
$2.40  to blockrun.ai
Image generation, one request.  $0.40 comes out of earning first.
[ Allow once ]  [ Allow for this session ]  [ Deny ]  [ Stop the agent ]
```

The same sentence reaches Telegram on the approval card. Under the threshold, nothing pins; the purchase just runs, and the receipt shows what happened.

**What happens underneath, in order, all before any money leaves.**

1. Froggy works out the shortfall: price minus ready, rounded up to the cent.
2. It withdraws exactly that from the vault with one Privy **Earn withdraw** call, under a policy rule that caps each withdraw (proposal: $10 per request; the host keeps the $25 rolling 24-hour cap because Privy's rolling caps cannot be attached to Earn methods). This is a nested spend keyed to the purchase, reserved on the ledger first, and joined rather than repeated if the tool call is retried. Its shape is the existing conversion's shape (ADR 0011 D3, ADR 0013): withdraw before the purchase is judged, journal before broadcast, recover without re-signing.
3. If the purchase also needs HBAR, the existing USDC-to-HBAR conversion runs next, as today.
4. The agent pays: the x402 payment to the seller, or the transfer to a person (stage 4).

**Receipts.** One purchase, up to three tickets under the same turn, in the order the money moved: _earn withdraw_ ($0.40 from Gauntlet USDC Prime, rule id, Privy reference), then _conversion_ if any, then the _payment_ with its transaction id and evidence. The payment ticket's body carries the one sentence _"$0.40 came out of earning first"_ so a person reading only the last ticket still knows.

**When it goes wrong.** A withdraw that Privy refuses, or that has not succeeded within the purchase's wait (proposal: 60 seconds), refuses the purchase with a named reason, _"earning could not be withdrawn in time"_, gets the Refused stamp with Privy's own words if Privy said them, and pays nothing. Money stays in the vault; nothing is lost, only delayed. A withdraw that was submitted and is not yet confirmed when the run is stopped is **uncertain**, exactly like an unconfirmed conversion today: it is reconciled from the Privy action status before another purchase, and never replayed from history.

**What the agent never gets.** No `earn_deposit`, `earn_withdraw`, `sweep` or `reserve` tool. The agent's only new knowledge is a line in `wallet_status`: ready, earning, and that Froggy will withdraw automatically. It can plan on the whole balance; it cannot move any of it except through a purchase the mandate allows.

### Stage 4: send money to wherever the payee is

**Who.** A person paying a tester, a friend, a contractor, on whichever chain that payee uses. In the demo, a payout to a Solana address.

**A new button.** Next to Add funds on the wallet card: **Send**. It opens a sheet:

```
Send
To        [ paste an address ]           Name (optional)  [ Maria ]
Amount    [ 5.00 ] USD
They use  ( Base )  ( Arbitrum )  ( Solana )
                                            [ Get a quote ]
```

After the quote:

```
Maria receives  5.00 USDC on Solana
Fee             $0.03    (routing, paid by you)
You send        $5.03    · $0.00 comes out of earning first
Quote good for 45 s
                                            [ Send $5.03 ]
```

The quote is Privy's transfer quote: estimated output, estimated fees, expiry. The sheet is written for the payee's outcome first ("Maria receives 5.00 USDC on Solana") because that is the sentence the person will repeat to Maria. The chain picker is the only place a chain is named, and it is named as where the payee is, not as a network the person must understand.

**Who may be paid.** A payee the person types in this sheet has `user` provenance and passes the host's provenance gate as today. Saving a name adds the address to the person's **People** list, which is the same idea as the Paid endpoints directory in Settings: a list the person edits, that the model cannot. Saving also puts the address on the Privy `transfer` rule's condition set, so Privy's policy names the payee too. The agent may later be asked _"pay Maria 5 dollars"_ and can, because Maria is a saved payee; it may never pay an address that appeared only in page content or in its own output.

**What happens underneath.** One Privy **transfer** action: source USDC on Base, destination the payee's address on the chosen chain, exact input. Privy bridges and converts; there is no bridge, approval or gas anywhere in the flow. The action is signed by the agent's signer under a `transfer` rule that pins the source asset to USDC, the destination chain to the three supported chains, the destination address to the People condition set, and caps the amount per request (proposal: $10; host keeps the 24-hour cap). If ready money is short, stage 3 runs first, which is what the "comes out of earning first" line reports.

**Receipts.** A ticket of kind **sent**: _"Sent $5.00 to Maria"_ on the body, _fee $0.03_ as its own line, and on the stub the Privy transfer reference, the rule id, the source transaction id linked to Base, and the destination chain. Status moves from _sending_ to _sent_ when Privy reports the action succeeded; a fill Privy reports as failed refunds to the wallet and the ticket says so. Telegram gets the same sentence.

**The agent-initiated payout.** The existing `wallet_send` tool grows to accept a saved person and a chain, and nothing else changes: same Your call ticket over the threshold, same provenance rules, same receipt. Read aloud, the demo line is _"pay the tester 5 dollars"_, the Your call ticket appears, one tap, Maria has USDC on Solana.

## 4. How it fits the existing flow

- **Chat welcome** gains nothing. The first-run cards stay "Buy the lending snapshot" and "Browse services"; earning is discovered on the wallet card, not pushed at sign-in.
- **Wallet page**: the card gains the ready/earning line, the "Keep the rest earning" switch and the Send button. "Where it is" gains the vault row. Add funds is unchanged.
- **Conversation**: two new timeline markers (arrived, moved to earning) and three new ticket kinds (earn withdraw, earn deposit in Activity, sent). The Your call ticket gains one optional sentence. Nothing else in the stream changes.
- **Activity**: the three new receipt kinds are filterable like the rest, with their Privy reference ids in the evidence sheet.
- **Settings**: Connection gains two lines under the policy line, _"Earning: Gauntlet USDC Prime, up to $25 per move"_ and _"Sending: up to $10 per send, to people you have saved"_, so the leash is legible in one place. A **People** list sits beside Paid endpoints with the same add and remove behaviour.
- **Telegram**: three new cards, arrived, moved to earning, sent. Approval cards carry the "comes out of earning" sentence when it applies.
- **Agents page and the CLI**: an outside agent connected over MCP or the CLI sees the ready and earning figures through the same status call and can trigger stage 3 by buying something, and stage 4 only for saved people. Its scopes do not change.
- **Daily digest**: the report card gains an _Earned_ line beside Spent, Receipts and Refused.

## 5. The demo, in three minutes, on Base mainnet

| Time | Beat | Privy feature on screen |
| --- | --- | --- |
| 0:00 | Wallet card: $0.12 ready, earning off. Tap Add funds, "Send from another chain", send a small amount of ETH on Base to the deposit address. | Crypto deposit account |
| 0:40 | The marker lands: "$4.98 arrived as USDC on Base." Telegram buzzes. | Deposit arrival |
| 0:55 | Flip "Keep the rest earning". The card reads "$2.00 ready · $2.98 earning". Open Where it is: Gauntlet USDC Prime, Morpho on Base. Show a position from a wallet funded a day earlier with yield already visible. | Earn deposit, vault position |
| 1:30 | Ask the agent to buy a $2.40 image. The Your call ticket says "$0.40 comes out of earning first". Allow once. Three tickets file under the turn: earn withdraw, payment, result. | Earn withdraw under `earn_withdraw` cap, x402 |
| 2:20 | Tap Send, paste a Solana address, name it Maria, $5, Solana, Get a quote: "Maria receives 5.00 USDC on Solana, fee $0.03". Send. Ticket: Sent $5.00 to Maria. | Transfer with bridging, quote |
| 2:50 | Settings, Connection: the policy id, the earning and sending lines. "The model never saw a chain, a gas token, an approval or a bridge. Neither did you." | Policy methods |

Keep a recorded clip of the deposit as the fallback for beat 1; a bridge fill on the day is the one step whose timing is not ours. Pre-fund the demo wallet the day before so the earning line shows a non-zero "so far".

## 6. What is real, what is host-side, what is not

This is the honesty box the submission will repeat.

**Real, and Privy's.** The deposit address and the conversion to USDC on Base. The Earn deposit, withdraw and position on Gauntlet USDC Prime, a self-serve Morpho vault, with the fee wrapper deployed from the Privy dashboard. The transfer with bridging to Solana and Arbitrum, and its quote. The `earn_deposit`, `earn_withdraw` and `transfer` policy rules that pin the vault, the payees and the per-request caps, with Privy's refusal in Privy's words on the receipt. Gas sponsorship in app-pays mode on Base.

**Host-side, not Privy.** The reserve figure and the decision to sweep. The rolling 24-hour caps on earn and transfer, because Privy's rolling aggregations attach only to raw transaction signing. The ordering withdraw-then-convert-then-pay, the ledger reservation and the idempotency. The provenance gate and the People list. Arrival detection by polling.

**Not built.** Bitcoin and Hedera as deposit sources. A mocked Privy Card. Exact-output payouts (the payee receives the fee-inclusive amount minus routing) unless the Enterprise fixed-rate flag arrives. A ledgered cross-chain USD balance (Privy digital asset accounts are sales-gated).

**Must be verified before it is claimed.** That the agent's additional signer may call Earn and transfer actions under its override policy; ADR 0015 proved it cannot create a deposit account because that call needs the wallet's owner, and Earn and transfer are wallet actions, not wallet edits, so the expectation is that they work, but it is a spike, not a fact. That the x402 payments Froggy already makes on Base still verify once gas sponsorship upgrades the wallet to an EIP-7702 account (see risks).

## 7. If the Enterprise flag comes through

Design so the flow works without it; take each of these the day it arrives.

1. **Production webhooks.** `wallet.funds_deposited`, `wallet_action.earn_deposit.succeeded`, `wallet_action.earn_withdraw.succeeded`, `wallet_action.transfer.succeeded` and `transaction.confirmed` replace polling. The marker and the pager fire the moment money lands; the Your call ticket's wait for a withdraw shrinks from a poll loop to an event. This is the largest visible gain and touches nothing the person sees except speed.
2. **Fixed rates and custom fees.** The Send sheet switches to exact output: "Maria receives 5.00 USDC" becomes true to the cent, and the routing cost is invoiced to Froggy rather than deducted. The fee line stays, now labelled "paid by Froggy".
3. **Digital asset accounts.** Sales-gated even on Enterprise; ask for it explicitly. If granted, the one balance becomes a ledgered USD figure across Base, Arbitrum and Solana, and "Where it is" reads from the account balance endpoint. The screens do not change.
4. **Cards stay mocked**, meaning not built. The bounty allows a mocked card only next to a live flow; stages 2 to 4 are that flow, and a fake card adds a screen the judge cannot verify.

## 8. Requirements, numbered

**Funding (stage 1)**

- R1. A landed deposit produces a deposit receipt in Activity and a timeline marker in the conversation, with the Privy deposit reference, within one balance-read interval of landing.
- R2. A paired Telegram receives the arrival sentence.
- R3. Nothing in Add funds changes except the arrival copy, which may now say "you will see it arrive here".

**Earning (stage 2)**

- R4. One switch, "Keep the rest earning", off by default, with the sheet in section 3 explaining reserve, vault, automatic withdraw, and yield share.
- R5. One vault, Gauntlet USDC Prime on Base, its id pinned in the Privy `earn_deposit` rule. Steakhouse Prime Instant is the documented fallback if the Gauntlet wrapper is not usable on the day.
- R6. The sweep moves ready money above the reserve, in whole cents, when the excess is at least $1.00, at most $25 per request, at most $100 per day host-side, after a deposit lands, after a purchase settles, and on the digest schedule.
- R7. The wallet card shows ready, earning and accrued yield; unavailable reads as unavailable, never zero. "Where it is" shows the vault row with an explorer link.
- R8. Every sweep is an earn-deposit receipt with rule id, Privy reference and transaction id.
- R9. The sweep is not a model tool and is not reachable from any agent token or MCP scope.
- R10. Switching off withdraws the whole position with one receipt and clears the vault row.

**Spending when short (stage 3)**

- R11. A purchase whose price exceeds ready money withdraws exactly the shortfall, rounded up to the cent, before it is judged, as a nested spend keyed to the purchase, reserved first, joined on retry.
- R12. The withdraw runs under a Privy `earn_withdraw` rule capping each request at $10, and a host-side rolling 24-hour cap of $25.
- R13. The Your call ticket and the Telegram approval card carry "$X comes out of earning first" when it applies.
- R14. Withdraw failure or timeout refuses the purchase with a named reason, a Refused stamp, Privy's words when they exist, and pays nothing.
- R15. An unconfirmed withdraw is uncertain and is reconciled from Privy's action status before another purchase.
- R16. `wallet_status` reports ready, earning, and that withdraws are automatic; it exposes no way to move money.

**Sending (stage 4)**

- R17. A Send sheet on the wallet card: address, optional name, USD amount, payee chain from Base, Arbitrum, Solana; quote before send; the quote shows what the payee receives, the fee, the total, and the expiry.
- R18. Saved names form a People list in Settings, editable by the person only; saving adds the address to the Privy `transfer` rule's condition set and removing takes it off.
- R19. The transfer is one Privy transfer action, exact input, signed under a `transfer` rule that pins USDC as source, the three chains as destinations, the People set as recipients, and $10 per request; host keeps the 24-hour cap.
- R20. A sent receipt with the fee as its own line, Privy reference, rule id, source transaction, destination chain, and a status that resolves to sent or failed; Telegram gets the sentence.
- R21. `wallet_send` accepts a saved person and chain; provenance rules are unchanged; over-threshold sends pin a Your call ticket.
- R22. Stage 3 runs before a send if ready money is short.

**Legibility**

- R23. Settings, Connection shows the earning and sending caps and the policy id in one place.
- R24. The daily digest gains an Earned line.
- R25. Every stub is loud: with no Privy keys the earning switch is present but says "earning is stubbed here", the position is marked stubbed, and every receipt these paths touch carries `stubbed: true`.

## 9. Build order, owners, and the freeze

The operative plan (`NEXT_ITERATION.md`) sets feature freeze at Thu 10 Sep 12:00 CEST and the internal cut at Sat 12 Sep 20:00 CEST. This feature does not fit under that freeze as written. The proposal is a scoped exception for the qualifying flow, in this order, with the cut line after each row; what is above the line at the cut is what the submission claims.

| Order | Work | Owner | Depends on |
| --- | --- | --- | --- |
| 0 (tonight) | Privy dashboard: enable swaps; app-pays gas sponsorship on Base and every source chain in the demo; top up gas credits; deploy the Earn fee wrapper for Gauntlet USDC Prime (10% app share) and record the vault id; add `earn_deposit`, `earn_withdraw`, `transfer` and `eth_sendTransaction` rules to the agent policy; keep the old rules | Hemang | Dashboard access |
| 0 (tonight) | Two spikes, each a paragraph in `docs/evidence/PRIVY.md`: (a) the agent signer can deposit $1 into the vault and withdraw it under the new rules; (b) after sponsorship, an x402 payment to The Graph gateway on Base still verifies from the upgraded wallet | Hemang | Row above |
| 0 (tonight) | Minimum deposit the route accepts for ETH on Base to USDC on Base; the recorded fallback clip of a deposit landing | Jonas | Nothing |
| 1 (Thu) | Stage 2 and 3: vault position in the balance read; sweep; JIT withdraw in the spend path; wallet card line; switch and sheet; receipts and markers; `wallet_status` line | Kristjan, Hemang | Spike (a) green |
| **Cut line P0**: Earn works end to end on mainnet with receipts. |  |  |  |
| 2 (Fri) | Stage 4: Send sheet with quote; People list; `transfer` rule condition set; sent receipt; `wallet_send` extension | Kristjan | Row 1 |
| **Cut line P1**: Earn plus transfer, the claimed flow. |  |  |  |
| 3 (Fri) | Stage 1 polish: deposit receipt and marker, pager card, Earned line in the digest, Settings lines | Hemang | Row 1 |
| 4 (Sat) | Rehearsal on mainnet with a wallet funded Thursday, evidence rows in `PRIVY.md`, submission text, video | Jonas | All |
| 5 (if Enterprise) | Webhooks first, fixed rates second, accounts only if granted | Hemang | Flag |

Jonas's lane during this: the deposit-minimum probe tonight, the fallback clip, the Send sheet copy and the earning sheet copy, the Telegram card texts, the submission paragraph "how Privy improves the experience", and the three-minute run-through on Saturday.

## 10. Risks, and what each one costs

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Gas sponsorship upgrades the person's wallet to an EIP-7702 account, and Froggy's x402 payments on Base are plain typed-data signatures from an EOA | A counterparty that verifies with ecrecover rejects a smart-account signature; the Graph purchase that opens every demo could break | Spike (b) tonight. If it fails: sign x402 with Privy's ERC-1271 option; if the gateway will not verify ERC-1271, keep the demo purchase on the Hedera x402 route, where the withdraw still shows because it feeds the conversion |
| The agent's additional signer may not be allowed to call Earn or transfer actions | ADR 0015 showed a wallet edit needs the owner; if actions do too, every Privy-signed step needs the person's browser session | Spike (a) tonight. Fallback: the person's browser authorises the sweep and the send through Privy's own modal, like the deposit address does; the JIT withdraw then only works while the person is on the page, which the PRD would have to say |
| Fresh fee wrapper reports no APY or TVL for a week | The rate line in the sheet would be blank in the video | Deploy tonight; show accrued yield from a wallet funded a day early; hide the rate line when absent, never fabricate one |
| Rolling caps cannot be expressed on Earn or transfer methods | A judge asking "where is the daily cap" must get an honest answer | Host-side rolling caps, stated in Settings and the honesty box as host-side; Privy per-request caps stated as Privy's |
| No production webhooks | Arrival and settlement are seen one balance read late, up to the 15-second cache plus the 120-second stale window | Poll faster while a deposit or withdraw is known to be in flight; take webhooks if Enterprise lands |
| Bridge fill timing on the day | The one step whose clock is not ours | Recorded clip; deposit before the camera starts; narrate the marker when it lands |
| Feature freeze is Thursday noon | This is a Wednesday-night PRD | The cut lines above; P0 alone is a submittable Earn flow; the decision is Kristjan's |
| Privy's aggregations are app-wide and post-hoc | Two people's sweeps could both pass a per-app cap | Host serialises per person as it does for conversion; per-request caps are the Privy leash, the rolling cap is the host's |

## 11. Open decisions

| # | Question | Proposal | Whose call |
| --- | --- | --- | --- |
| 1 | Grant the freeze exception for P0 and P1 | Yes for P0, P1 only if Thursday ends green | Kristjan |
| 2 | Reserve figure | $2.00, matching the conversion target's floor | Kristjan |
| 3 | App yield share on the fee wrapper | 10%, small enough to be fair, non-zero so revenue sharing is on show | Jonas |
| 4 | Which vault | Gauntlet USDC Prime; Steakhouse Prime Instant if the wrapper fails | Hemang |
| 5 | Per-request caps | $25 sweep, $10 withdraw, $10 send; host 24-hour caps $100, $25, $25 | Kristjan |
| 6 | Earning on by default for new sign-ins | No; the switch is the beat the judge sees | Jonas |
| 7 | Whether to tick Privy B2B as well | Only if the People list plus policy reads as a "payout" workflow; otherwise no, per `PRIZE_AUDIT_FABLE51.md` | Jonas |
| 8 | Ask Privy for Enterprise and, separately, for digital asset accounts | Ask tonight, design as if the answer is no | Jonas |

## 12. Sources

- Track text: `docs/prizes.md` lines 289-301.
- Current funding and its limits: `docs/decisions/0015-deposit-addresses.md`, `docs/research/funding-landscape-2026-09-09.md`, `apps/web/src/components/wallet/add-funds.tsx`.
- Conversion as the template for the withdraw: `docs/decisions/0011-one-balance-and-schedules.md` D3, `docs/decisions/0013-reservations-and-conversion-recovery.md`, `.agents/skills/froggy-leash/SKILL.md`.
- The policy the agent signs under today: `docs/privy-agent-policy.json`; refusals and the unproven items: `docs/evidence/PRIVY.md`.
- Privy Earn: docs.privy.io, wallets/actions/earn (overview, setup, deposit, withdraw, get-vault-position, get-vault-details, policies, revenue-sharing), read 9 Sep 2026. Self-serve vaults listed there: Gauntlet USDC Prime and Steakhouse Prime Instant, both USDC on Base.
- Privy transfer: wallets/actions/transfer (usage, bridging, quote, policies, fixed-rates, collect-fees). Cross-chain capable: Ethereum, Base, Arbitrum, Polygon, Solana, Tempo, Robinhood Chain.
- Privy policies and rolling caps: controls/policies/overview and stateful-policies. Aggregations attach only to `eth_signTransaction` and `eth_signUserOperation`.
- Gas sponsorship and EIP-7702: wallets/gas-and-asset-management/gas (overview, setup). ERC-1271 signing for upgraded wallets is stated there; the linked guide was not reachable on 9 Sep.
- Webhooks and accounts: api-reference/webhooks/overview (production webhooks need Enterprise), wallets/accounts/overview (gated, contact sales).
