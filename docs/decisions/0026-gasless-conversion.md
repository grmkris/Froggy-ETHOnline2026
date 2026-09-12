# 0026 — The conversion is an authorization the treasury settles

12 September 2026. Owner chose the gasless path over a pre-flight ETH check.

## What broke

The first live conversion on production failed with `eth_sendRawTransaction: gas required exceeds allowance (0)`. The person's Privy wallet held USDC and no ETH, and the conversion (`docs/decisions/0013`) was a plain ERC-20 `transfer` signed by the person's wallet, so there was nothing to pay Base for gas. Every funding surface in the product hands a person USDC on Base and nothing else, so every new person would have met the same wall on their first Hedera payment.

## What changed

The USDC leg is now an EIP-3009 `TransferWithAuthorization`, the same primitive an x402 payment on Base already uses:

1. The person's wallet signs the authorization as typed data under their own Privy policy. `personPolicyRules` writes the `conversion-usdc-to-treasury` rule for `eth_signTypedData_v4` with the recipient pinned to the treasury and the value capped at their per-spend number, and no longer writes an `eth_signTransaction` rule for the conversion.
2. The treasury wallet (`TREASURY_WALLET_ID`) signs a zero-value transaction to the USDC contract calling `transferWithAuthorization(...)`, under its own policy, and the server broadcasts it. The token verifies the person's signature, so the relayer can move only the amount they signed to the address they signed.

`sendAuthorizedTransfer` in `packages/wallet/src/authorized-transfer.ts` does both signatures and computes the settlement hash before broadcast, so `conversion.ts` persists it and reconciles a retry exactly as it did for the plain transfer. The EIP-712 domain (`name()`, `version()`) is read from the token rather than remembered, because Base USDC and Base Sepolia USDC answer differently.

A deployment with no treasury wallet still signs a plain transfer. The mandate side is unchanged: the conversion is still a nested spend keyed `convert:<parent key>`, judged, reserved and receipted like any other, and never a tool.

## What it needs at Privy

- **Treasury policy:** one new rule, `docs/privy-treasury-relay-rule.json`, merged with `PRIVY_POLICY_ID=<treasury policy> bun run privy:policy merge docs/privy-treasury-relay-rule.json`. It allows `eth_signTransaction` on Base mainnet to the USDC contract with value `0` and `transferWithAuthorization.to` equal to the treasury address, until 30 September 2026. The relayer pays gas; it cannot direct funds anywhere but the treasury.
- **Person policies:** minted from the code, so a person whose policy predates this change keeps the old rule until they save their rules again in Settings. Until then Privy refuses the conversion signature and the receipt says so, with that instruction.
- **The shared agent policy** (`docs/privy-agent-policy.json`) still carries rule (b) as a signed transfer. A person still on the shared policy is refused until they move onto their own rules; the shared policy's 24-hour aggregation has no typed-data equivalent this repository has verified, so no typed-data conversion rule was added there.

## What was rejected

A pre-flight ETH balance check with a "send ETH to this address" message. It would have made a person hold a second asset nothing in the product tells them about, to pay a fee the product could pay itself.
