# Mainnet release verification — 7 September 2026

Production is configured for Hedera mainnet and Base mainnet. The release owner received the previous session's handoff and independently checked the public challenge, account balances, Privy policies, database state and Telegram webhook. Source fixes described below are awaiting their final deployment; configuration alone does not prove those fixes are live.

## Configuration and rollback

- Hedera float `0.0.10847552`; receiver `0.0.10847556`; Blocky402 `https://api.blocky402.com`; fee payer resolved from `/supported`: `0.0.10571514`; HCS topic `0.0.10847557`.
- Base chain `8453`, RPC chain checked; treasury wallet `yikihk1kul6vh518z6pers1f`, address resolved through Privy: `0x8Cc232c9EB25b4b20ee448106858e3B6281708C2`. Read-only RPC check found 7.530596 USDC and about 0.0221 ETH before this release verification.
- New users receive no automatic credit. The previously authorized owner-only team allowance remains $1. The Graph treasury payer is enabled.
- Database `froggy_mainnet` was created and migrated, then selected for production. The previous `railway` database is retained. Before selection it contained one user, one spend, one receipt and one testnet sale; no Hedera accounts, task credit, tasks, agent tokens or Telegram pairings. No testnet balance was converted into mainnet credit.
- Deployment `0bb5a7e7-7703-4e5d-85fa-b2581fa2df28` successfully restarted the already verified `6608fcc` image against the new database. Health reported every integration live.
- All network, treasury and starting-credit variables are preserved in `.railway/railway.ts`. Configuration backups remain outside Git with restricted permissions. Rollback requires reviewing and restoring a coherent set of database, network, payer, receiver, facilitator and topic settings; reverting the image alone does not revert the network. Keep any new mainnet ledger intact.

For local mainnet development, use the existing external environment file: `bun --env-file=/home/kristjan/.config/froggy-mainnet.env run dev`. Its public configuration now matches production; private keys remain outside the repository. Keyless and browser-test defaults remain explicit stubs.

## Hosted payment findings

The first hosted probe produced a mainnet payment header of roughly 10 KB. Sending both x402 header names exceeded the hosted HTTP header limit. A harmless header-size probe accepted 11 KB and rejected 18 KB with HTTP 431. The rejected transaction `0.0.10571514@1788733374.771506039` was absent from the mirror after its validity window; it was not reused.

Both Hedera signer paths now build the same transfer through the signer callback and limit automatic node selection to three SDK-selected nodes. Proof size fell to roughly 1.3 KB. Offline regression tests verify the signature, payer, fee-payer transaction ID, node count and combined-header size for both local-key and external-key signing.

A subsequent 0.05 HBAR request to the hosted oracle settled successfully:

- [Mainnet transaction `0.0.10571514@1788733693.213156813`](https://hashscan.io/mainnet/transaction/0.0.10571514%401788733693.213156813): float to receiver, fee paid by Blocky402; mirror status SUCCESS.
- [HCS topic `0.0.10847557`](https://hashscan.io/mainnet/topic/0.0.10847557), sequence 1: the matching sold note and sale reference.
- Sale `sal_01m1wddr0vfvqvsfaftr95s214` was delivered with `stubbed: false`, 13 market rows and live Graph Studio provenance. Its durable lookup recovered the answer without another payment.

The HTTP client received a proxy 502 while that request continued and settled. Bun's default ten-second idle timeout can close an in-flight handler before settlement returns ([Bun server documentation](https://bun.com/docs/runtime/http/server#idletimeout)). The server now grants oracle and API requests 180 seconds of inactivity while preserving server-owned operation lifetimes. The deployed response path must be checked after the combined release. This oracle proof used Graph Studio; it does not prove a treasury-funded Graph x402 purchase.

## Base treasury payment

A direct integration check using the existing Privy signer and EVM payer paid The Graph exactly 0.01 USDC on Base mainnet under the existing treasury policy. The query returned HTTP 200 and live block `25921373`. Settlement: [0x9355a0c0…993cd](https://basescan.org/tx/0x9355a0c0378f4a011a9a793d57ed15f045d9dba6c137cf730c72402b5d0993cd). This verifies the provider, funded treasury and policy-controlled signer; it is not a claim that the person-facing top-up/onramp journey was exercised.

## Telegram and release gates

The live bot is `@froggy_onchainbot`. Telegram's `getWebhookInfo` reported the production webhook, zero pending updates and no last error. No Telegram message was sent during this check.

Telegram linking now lives in Agents, with authenticated status checks, recoverable mint/status/disconnect errors, an expiring command and deep link, automatic confirmation while the panel is open, and retained pending setup when the drawer closes. Pairing codes use cryptographic randomness. A mobile browser test covers failures, reconnection, expiry and renewal. A real person must still open the bot and tap Start to link their Telegram identity.

The isolated mainnet and Telegram release passed `bun run check:fast`, `bun run check` (389 unit tests), all 36 Playwright browser tests and both production builds. CI and the final deployed response proof will be recorded after deployment. Marketplace/MCP/CLI work is being reviewed separately; unpaid supplier quotes and configured status do not prove supplier purchases.
