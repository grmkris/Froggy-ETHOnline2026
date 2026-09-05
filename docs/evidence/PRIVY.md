# Privy — evidence

The wallet, and the leash on the EVM leg.

## What is live

- Sign-in with email or Google through Privy; the access token is the only credential the server accepts, on every `/api/*` route and both WebSockets (as a subprotocol, never a query parameter).
- The embedded wallet is minted by Privy at login and owned by the person. The server asks, with the person's own token, to be added as an **additional signer** under the committed policy `docs/privy-agent-policy.json` (policy `rk6qw974uapbesb04u5tq5kb`, no owner, so the app secret applies it; `bun run privy:policy apply`).
- **The policy, applied 5 Sep 2026 21:40 CEST, has two allow rules and an expiry.** Everything else — `eth_sendTransaction`, `personal_sign`, key export, a transfer to any other address — is denied by default, inside Privy, in a process this repository does not run.
  - Rule (a) `graph-x402-usdc-base-mainnet`: `eth_signTypedData_v4`, EIP-3009 `TransferWithAuthorization` of Base mainnet USDC to The Graph's x402 payee, at most 20000 units ($0.02).
  - Rule (b) `pocket-topup-usdc-base-sepolia`: `eth_signTransaction` on chain 84532 to the Base Sepolia USDC contract, decoded calldata `transfer.to` equal to the treasury `0x74bcfbc5abb7c342a128764e1f17707ee3b0031f`, `transfer.amount` at most 2 USDC, and the rolling 24-hour sum of such transfers at most 5 USDC through aggregation `mpjhq6o0t9gzdvg3x0x4gmb1` (`bun run privy:policy aggregation`).
  - Both rules expire at `1790726400` (2026-09-30 00:00 UTC) through a `system.current_unix_timestamp` condition.
- **Freeze revokes the signer.** The wallet pane's kill switch, `/freeze` on Telegram, and "stop and freeze" on an approval card all go through one function that flips the mandate, aborts the run, denies parked approvals, holds the browser and removes the agent signer at Privy.
- The mandate the agent is held to is not a prompt: `packages/wallet/src/policy.ts` is a pure function the model cannot reach, and there is no tool that raises a limit, adds a payee, or unfreezes.

## The control beat: Privy says no

Two layers refuse, and the receipt shows which one did.

1. `wallet_send` to an address the **model** produced is refused on **provenance** by the host before any cap is consulted, however well-formed the address and however the prompt asked. Nothing reaches Privy.
2. `wallet_send` to an address the **person typed** passes the host's provenance and caps and reaches Privy as an `eth_signTransaction`, authorized by the agent's key alone. Privy has no rule for that recipient and refuses. The refusal lands on the receipt as `failure`, in Privy's words, prefixed with the policy the signer signs under.

The transcript, 5 Sep 2026 21:45 CEST, produced through `packages/wallet/src/evm-signer.ts` against a wallet that carries the agent signer under the policy (`wfd3lz2qm2pmvfu0io1y71yd`, `0x801411Bd076988af967c4172cdF03d61bF4cfb73`, created for this purpose with `additional_signers: [{ signer_id: <agent quorum>, override_policy_ids: [rk6qw974uapbesb04u5tq5kb] }]`):

```text
[A. 1 USDC to 0x…dEaD: no rule names this recipient]
REFUSED in 226ms
PrivySignerRefusedError: Privy refused to sign: 400 {"error":"RPC request denied due to policy violation","code":"policy_violation"}

[B. 0.01 USDC to the treasury: rule (b), under both caps]
SIGNED in 248ms: 0x02f8b183014a3480830f… (180 bytes)

[C. 3 USDC to the treasury: rule (b), over the 2 USDC per-transfer cap]
REFUSED in 114ms
PrivySignerRefusedError: Privy refused to sign: 400 {"error":"RPC request denied due to policy violation","code":"policy_violation"}
```

Privy's own message does not name the policy; the signer knows which one it signs under and says so, so a receipt reads "Privy refused to sign under policy rk6qw974uapbesb04u5tq5kb: 400 {…policy_violation}". The signed transaction in B was not broadcast; it exists to show that the same signer, the same key and the same policy say yes to the one transfer the rule describes.

- TODO(tx): the same refusal on the deployed URL, from a signed-in wallet with the agent granted, as a receipt with `failure`.

## The signed flow (built, awaiting its first live run)

- `packages/wallet/src/evm-signer.ts` asks Privy for `eth_signTypedData_v4` or `eth_signTransaction` on the user's wallet, authorized by the agent's key alone — never the user's token — so every signature is evaluated against the committed policy. A refusal comes back as `PrivySignerRefusedError` carrying Privy's own words, and lands on the receipt as `failure`.
- `packages/payments/src/evm.ts` turns the typed-data signer into an x402 payer for `eip155:8453` and `eip155:84532` through `@x402/evm`'s exact scheme (EIP-3009 `TransferWithAuthorization`), the same payload shape The Graph's gateway demands. The buyer speaks both x402 dialects: v2 `PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE` headers (which the gateway uses, with an empty body) and the v1 body/`X-PAYMENT`.
- `packages/wallet/src/transfer.ts` turns the transaction signer into an ERC-20 transfer the host broadcasts: nonce and fee from the RPC, a fixed gas limit so Privy's decision never depends on the wallet's balance, then `eth_sendRawTransaction` and a receipt. Signing rather than sending on purpose: Privy keeps its rolling aggregations for signing methods only.
- `x402_fetch` picks the first offer in a 402 that a payer exists for: the Hedera pocket, or the person's Privy wallet once the agent has been granted a signer on it. The Graph gateway's live challenge, read on 5 Sep: `exact`, `eip155:8453`, `10000` units of USDC to `0x79DC…FcCB`, `assetTransferMethod: eip3009` — every field the policy names.
- TODO(tx): the first typed-data signature from a signed-in wallet, and the Basescan settlement once the demo wallet holds USDC on Base.
- TODO(tx): the top-up: a Base Sepolia USDC transfer to the treasury under rule (b), on sepolia.basescan.org, and the third top-up in a day refused by the aggregation.

## What Privy does not gate

- The Hedera leg. Privy evaluates policies only on transactions it can decode, and a Hedera transaction is a raw secp256k1 signature to it, so the Hedera x402 payments are made from a host-held account with host-enforced caps: the mandate's per-transaction and rolling caps, and the per-user pocket balance the top-up credits. Freeze zeroes that balance and removes the Privy signer.
- Per-wallet daily sums. The aggregation is app-wide (Privy groups by transaction or calldata fields, not by wallet), and its value is updated after a request is signed rather than before, so two simultaneous transfers can both pass. The demo runs on one wallet, where app-wide equals per-wallet; the host serializes each person's spends.

## Not yet

- **The login-time grant is unverified.** On 5 Sep 21:45 the app held one user-owned embedded wallet (`uuz44hmhivyv4fmtzs8xc9jn`) and it carried no additional signer. Whether the grant on first sign-in attached and the pane says so, or refused and the pane shows Privy's reason, needs one look at the wallet strip by a signed-in person.
- A policy-owner key, so freeze can also wipe the rules; today the policy has no owner and the app secret governs it.
- `personal_sign` under the policy was not exercised (the fixture script called the SDK wrongly); it has no rule and is denied by default.
