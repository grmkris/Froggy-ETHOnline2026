# Privy — evidence

The wallet, and the leash on the EVM leg.

## What is live

- Sign-in with email or Google through Privy; the access token is the only credential the server accepts, on every `/api/*` route and both WebSockets (as a subprotocol, never a query parameter).
- The embedded wallet is minted by Privy at login and owned by the person. The server asks, with the person's own token, to be added as an **additional signer** under the committed policy `docs/privy-agent-policy.json` (rule a: typed-data `TransferWithAuthorization` of Base mainnet USDC to The Graph's payee, per-payment cap $0.25).
- **Freeze revokes the signer.** The wallet pane's kill switch, `/freeze` on Telegram, and "stop and freeze" on an approval card all go through one function that flips the mandate, aborts the run, denies parked approvals, holds the browser and removes the agent signer at Privy.
- The mandate the agent is held to is not a prompt: `packages/wallet/src/policy.ts` is a pure function the model cannot reach, and there is no tool that raises a limit, adds a payee, or unfreezes.

## The control beat

`wallet_send` to an address the model produced is refused on **provenance** before any cap is consulted, however well-formed the address and however the prompt asked. Adding a payee is a person's action in the mandate editor. TODO(tx): the raw Privy denial, with its policy id, for a send that passed provenance but broke the policy.

## The signed flow (built, awaiting its first live run)

- `packages/wallet/src/evm-signer.ts` asks Privy for `eth_signTypedData_v4` on the user's wallet, authorized by the agent's key alone — never the user's token — so every signature is evaluated against the committed policy. A refusal comes back as `PrivySignerRefusedError` carrying Privy's own words, and lands on the receipt as `failure`.
- `packages/payments/src/evm.ts` turns that signer into an x402 payer for `eip155:8453` and `eip155:84532` through `@x402/evm`'s exact scheme (EIP-3009 `TransferWithAuthorization`), the same payload shape The Graph's gateway demands. The buyer speaks both x402 dialects: v2 `PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE` headers (which the gateway uses, with an empty body) and the v1 body/`X-PAYMENT`.
- `x402_fetch` picks the first offer in a 402 that a payer exists for: the Hedera pocket, or the person's Privy wallet once the agent has been granted a signer on it. The Graph gateway's live challenge, read on 5 Sep: `exact`, `eip155:8453`, `10000` units of USDC to `0x79DC…FcCB`, `assetTransferMethod: eip3009` — every field the policy names.
- TODO(tx): the first signature from a signed-in wallet, and the Basescan settlement once the demo wallet holds USDC on Base (owner step 4).
- TODO(tx): a request outside the policy — another payee, or over $0.25 — refused by Privy with the policy id on the receipt.

## Not yet

- Rule b (a USDC top-up transfer with 24-hour aggregation) and a policy-owner key that can wipe the rules on freeze (plan items 2.9, 2.10).
