# X research chat recovery — 8 September 2026

## What happened

The person requested X research about a possible meme coin launch. Froggy inspected the service catalog, then queried twelve lending indexes for `HUNTER`, calling that query free. Four indexes returned no matching lending markets; eight failed. Neither outcome answers the social-research question. The Graph transport can spend treasury funds even when no user receipt is created.

A later tool call supplied a string protocol version and was rejected. No corresponding new service task or user receipt was present in the production database at the time of the diagnostic check. Railway recorded successful HTTP chat streams, which do not imply successful tools. Completed conversation messages are not durably stored; the pasted transcript supplied the missing details.

The displayed wallet refusals were older: 7 September at 10:06 and 10:08 Berlin time. The requested authorization was valued at 500001 USD micros; the retained credit was 499999. Four-decimal formatting hid that two-micro-dollar shortfall. The allowed receipt has no settlement recorded. No ledger adjustment or refund was made during this investigation.

## Changes

- The agent guidance directs X research to `x_search`, limits Graph to lending/borrowing/yield questions and explicitly says its queries may spend treasury funds.
- Chat's service tool derives its task fields from the strict wire schema, but does not ask the model to supply `v`. The server inserts numeric `v: 1`; HTTP contracts remain versioned and strict.
- The agent is told to retrieve the task result and distinguish validation errors, refusals, pending work and delivery.
- Graph non-2xx responses preserve bounded JSON error details, including treasury signing refusals. Empty 402 responses explicitly say supplier payment did not complete. HTML and oversized error pages are not forwarded to the model.
- The Graph tool no longer duplicates the deployment diagnostic paragraph.

These fixes do not repair upstream indexer availability, prove a successful Graph payment retry, or make prompt routing deterministic. They do not add persistent chat history or change the wallet's numeric accounting.

## Verification and release

The main checkout has another agent's ongoing purchase, browser, wallet and database changes. To validate this patch independently, the five source/test files were tested against committed baseline `b7025b3fc5f3fa0df58c6a24f29a8df7883eb14e` in an isolated copy. Shared `tools.ts` edits were excluded from that copy except the changes above. Focused Graph/tool tests pass (24 tests). `bun run check` passed all 17 tasks and dead-code detection; `bun run build` passed both build tasks. These results apply to the isolated recovery patch, not the concurrent combined checkout.

`FROGGY_E2E_PORT=3310 bun run e2e --workers=2` finished with 106 passes and one failure. Service/MCP, chat streaming and workspace browser checks passed. The appearance-persistence test exceeded its 30-second total timeout on the final `/wallet?theme=unknown` navigation. A targeted rerun also failed near the final reload, with a closed browser-session diagnostic. The browser suite is therefore not fully green; no appearance code or test was changed to conceal the failure. The combined checkout still needs its own full gate and browser verification before release.

No deployment or paid provider request was performed by this recovery session. The next live acceptance is one `x_search` task through Froggy: a numeric-version task is created, the person's Hedera payment is recorded, X results are returned, and `service_status` retrieves that same task without another purchase. The X API leg uses the configured API credential rather than an upstream x402 charge.

## Deployment follow-up

The owner subsequently requested the combined release. The recovery changes were deployed with URL purchases and trading research services on 8 September 2026. See [the release evidence](RELEASE_2026_09_08.md) for the exact deployment, combined verification and live smoke results.
