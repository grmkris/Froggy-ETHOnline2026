# 5. Effect at the edges, plain TypeScript in the SDK adapters

Date: 2026-09-04

## Status

Accepted.

## Context

This repository inherits an operating contract in which Effect owns I/O, configuration, failures, resources and service lifecycles, and Effect Schema is the only contract language. That contract is worth keeping: it is what makes the wire protocols, the identifiers and the domain types trustworthy.

It also meets four third-party SDKs that are none of those things. Privy, the x402 packages, the Hiero SDK and the Vercel AI SDK are all promise-based, callback-shaped, and large. Wrapping each in Effect layers would be real work before any of them did anything, and this project has nine days.

## Decision

Effect keeps the boundaries it is good at:

- `Config` for every environment variable, `Config.redacted` for every secret.
- `Schema` for the domain, both wire protocols, and every JSON body we receive from a third party — the Graph gateway, the x402 facilitator, a 402 challenge.
- `Layer` for the server lifecycle, so Chrome and the socket are released together.

The adapter packages — `wallet`, `payments`, `graph`, `browser` — are plain async TypeScript behind Effect-typed edges. They return values rather than effects, and their errors are values rather than tagged failures.

## Consequences

- This is a real relaxation of `AGENTS.md`, which is why it is written down rather than discovered. `AGENTS.md` now says so at the point it makes the rule.
- The parts most likely to be wrong — a policy decision, a wire message, a malformed 402 — are still parsed and typed. The parts that are mostly plumbing are not.
- Adding Zod is still forbidden. Where a boundary needs parsing it gets an Effect Schema, including inside the adapter packages.
- Amended 5 Sep 2026: `packages/wallet` may use `effect` directly, because the store it owns reads mandates and receipts back from Postgres as documents, and a document is somebody else's bytes until a schema says otherwise.
- Tightening this later is additive: an adapter can grow an Effect layer around its existing interface without its callers changing.
