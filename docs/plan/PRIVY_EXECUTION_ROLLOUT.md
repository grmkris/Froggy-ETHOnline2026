# Privy EOA execution rollout

12 September 2026. Implementation decision: [ADR 0027](../decisions/0027-privy-managed-execution.md).

## Current browser-test handoff

The owner explicitly disabled separate Smart Wallets in Privy and authorized Base sponsorship for a manual browser test. Production read-back confirmed:

- `smart_wallet_config.enabled: false`; embedded wallet mode remains `user-controlled-server-wallets-only`.
- `PRIVY_SPONSORED_NETWORKS=["eip155:8453"]`; the parsed Base capability is `mode: live`, `execution: privy_batch`, `feePayer: app`.
- Cleanup code `c974c54` passed all 163 CI browser tests and deployed successfully. The public app and `/health` returned HTTP 200; a fresh browser reported no uncaught page errors.
- A read-only Uniswap probe using the public router as the quote address returned native ETH output on Base. The same 1-USDC pair on Base Sepolia returned HTTP 404/no route. This probe did not create an order or validate a user's approval.
- The live Base and Base Sepolia USDC proxies point to verified `FiatTokenV2_2` implementations with both authorization overloads and SignatureChecker source. This verifies deployed contract support, not an actual post-delegation signature round trip.
- The owner approved the treasury compatibility addition. Policy `wdct7xe9re788wr3htum96pw` now contains `settle-conversion-erc1271-usdc-base`; read-back confirmed all six original rules unchanged and seven rules total. The committed relay artifact retains the legacy rule and adds the separately named bytes-signature rule. No transaction was signed as part of that policy update.

The owner-approved Base browser test supersedes the original testnet-first gate below because that Sepolia quote route was unavailable. Start with a fresh small USDC-to-native-ETH proposal, inspect amount and minimum output, and require the owner's exact approval. A successful sponsored swap and subsequent x402/conversion remain live qualification work. No wallet operation was signed or submitted by the investigation.

## Local verification

- Managed request recovery tests cover persistence before submission, concurrent approval, stable retries after response loss, expiration, frozen trading and refusal of rule authority.
- Provider tests assert the SDK sends exactly the browser-authorized body and headers.
- Settlement tests distinguish an inner user-operation revert from a successful bundle and exclude another operation's logs.
- Native router tests cover wrap/input value and unwrap/output recipient.
- USDC tests cover ECDSA and ERC-1271 signature selection, relay ABI encoding and pre-signing simulation refusal.
- The browser suite passed all 163 tests, including cancellation when browser authorization is unavailable. Browser runs use loud stubs; they do not prove live sponsorship.
- `bun run check` and the production build passed. An isolated local PostgreSQL 17 run also passed all 46 tests across trading-store, wallet persistence and ledger persistence contracts, including the managed authorization round trip and immutable signature check. Other database-dependent suites remain outside that targeted run.

## Before enabling Base Sepolia

1. Verify Privy native gas sponsorship for chain 84532, sufficient credits, intended targets and a global spend limit. A separate Smart Wallet enablement switch is not evidence that this mode is configured.
2. Use a test embedded EOA with test USDC. Record its address and code before delegation without exposing credentials.
3. Set `PRIVY_SPONSORED_NETWORKS=["eip155:84532"]`. This is server configuration, not an agent control. Check capabilities report `feePayer: app` and `execution: privy_batch`.
4. In the owner browser, propose a bounded test swap, review amount/minimum/recipient and persistent delegation notice, then authorize the exact request.
5. Verify the EOA address is unchanged; obtain the Privy operation id, user operation hash and enclosing transaction hash. Check successful inner execution, native output, zero user-paid gas and sponsored gas evidence. Reload during settlement and verify one operation and one receipt.
6. Verify cancellation produces no submission and a rejected sponsorship request exposes an actionable error while retaining any uncertain reservation.
7. Confirm the test USDC implementation supports contract-signature authorization. After delegation, verify EIP-3009 with the ERC-1271 signature, treasury relay simulation, and x402 facilitator acceptance. Update the treasury policy using the reviewed artifact before attempting the new relay overload.

## Before enabling Base

Repeat configuration and contract checks for chain 8453. Require the owner to approve the exact small swap in the browser. Record the same evidence and repeat post-delegation USDC/x402 checks. Do not infer mainnet compatibility solely from Sepolia.

These are the original qualification criteria. The owner subsequently authorized Base browser testing as recorded above. Browser-dapp sends and transfer migration remain a subsequent stage, after live managed execution is proven.

## Separate Smart Wallet retirement

The owner explicitly authorized both the account audit and token-balance queries on 12 September 2026. Read-only production checks returned these aggregates:

- Six Privy users; one separately linked Smart Wallet; no cross-app Smart Wallets. Enumeration completed without reaching its 500-user cap.
- The legacy address has no stored wallet assignment, trade history or held trade reservation, wallet request history, active dapp connection, or matching trading rule in Froggy.
- RPC checks on Ethereum, Base and Base Sepolia found no deployed code and nonce zero on all three. Native balances were zero on Ethereum and Base; Base Sepolia held `1500000000000000` wei (0.0015 test ETH). USDC was zero on Base and Base Sepolia.
- Blockscout returned zero indexed token entries on all three networks. This is indexer coverage, not a claim about assets on every possible chain.

The runtime now has one EOA address role: the obsolete `smart` alias and duplicate smart-account ownership result are removed. Historical protocol labels remain decodable. No account was unlinked, no funds moved, and no history deleted. Preserve the legacy linked record for test-fund recovery.

The separate Smart Wallet configuration was enabled for Kernel on Ethereum and Base at audit time. The owner then disabled the dashboard toggle; the Privy settings API confirmed it is off and embedded wallets remain enabled. The legacy linked record was preserved for recovery.

Cleanup validation: the full repository gate and all 17 trading browser tests passed. The preceding managed-execution release also passed all 163 browser tests in CI and deployed successfully.

## Recovery and rollback

To stop new sponsored proposals, remove the affected network from `PRIVY_SPONSORED_NETWORKS`. Keep the current application version and Privy credentials available so existing managed operations can reconcile. Do not erase held reservations, change operation keys or downgrade to a binary that cannot decode `evm_calls`. An expired request with no provider id requires operator reconciliation from wallet/provider activity.

No live owner signature, gas-credit expenditure or successful live swap is established by the checks above. Dashboard changes are distinguished from code deployment and from actual execution.
