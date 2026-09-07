# Iteration 3: recovered plan and completion record

Recovered 7 September 2026 from Claude session `ae4fd45e-aae3-4028-ad26-d03dc4593d34`. This is the repository copy of the decisions previously held only in the local Claude plan `team-demoed-froggy-s-new-zesty-bird.md`. The session started with the team demo transcript at 10:32 CEST and stopped at 14:59 CEST while waiting for the OAuth agent. Its final worktree commit was `d074fb0`; main was `f23a3f2`.

## Decisions the owner already made

| Decision | Agreed behavior |
| --- | --- |
| Spending limits | Hide the controls; default mandates have no caps. Keep the policy engine, provenance, payee and host rules. |
| Balance | One dollar total: Base USDC plus Hedera HBAR at the mirror-node rate. Details behind a disclosure. |
| Funding | Convert USDC to HBAR inside an allowed payment when needed. No deposit watcher in this iteration. |
| Telegram | Two-way conversation, proactive messages, one-off and recurring reminders, and scheduled reports. |
| External agents | Remote MCP with OAuth and `froggy login`; reusable skills contain no secret. Legacy tokens remain available. |
| Navigation | Chat, Wallet, Services, Agents and Settings pages; desktop rail and mobile tabs. |
| Services | Redesign the catalog and task flow now; teammates can iterate afterwards. |
| Activation | Configure reviewed supplier rules and collect paid delivery evidence. The owner supplies the X credential. |
| Card checkout | After lanes 1–6, before the Thursday feature freeze. Sealed storage, masked autofill and a human bank-verification step. |

## Completion state

| Lane | Evidence at recovery | Remaining |
| --- | --- | --- |
| 1. Wallet and conversion | `3d1cdb0`, `9cf1200`, `ea6fef4`; already on main | Signed-in USDC-only purchase demonstrating automatic conversion; confirm the raised 10/25 USDC policy caps are applied and the person granted the signer. |
| 2. Workspace pages | `4d4a5bc`, `9c0a16a`, `4c20408`, `a4b07d7`; already on main | Human review on the live URL. |
| 3. Service catalog | `dc0bdb7`; already on main | One paid result from each provider, with customer and supplier receipts. |
| 4. Telegram schedules | `096f5db`, `ad96b81`, `e17ec15`, `7b037c2`, `f23a3f2`; already on main | Real two-minute reminder, reply, recurrence/timezone check, and restart between scheduling and delivery. |
| 5. OAuth and CLI | Recovered seven commits `c0b4e03` through `d074fb0`; integrated locally with the new pages and schedules | Deploy migration 0009 and the combined app; complete human consent in an actual external MCP client. [Verification record](../evidence/HERMES.md). |
| 6. Marketplace activation | Treasury supplier rules and `SERVICE_SUPPLIER_PAYEES` recorded in [MARKETPLACE.md](../evidence/MARKETPLACE.md); variable presence confirmed during recovery | `X_API_BEARER_TOKEN` is absent on Railway. Five provider delivery proofs remain pending. |
| 7. Card and mixed flow | [Three scenarios](USER_FLOWS_MIXED.md) written | Implementation remains conditional on completing lanes 1–6. Owner inputs: card spender and merchant/item. |

Production was read during recovery: `/health` returned 200 with all six integrations live; `/mcp` and the authorization-server metadata path still returned the SPA HTML. The OAuth work therefore was not deployed. No live payment, Telegram message, signing-authority change or deployment was performed by the recovery work.

## What the recovery finished locally

- Combined OAuth with the newer routes, schedules, store and task dependencies; generated the three OAuth tables as migration 0009.
- Listed OAuth grants and scopes on Agents, with Disconnect exercising the same revocation path as the API.
- Kept the one-time legacy token separately from the reusable skill, in memory across navigation; acknowledging setup clears both.
- Closed a concurrent authorization-code replay race by revoking the grant, including tokens whose insertion finishes after the replay. Refresh requests for another resource are rejected, and consent bodies are bounded.
- Fixed Postgres grant revocation passing an unencoded date to the driver; verified the migration, OAuth operations and schedule claims with independent connections on disposable Postgres 17.
- Fixed successful CLI browser login keeping Node alive for five minutes; added isolated loopback/manual login, refresh and logout browser checks. The CLI respects `XDG_CONFIG_HOME` when supplied.

Local verification passed: `bun run check` (480 unit tests), `bun run e2e` (56 browser tests), both production builds, and the disposable Postgres 17 check.

## Remaining work, in order

1. Deploy the tested OAuth integration and migration; confirm JSON metadata, a 401 discovery challenge and human consent from an MCP client. Disconnect must invalidate its next call.
2. Complete the signed-in funding and Telegram journeys above. Local stubs establish behavior; they do not establish a live payment or delivered phone message.
3. Supply the X credential through the secret configuration, then buy one small task per provider within the existing reviewed limits and fill the evidence table.
4. Revisit card checkout once those prerequisites pass. The gift-with-a-picture scenario gives the clearest reason to combine a paid image service and a print-shop purchase; the merchant and spending amount still need an owner choice.

Branding, the X account, mascot assets and the Monad fitness concept remain team work outside this repository. The session assigned the Monad write-up and X account to Jonas. Do not fold the separate fitness project into Froggy's implementation.
