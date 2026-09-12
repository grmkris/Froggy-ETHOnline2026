# 0027 — Sponsor swaps on the embedded EOA with Privy managed execution

12 September 2026. Base enabled behind `PRIVY_SPONSORED_NETWORKS` for owner-approved browser testing; a successful live swap remains unproven.

## Identity and authority

The canonical Ethereum wallet is the Privy embedded EOA in both the browser and server. A separately linked Smart Wallet is never substituted as its address. Privy native `wallet_sendCalls` can delegate this same EOA through EIP-7702 and sponsor its atomic batch. Delegation persists on the selected chain; the review tells the owner this before approval.

The first supported route is a human-approved Uniswap swap on Base or Base Sepolia. The browser signs the exact Privy request, including wallet URL, chain, calls, sponsorship, idempotency key and expiry. The server validates the approval identity and fingerprint, refreshes simulation and balances, and claims principal in the durable trading book before submitting. An agent trading rule cannot authorize this batch. No broad batch permission is added to a Privy agent policy.

Froggy pays gas. A user with USDC and zero ETH can swap to native ETH. Native input still requires enough ETH for principal. Sponsored operations reserve principal without reserving user gas; `actualNativeFee` is zero and `sponsoredNativeFee` records the matched EntryPoint event's actual gas cost. That cost is onchain evidence, not a statement of Privy's final credit billing. There are at most ten claimed sponsored trades per person in a rolling day. Dashboard sponsorship restrictions and a global credit budget must be verified before enabling production.

## Quotes, execution and settlement

Quote contracts accept the `native` asset identifier. Uniswap routing uses the verified Base WETH deployment internally while preserving the requested native asset in the quote. The reviewed Universal Router wraps exact native input or unwraps output to the owner's EOA. ERC-20 approval, Permit2 approval and swap calls form one atomic batch. Quote router versions are pinned to the executable deployments.

The journal keeps the exact request, owner signature, stable step idempotency key, expiry and Privy transaction id privately. User operation hashes and enclosing chain transaction hashes remain distinct. Public trade responses exclude the request and signature. Existing raw signed-transaction recovery remains available, selected from the persisted payload rather than the current sponsorship configuration.

A lost response is retried only with the same saved request and idempotency key before expiry. Expired requests without a provider identity stay uncertain with capital held. Provider identity, chain, receipt canonicality, confirmations, EntryPoint, sender and paymaster are checked. The matching user operation must succeed even if the enclosing bundle succeeds. Only token logs within that operation establish proceeds; native output uses the reviewed router's WETH withdrawal. Unknown outcomes never release capital or create a replacement operation.

The new payload variant and optional journal/fee fields live in the existing JSONB trade document; no SQL migration is required. Old documents remain readable. Once a managed document exists, roll back configuration to stop new sponsored proposals, but keep this reader/reconciler deployed until all managed operations are resolved. An older binary cannot decode the new payload variant safely.

## USDC after delegation

Circle's EIP-3009 verification uses ERC-1271 when the owner's address has code. The signing adapter reads the configured chain immediately before known-USDC authorization signing. An undelegated EOA uses ECDSA; an EIP-7702 delegation designator uses Privy's ERC-1271 signature encoding. Other code is refused. Other signing protocols retain their existing signature selection.

The treasury relay supports both the existing `(v,r,s)` authorization overload and the `bytes signature` overload. Contract signatures are simulated against the USDC contract before the treasury signs its transaction. The relay policy artifact keeps the original rule and adds a separately named contract-signature rule with the same token, zero value, expiry and treasury recipient constraints. Separate names matter because `privy:policy merge` only appends missing names; changing the ABI under an existing name would not update a live policy. Updating this file alone does not update a production policy. After the owner explicitly approved the compatibility addition, the new rule was applied to the configured treasury policy and read back with all six existing rules unchanged. Live chain reads also resolved verified `FiatTokenV2_2` implementations on Base and Base Sepolia with both overloads. Privy signature encoding and x402 facilitator acceptance still require a live round trip after delegation.

## Rollout boundaries

`PRIVY_SPONSORED_NETWORKS` defaults to `[]` and accepts only `eip155:8453` and `eip155:84532`. The initial plan was Sepolia first. Live Uniswap returned no route for the tested Sepolia USDC-to-ETH pair, while Base returned a native-ETH quote. The owner then explicitly chose to enable Base for a small browser-approved test on 12 September. This is authorization to expose the reviewed approval flow, not to execute a swap without the owner. Browser-dapp transactions, ordinary transfers and other venues remain on their existing execution paths until that proof. They must not advertise sponsored execution.

The owner-authorized separate Smart Wallet audit found one unused legacy account holding only observed Base Sepolia test ETH, with no indexed tokens on the three checked networks. Preserve its linked record for recovery. The runtime no longer has a separate smart-account address role; changing the dashboard toggle is a separate operator action recorded in the rollout document.

See [the rollout record](../plan/PRIVY_EXECUTION_ROLLOUT.md) for remaining checks.

## Primary references

- [Privy native sponsorship setup](https://docs.privy.io/wallets/gas-and-asset-management/gas/setup)
- [Privy atomic batches](https://docs.privy.io/recipes/batch-transactions)
- [Privy ERC-1271 signatures](https://docs.privy.io/recipes/evm/erc-1271-signatures)
- [EIP-7702 delegation semantics](https://eips.ethereum.org/EIPS/eip-7702)
- [Uniswap Base deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments)
- [Circle EIP-3009 implementation](https://github.com/circlefin/stablecoin-evm/blob/master/contracts/v2/EIP3009.sol)
