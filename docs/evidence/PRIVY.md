# Privy — evidence

The wallet, and the leash on the EVM leg.

## What is live

- Sign-in with email or Google through Privy; the access token is the only credential the server accepts, on every `/api/*` route and both WebSockets (as a subprotocol, never a query parameter).
- The embedded wallet is minted by Privy at login and owned by the person. The server asks, with the person's own token, to be added as an **additional signer** under the committed policy `docs/privy-agent-policy.json` (rule a: typed-data `TransferWithAuthorization` of Base mainnet USDC to The Graph's payee, per-payment cap $0.25).
- **Freeze revokes the signer.** The wallet pane's kill switch, `/freeze` on Telegram, and "stop and freeze" on an approval card all go through one function that flips the mandate, aborts the run, denies parked approvals, holds the browser and removes the agent signer at Privy.
- The mandate the agent is held to is not a prompt: `packages/wallet/src/policy.ts` is a pure function the model cannot reach, and there is no tool that raises a limit, adds a payee, or unfreezes.

## The control beat

`wallet_send` to an address the model produced is refused on **provenance** before any cap is consulted, however well-formed the address and however the prompt asked. Adding a payee is a person's action in the mandate editor. TODO(tx): the raw Privy denial, with its policy id, for a send that passed provenance but broke the policy.

## Not yet

- The signing call itself through the agent key (EVM x402 typed data to The Graph, plan item 2.5).
- Rule b (a USDC top-up transfer with 24-hour aggregation) and a policy-owner key that can wipe the rules on freeze (plan items 2.9, 2.10).
