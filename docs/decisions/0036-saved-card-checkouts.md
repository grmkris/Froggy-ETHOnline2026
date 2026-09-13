# 0036 — Saved-card checkout funding and credential release

Date: 13 September 2026. Status: integrated behind a default-off configuration flag; live card entry gated pending iframe acceptance.

The owner requested a demo that funds an independently entered Linea address using existing Base USDC and pays a merchant with a saved card in the shared Chrome. Swaps, password managers, Linea signing, and issuer APIs are outside this change.

## Credential storage

For the explicitly selected demo configuration, the database stores the cardholder name, PAN, expiry and CVC encrypted together with AES-256-GCM. Each write uses a fresh 96-bit nonce. Associated data binds the ciphertext to owner, payment-method TypeID and revision. A redacted server-only 32-byte key is configured separately. Credentials live in a separate table; checkouts contain masked references and observations. This decision does **not** claim PCI compliance. A production card vault requires separate security, retention and compliance review.

`CARD_CHECKOUT_ENABLED` defaults to false. When disabled, every payment-method and card-checkout route returns a versioned `403 card.disabled` refusal before reading request bodies, card storage or provider state. Account and browser purchase controls remain hidden, and checkout polling is disabled.

Only authenticated owner endpoints save, replace, revoke or approve. Revision changes invalidate pending authority, erase revoked credentials and request cancellation of the associated browser task. Account deletion revokes all saved methods. Funding already submitted remains recoverable. A dispatched payment is never automatically retried. Its reservation survives stop and an ambiguous result until the owner explicitly reviews their issuer dashboard and reconciles after confirmed browser-worker release. That acknowledgement is not an issuer-verified charge.

## Funding

The server obtains Coinbase USDC exchange rates and a Linea balance, both fresh within 60 seconds. It rounds upward, adds 5% with a minimum $1-equivalent buffer, subtracts balance available after Froggy reservations and quotes the shortfall. At most three exact-input quotes compensate for bridge deductions. No quote is approvable without sufficient minimum output. A changed price or expired transaction requires a new review.

Uniswap returns `BRIDGE` routing and `/swap_5792` calls for an external recipient. The successful sanitized fixture included an unlimited USDC allowance. Froggy replaces it with the exact input approval and preserves validated Across deposit calldata, including the provider attribution suffix. Extra calls, native value, destination messages, mismatched chains, source wallet, recipient, tokens, amounts and deadlines fail closed. The saved recipient is resolved and checked against owner-scoped storage; ordinary swaps retain their existing restrictions. Standing trade rules cannot fund cards.

One sponsored Privy batch executes through the existing trade ledger and `spendTrade()`. Source settlement validates exact USDC debit and a matching Across deposit. Linea arrival separately matches the Across fill and USDC transfer to that deposit, with bounded scans and durable cursors. Default destination policy is two block confirmations, not L1 finality. Reorgs and RPC failures block credential release. Expiration requires recovery; it implies neither refund nor resubmission.

## Shared browser

Inspection has no card secrets. Payment uses the existing hosted task, same Chrome/profile, remaining allowance and run-scoped secret aliases. The server checks the current merchant and required frame hosts before decrypting; run recording and sharing are disabled. Purchase summaries are converted to fixed observations before persistence, and PAN-shaped Luhn-valid echoes are redacted at Froggy's tool/history boundary. Merchant pages can still expose entered data through the shared screen.

Credential domain enforcement must be verified in the provider's iframe-capable entry path before `CARD_CHECKOUT_IFRAMES_VERIFIED=true`. A controlled live probe focused an actual cross-origin password input, but the provider's `/secrets/{alias}/type` returned `no_focused_field`. This does not establish allowed/denied iframe behavior. The gate remains false.

Funding transfer, merchant order observation and issuer charge remain distinct. The card charge is always independently unverified without an issuer API. Privy controls the funding debit; the issuer controls merchant-side charging.

## Sources

- [Coinbase USDC exchange-rate API](https://docs.cdp.coinbase.com/coinbase-business/track-apis/exchange-rates).
- [Circle USDC contracts](https://developers.circle.com/stablecoins/usdc-contract-addresses).
- [Across chains and contracts](https://docs.across.to/chains-and-contracts).
- [Browser Use v4 OpenAPI](https://api.browser-use.com/api/v4/openapi.json), retrieved during implementation for run-scoped `secretBindings`.
