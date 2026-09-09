# Agent operating contract

This repository is written by coding agents for a human operator who observes, tests, and gives product direction. Treat implementation requests as permission to complete the local, reversible work the request requires. Ask only when a missing choice changes the product, or requires an external or destructive action.

## What this is

Froggy: a web workspace where a human and an AI share **one Chrome**, and a Privy policy is the leash on what the agent can spend. Built for ETHOnline 2026 against Privy, The Graph, and Hedera x402. `README.md` is the short version; `docs/` has the product argument and the market research behind it.

## Start here

1. Read the nearest nested `AGENTS.md` for the area you touch.
2. Load the matching repository skill from `.agents/skills/` — `froggy-leash` for anything that moves money, `froggy-browser` for the shared Chrome, `froggy-verification` before declaring anything done.
3. Use the installed library documentation and types as the API source of truth. Effect 4 is pinned to an RC, so read `node_modules/effect/AGENTS.md` before Effect work.
4. When asked to retrieve recent Froggy conversations or agent activity, start with [the conversation retrieval runbook](docs/CONVERSATION_RETRIEVAL.md). It records the verified production access paths and transcript-retention limits.

User instructions override repository skills. Skills inform implementation; they do not expand authorization.

## Toolchain

- Runtime and package manager: Bun. Use `bun` and `bunx --bun`, never npm/pnpm/yarn for project operations.
- TypeScript: strict TS7. Bun transpiles but does not replace type checking.
- Format/lint: Ultracite — Oxfmt, Oxlint, type-aware tsgolint, anti-slop.
- Tests: `bun test`. Browser flows: Playwright.
- Run `bun run check:fast` during work and `bun run check` before declaring completion. Run `bun run e2e` for visible or browser-facing changes.
- Do not install Git hooks automatically. `bun run hooks:install` is opt-in.

## Dependency direction

Declared once in `tools/graph.ts`, enforced as a lint rule and as a whole-graph check. Two edges in that file are the threat model rather than tidiness:

- **`packages/browser` may not import `packages/wallet`**, and the reverse is also forbidden. The browser is where hostile content lives; the wallet is where signing happens. They meet in exactly one file, `apps/server/src/services.ts`.
- **`packages/domain` is a leaf.** Money, mandates and decisions have no transport, no persistence and no UI, so a policy decision cannot depend on where a request arrived from.

Widen a boundary by editing that declaration and recording why, not by working around it. Do not weaken a global rule to resolve one local inconvenience.

## Runtime invariants

- Effect owns configuration, the server lifecycle, and the wire contracts. Effect Schema is the contract language: **do not add Zod.** Third-party SDK adapters (`wallet`, `payments`, `graph`, `browser`) are plain async TypeScript behind Effect-typed edges — see `docs/decisions/0005`.
- Every wire message carries an explicit `v` and is decoded before use.
- Entity identifiers are TypeIDs declared in `packages/domain/src/id.ts`. Add an entity by adding one `makeIdSchema` pair there; never a bare `string` id.
- **A run belongs to the server, not to the socket that started it.** Never pass `req.signal` as an agent abort signal: a closed tab would kill a turn between reserving a spend and writing its receipt.
- **Nothing that changes spending authority is a tool.** See `froggy-leash`.
- Cap every tool output. An uncapped page dump reaches the stream, every later prompt, and the replay buffer.
- Avoid `as any`, double assertions, `@ts-ignore`, invented compatibility paths, speculative abstractions, and file-per-concept explosions.

## Stubs

Every external service has a stub, selected in `apps/server/src/environment.ts` when its variable still holds the placeholder from `.env.example`. Nothing else in the codebase branches on an environment variable.

A stub is **loud**: the wallet pane marks it and every receipt it touches carries `stubbed: true`. If you add an integration, add both implementations and both markers. A faked run that could pass for a real one is the one failure mode this design exists to prevent.

## UI

- Inspect the `components.json` for the workspace you are changing (`packages/ui/components.json` or `apps/web/components.json`; there is no root one), then use the shadcn CLI for shared components.
- Use semantic tokens from `packages/ui/src/styles/globals.css`. Keep accessible names, focus states, reduced-motion behaviour, and responsive layouts.
- Screencast frames never touch React state.
- A visible change is incomplete until the app boots, browser errors are checked, and the changed interaction is exercised.

## Onchain

- Never invent or remember a production address. Resolve it from a verified primary source.
- Never put a private key in the browser or the repository. Server signers read redacted configuration and are unwrapped only at the call site.
- Networks are configuration, never literals: `HEDERA_NETWORK` picks Hedera testnet or mainnet and the facilitator host follows it. The owner directed iteration 2 to mainnet on 6 Sep 2026 (`docs/plan/NEXT_ITERATION.md`); a checkout with no configuration still sells on testnet, and anything that moves real funds gets the stronger review that direction asked for.

## Change discipline

- Preserve user changes and keep edits inside the requested scope.
- Prefer the smallest complete vertical slice over placeholder packages.
- Record durable architectural decisions in `docs/decisions/`.
- Comments explain non-obvious constraints or tradeoffs, not the line beneath.
