# 0007. Telegram through the Chat SDK

Decided 5 Sep 2026.

## Decision

The Telegram pager is built on Vercel's Chat SDK (`chat@4.40.0` with `@chat-adapter/telegram`, `@chat-adapter/state-pg` and, for a database-less build, `@chat-adapter/state-memory`), not on a hand-rolled Bot API client.

## Why

The pager needs four things a Bot API client does not give for free: webhook secret verification, buttons with a callback event model, post-and-edit streaming of an agent's reply, and a thread lock so two messages from the same person do not run two turns at once. The SDK does all four and normalises them, so the code that decides _what_ to say is the same shape as the code that decides what the web ticket says. The DM chat with the agent is the same turn as the web chat (`turn.ts`), streamed to Telegram instead of to SSE, and recorded into the same run so the web app can replay it.

## What is accepted with it

- `zod` enters `node_modules` as the SDK's peer dependency. Froggy never authors a Zod schema; Effect Schema stays the only contract language. This is a transitive dependency, not a widening of the rule.
- `pg` enters through `@chat-adapter/state-pg`, beside the `postgres` driver the rest of the server uses. The SDK's state is a key-value store with its own table, kept apart from Froggy's tables by a key prefix.
- One `@ts-expect-error` in `telegram/pager.ts`: the SDK's `Adapter` type declares `botUserId?: string` while its Telegram adapter declares `botUserId?: string | undefined`, which `exactOptionalPropertyTypes` rejects. Nothing is narrowed or widened by the suppression; it goes the day the SDK agrees with itself.
- The cards are built with the SDK's element functions, not JSX, so no file needs a JSX runtime pragma and the lint configuration is untouched.

## What is not accepted

- No pairing without a code minted while signed in. A Telegram account that has not been paired can neither freeze nor spend nor read.
- No approval from Telegram outside the same registry the web ticket uses; a tap is `interactions.resolve` for the paired user or nothing.
- No unverified webhook: the pager is live only when the bot token and the webhook secret are both set.
