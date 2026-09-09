# 0015 — Deposit addresses are minted in the browser, not on the server

9 September 2026

Funding said one thing: send USDC on Base to this address. Anything else a person held was their problem to convert. Privy's deposit addresses remove that: the person picks a chain and a token, sends to an address Privy mints, and it arrives as USDC on Base in the wallet they already have.

## The server cannot do it, and that is settled by trying

`POST /v1/wallets/{id}/deposit_accounts/crypto` needs the wallet's owner to authorise. Two spikes on 9 September:

- Against Kristjan's wallet, signed with the agent key that is an additional signer on it: **401, no valid authorization signatures**.
- Against a wallet this app owns outright: **400, destination wallet must have an owner**.

An additional signer is not the owner, and the owner is the person. Authorising as the person means their JWT, and that is the call this app has never been able to make: `POST /v1/wallets/authenticate` answers `400 Invalid JWT token provided` for every user, which is why the agent signer needed a browser consent button in the first place (see `docs/evidence/PRIVY.md`).

## So the browser mints it

`@privy-io/react-auth` exports `useDepositAddress`, already a dependency. Its `createDepositAddress` opens Privy's own source-selection modal with the person's live session, so no JWT crosses our server. `apps/web/src/lib/privy.tsx` exposes it as `identity.startDeposit`, beside `addFunds` and `grantAgentSigner`, which took the same route for the same reason.

## What we promise

EVM chains and Solana, because that is what Privy routes: Ethereum, Base, Arbitrum, Optimism, Polygon, Solana. **Not Bitcoin and not Hedera.** The dialog says so in words rather than implying "any token, any chain", which no rail delivers. Relay mints deposit addresses keylessly and does cover Bitcoin, and SideShift covers Hedera custodially; both are recorded in `docs/research/funding-landscape-2026-09-09.md` and neither is built.

The amount that lands is smaller than the amount sent: Privy's swap documents up to 0.25% plus pool and relayer fees, and the gas is sponsored by this app, which is why fee sponsorship must be enabled per chain in App-pays mode or an address on that chain cannot be created at all. The dialog says the arriving amount is a little less rather than implying parity.

## Arrival

Privy gates production webhooks behind their Enterprise plan, which this app does not have. The SDK's `waitForDeposit` and `waitForCompletion` pollers cover the case that matters, a person watching the page they just deposited from. A deposit that lands while nobody is looking is caught by the next balance read.

## Errors

Privy names eighteen reasons a deposit cannot proceed. Each is turned into a sentence a person can act on, in `DEPOSIT_REASONS`; an unlisted code keeps Privy's own words rather than a shrug. Closing the modal is a choice, not a failure, and reads as one.
