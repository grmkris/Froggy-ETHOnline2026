# Card funding, credentials and the bridge: implementation plan

Status: **planned, not started.** Written 13 September 2026 against `main` at `a0c50ce` (the working tree carried ~240 uncommitted files from another session at the time; none of them are this lane's). Research and evidence levels are in [`docs/research/card-funding-and-credentials-2026-09-13.md`](../research/card-funding-and-credentials-2026-09-13.md). No ADR yet: the one live probe that settles the design (§"Resume here") has not been run, so writing a decision now would be writing it blind. This is post-submission work; ADR 0024's row 24 cut still stands for the submission.

## One sentence

The person connects a disposable crypto-funded card, Froggy funds it just in time from their Privy wallet on Base (swap if needed, then an Across bridge quoted by Uniswap, landing on Linea at the card's address) under an approval card, watches the money arrive, and then the server types the card into the merchant's form without the model ever seeing a digit.

## The demo, as the owner described it

1. **Settings → Payment methods → Connect MetaMask Card.** Paste the card's funding address and pick its chain (Linea, USDC). Saved; the row shows the live USDC balance on that chain.
2. **Add card details.** Number, expiry, CVC, name. Write-only: after save the row shows brand + last4. Stored encrypted under an app key, not readable through any API.
3. In chat, the agent finds the item and quotes. **One approval card**: "Fund card ···ab12 with 25.00 USDC on Linea (from 25.10 USDC on Base via Across, ~2 min) and pay at shop.example? Allow once / Not this time / Stop the agent".
4. Allow → one sponsored Privy `wallet_sendCalls` batch on Base → receipt.
5. The wallet monitor sees the USDC arrive on Linea → the task shows **card funded**.
6. `browser_fill_card` types number / expiry / CVC into the focused fields at checkout; 3DS pauses for the human; the order confirmation is captured from the page.
7. Three separate records, never one opaque "spend": the funding transfer, the observed card charge, the order.

## Decisions taken in this plan (reversible until the ADR)

- **Card is disposable, funded just in time.** That, not the code, is what bounds a leak: screencast, Browser Use's recording, merchant confirmation pages and logs are all outside our control. The card is the policy. Never a reusable card.
- **Server-side typing, not page injection.** There is no in-page protocol for cards; the value goes in via `Input.insertText` to the focused element after a top-origin check, exactly like the password-manager path. It never goes through `Runtime.evaluate` and never into a tool result.
- **Funding leg happens on Base only.** A same-asset bridge is `approve + depositV3` on Base; Across delivers on Linea to `recipient`. No Linea delegation, gas or Privy rule. Linea is a read-only RPC for the monitor.
- **Swap-then-bridge = option 2** of the three in the research (§6): two `TradeStep`s in one `Trade` — the existing `swap` to the person's own wallet, then a new `bridge` step to the card address. Option 3 (one atomic batch on `minimumOutput`) is the polish step if the demo wants a single signature; option 1 (Uniswap `/plan`) only if the probe shows it accepts a foreign recipient and emits `SEND_CALLS` steps.
- **Passwords ride the same rails** but are a separate, smaller lane (§"Lane C"); the card lane does not wait for it.

## Invariants this plan must keep

- `packages/browser` never imports `packages/wallet`; the fill tool lives in `apps/server` and hands the browser a string.
- Nothing the model produces can be a card number, a password or a funding address: the funding address is person-typed in Settings; `browser_fill_card` takes a field name, not a value; the value is resolved server-side.
- Every funding is a `Trade` with reservations, receipt and recovery, through `authorize`; the agent trading rule cannot sign the batch (ADR 0027). The bridge step's `recipient` is pinned to the saved funding address and refused otherwise.
- Every stub is loud: no card configured → the tool says so; `UNISWAP_API_KEY` placeholder → no bridge quote, `stubbed: true`, never a fake `calls[]`.
- History redaction gains a PAN-shaped pattern (13–19 digits passing Luhn, with or without separators) before the fill tool ships, so a merchant page echoing the number cannot land in the archive.
- The hosted Chrome still cannot reach Froggy's own origin.

## Lanes and order

### Lane A — bridge quote and execution (Uniswap + Privy), the leaf first

1. `packages/domain`: add `"eip155:59144"` to `Network`; add `"bridge"` to `TradeStep.kind`; a `Trade` output may name a `recipient` other than the wallet **only** for a `bridge` step, carried as a person-typed `EvmAddress` with provenance.
2. `packages/payments/src/evm.ts`: `EvmNetwork` gains Linea in `EVM_CHAIN_IDS` / `EVM_NETWORK_LABELS` (label "Linea"); USDC contract per network (confirm the Linea USDC address against Circle's list before pinning).
3. `apps/server/src/trading/uniswap.ts`: accept `routing: "BRIDGE"` and decode `BridgeQuote` (`destinationChainId`, `estimatedFillTimeMs`, `fillDeadline`, `exclusiveRelayer`); allow `tokenOutChainId ≠ tokenInChainId` for that kind; relax the `recipient === wallet` check at line 353 for `bridge` only, comparing against the pinned funding address; call `/swap_5792` with the quote and decode `CreateSwap5792Response` into `evm_calls` (`from` must equal the wallet, `chainId` must equal the source chain, 1–8 calls). Add `"eip155:59144"` to `UNISWAP_CHAINS` in `.env.example` with a note that it is a destination only.
4. `packages/wallet/src/privy-execution.ts`: unchanged if the calls decode into the existing `evm_calls` payload (verify the `caip2` is the source chain and `sponsor: true` still applies).
5. `trade_prepare` / `trade_execute`: a `fund_card` intent = optional `swap` step (existing) + `bridge` step; simulation via the existing Tenderly path for the Base batch; the approval card variant names both legs, the fill time and the destination address.
6. Recovery: a `bridge` step that is `confirmed` on Base but not yet seen on Linea is `uncertain` until the monitor sees the transfer or `fillDeadline` passes; nothing re-submits.
7. Tests: adapter decode fixtures from the real `/quote` and `/swap_5792` bodies recorded by the probe; refusal tests for foreign recipient on a `swap` step, for a `bridge` whose `chainId` is not the source chain, and for a stubbed key.

### Lane B — payment method, monitor, fill tool, UI

1. `packages/database`: migration `payment_methods` (id TypeID, user, label, brand, last4, `funding_address`, `funding_network`, `encrypted` bytes, `created_at`, `revoked_at`). `packages/wallet` store methods; `CARD_VAULT_KEY` (32 bytes, `Config.redacted`) for AES-GCM; decrypt only inside the fill path.
2. `packages/domain/src/wallet-monitor.ts`: `OnchainNetwork` gains `"eip155:59144"`; `apps/server/src/environment.ts`: `LINEA_RPC_URL` (read-only); the funding address is watched for a `received` USDC transfer for the duration of a `fund_card` task.
3. `apps/server/src/tools.ts`: `browser_fill_card({ field: "number" | "expiry" | "cvc" | "name" })`. In `packages/browser/src/session.ts` next to `agentType`: read the active tab's top-frame origin (`Page.getFrameTree`, as `WalletBridge.start` does), refuse unless it is the approved merchant host, then `Input.insertText`. First fill per origin raises an approval card through `InteractionRegistry` with the existing `OPTIONS`.
4. History: the PAN redaction pattern in `apps/server/src/history.ts`, with a test using a Luhn-valid test number.
5. `apps/web`: Settings → Payment methods (connect, balance, add details write-only, revoke); the `fund_card` ticket variant; the "card funded" state on the task.
6. Demo-merchant check before the demo: confirm the checkout's card form is same-document (see research §3); otherwise route the card step through the hosted agent with `secretBindings`.

### Lane C — credentials (password manager), independent

1. `packages/browser/src/hosted-agent.ts`: `HostedRunInput.secretBindings?: SecretBinding[]`, forwarded in `create()`; attach the person's bindings to the bootstrap run and every continuation (they are run-scoped).
2. `credentials` table + store, encrypted like the card; Settings → Logins (site, username, password, allowed hosts).
3. `browser_fill_login({ alias, field: "username" | "password" })` with the same origin check and approval-per-origin as the card tool. Snapshot masking is already sufficient (roles and labels only).
4. Optional: a second `addScriptToEvaluateOnNewDocument` script that _detects_ login forms and raises a binding event to surface a "Fill with Froggy" chip. Detection only; never the fill.

## Resume here

1. **Run the probe** in research §7 with the key read from Railway straight into the request. Record the `routing`, whether `recipient` is echoed, `estimatedFillTimeMs`, and the `/swap_5792` `calls[]` (to-addresses should be USDC on Base and the Across `SpokePool` on Base). Save the two response bodies as fixtures under `apps/server/src/trading/` with amounts and addresses as returned. If `recipient` is rejected, option 2 becomes: bridge to the person's own Linea address is impossible too, so the fallback is Across's own API for the deposit call (a new integration) or the person's card funded by a plain Base USDC transfer if the card supports Base — check the card dashboard first.
2. Confirm the Linea USDC contract address from Circle before pinning.
3. Write ADR 0032 (card funding via just-in-time bridge, server-typed disposable card) from the probe result; mark `proposed` until the first testnet-free live bridge of a few dollars has a receipt.
4. Start lane A step 1 (domain leaf), commit by pathspec, gate with `heavy bun run check:fast`, one commit per step.

## Owner-side items

- Which card, and its funding networks as shown in its dashboard (if Base USDC is enabled, the bridge is unnecessary for the demo).
- The funding address to pin; a few dollars of Base USDC in the Privy wallet for the live check.
- A demo merchant whose card form is same-document, or acceptance that the card step runs through the hosted agent.
- Acceptance of CVC-at-rest for a disposable demo card (research §3), to be recorded in the ADR.
