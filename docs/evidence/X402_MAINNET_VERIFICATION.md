# x402 mainnet activation

Checked 8 September 2026 after the owner explicitly requested real mainnet payments.

## Deployment and configuration

The production app is https://app-production-58dd.up.railway.app. Railway project `d6f4178e-fc21-4827-8347-20b1cec2aba4`, environment `44c2247f-e0a2-43f8-9b46-586a29126157`, app service `393648df-65e9-4491-87f3-1b896c736b9f`.

The combined source upload `7f96df7f-04b6-4fe6-af25-6e6aaec05cfa` reached SUCCESS and includes URL purchases, browser approvals and concurrent trading research work. This upload was already running when mainnet activation began. Its release message is “Deploy combined X research recovery, URL purchases, browser approvals and trading research services”.

Base and Hedera were already mainnet. `SOLANA_NETWORK` was missing, so it was set explicitly to mainnet and read back. That configuration update started release `6a457b90-f30d-4aa1-a32c-3cef4ed3799a`, which unexpectedly rebuilt the configured Git revision `b7025b3` instead of retaining the CLI upload. Post-deploy checks caught that the purchase files and 402 route were absent. The exact combined image was then restored with `deploymentRedeploy(id: "7f96df7f-04b6-4fe6-af25-6e6aaec05cfa", usePreviousImageTag: true)`, creating release `bce45847-38df-49f7-acd7-2bb3c73339a6`. Future configuration changes to a CLI-uploaded build must use `--skip-deploys` and then explicitly redeploy that artifact; otherwise the configured Git source can replace it.

| Setting               | Read-back value                           |
| --------------------- | ----------------------------------------- |
| `EVM_NETWORK`         | `eip155:8453`                             |
| `HEDERA_NETWORK`      | `hedera:mainnet`                          |
| `SOLANA_NETWORK`      | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `SOLANA_RPC_URL`      | Unset; configured-network default applies |
| `POCKET_STARTING_USD` | `0`                                       |

Restored release `bce45847-38df-49f7-acd7-2bb3c73339a6` reached **SUCCESS**. Its running files again matched all seven purchase/MCP/contract/migration fingerprints. Runtime environment reads confirmed all three mainnet identifiers, and the purchase table and migration remained present. Public `/health` returned 200 and `/demo/x402/report` returned the expected mainnet 402.

The checked-in Railway declaration now preserves the Solana network and RPC settings. No wallet policy was broadened and no account was funded as part of this configuration change.

## Deployed code and persistence

Read-only inspection of the combined image matched seven deployed SHA-256 fingerprints to the local purchase routes, coordinator, tool, MCP integration, domain/protocol purchase contracts and migration. A read-only database transaction verified `froggy_mainnet.public.purchases` with the expected columns and migration row 13 matching `0012_goofy_groot.sql`. The database retained that additive migration during the temporary older-image rollout.

The public app and Privy login modal rendered without JavaScript errors. The seller landing and intended 402 paywall rendered correctly. A fresh browser has no owner session, so these checks did not exercise authenticated shared Chrome or approval.

## Fresh unpaid discovery

At approximately 19:18 UTC, CoinGecko price GET, PayAI Base echo GET and PayAI Solana echo GET returned valid x402 v2 mainnet offers for 10,000 USDC base units ($0.01). Exa POST `/contents` for one public URL offered 1,000 units ($0.001). See [supplier URLs and primary documentation](X402_DEMO_PROBES.md).

The deployed `/demo/x402/report` returned HTTP 402 for 0.05 HBAR on Hedera mainnet, payable to `0.0.10847556`, with facilitator fee payer `0.0.10571514`. These identifiers came from the current deployed challenge; they were not supplied from memory. Seller discovery names `https://api.blocky402.com`.

## Live purchase proof

Pending: authenticated owner approval, real signature, settlement transaction checked against the approved recipient/amount, and saved paid response. A working quote, a live provider label and the earlier local stub tests do not complete this proof.

## Funding and owner prerequisites

Public primary-chain reads at 19:23 UTC found the configured Hedera float held 604.69621996 HBAR and the receiver held 12.40029489 HBAR. The configured Base treasury held 7.440596 USDC with RPC chain ID 8453 verified. Those are service funds, not proof of the approving person's funds. Mainnet token addresses were checked against [Circle's registry](https://developers.circle.com/stablecoins/usdc-contract-addresses).

The configured demo owner's private wallet lookup was blocked by automatic approval review. No owner wallets were enumerated or retrieved by that check. The signed-in person must verify their displayed address and balance and approve the bound purchase. No owner JWT was extracted, no policy was broadened and no payment was signed by these checks.

## Verification scope

The isolated purchasing checkout passed `bun run check` after the Railway declaration change. The shared checkout's `bun run check:fast` stopped on formatting in six files being edited by the concurrent trading persistence task; those unrelated edits were preserved. The existing purchase browser suite and public production login/seller checks are recorded in [local verification](X402_LOCAL_VERIFICATION.md). No new authenticated browser purchase is claimed here.

The six core production integrations (database, Graph, Hedera, model, Privy, Telegram) report live. Three adapters from the separate trading work (Birdeye, Uniswap, QuickNode) still report stub; this mainnet purchase activation did not configure or validate those unrelated adapters.
