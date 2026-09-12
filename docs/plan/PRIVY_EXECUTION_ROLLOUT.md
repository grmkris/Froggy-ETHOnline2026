# Privy EOA execution rollout

12 September 2026. Implementation decision: [ADR 0027](../decisions/0027-privy-managed-execution.md).

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

Keep sponsorship disabled on Base until these prerequisites are satisfied. Leave browser-dapp sends and transfer migration for the subsequent stage of the approved plan, after live managed execution is proven.

## Separate Smart Wallet retirement

The owner explicitly authorized both the account audit and token-balance queries on 12 September 2026. Read-only production checks returned these aggregates:

- Six Privy users; one separately linked Smart Wallet; no cross-app Smart Wallets. Enumeration completed without reaching its 500-user cap.
- The legacy address has no stored wallet assignment, trade history or held trade reservation, wallet request history, active dapp connection, or matching trading rule in Froggy.
- RPC checks on Ethereum, Base and Base Sepolia found no deployed code and nonce zero on all three. Native balances were zero on Ethereum and Base; Base Sepolia held `1500000000000000` wei (0.0015 test ETH). USDC was zero on Base and Base Sepolia.
- Blockscout returned zero indexed token entries on all three networks. This is indexer coverage, not a claim about assets on every possible chain.

The runtime now has one EOA address role: the obsolete `smart` alias and duplicate smart-account ownership result are removed. Historical protocol labels remain decodable. No account was unlinked, no funds moved, and no history deleted. Preserve the legacy linked record for test-fund recovery.

The separate Smart Wallet dashboard configuration was still enabled for Kernel on Ethereum and Base at audit time. The installed SDK exposes its read API but no app-settings mutation, and this session has no authenticated dashboard control. The operator can disable the **separate Smart Wallets** toggle in Privy's dashboard while keeping embedded wallets and native gas sponsorship configured. Read the setting back afterward; the code cleanup alone does not establish that the dashboard toggle changed.

Cleanup validation: the full repository gate and all 17 trading browser tests passed. The preceding managed-execution release also passed all 163 browser tests in CI and deployed successfully.

## Recovery and rollback

To stop new sponsored proposals, remove the affected network from `PRIVY_SPONSORED_NETWORKS`. Keep the current application version and Privy credentials available so existing managed operations can reconcile. Do not erase held reservations, change operation keys or downgrade to a binary that cannot decode `evm_calls`. An expired request with no provider id requires operator reconciliation from wallet/provider activity.

No live owner signature, gas-credit expenditure, Smart Wallet setting change, treasury policy update or successful live swap is established by the local verification above.
