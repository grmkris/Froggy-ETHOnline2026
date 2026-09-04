# 4. The CDP boundary is narrowed at the call site, not schematised

Date: 2026-09-04

## Status

Accepted.

## Context

`AGENTS.md` makes Effect Schema the application's contract language and the anti-slop lint rules enforce it: a parameter typed `unknown`, a `typeof` narrow, or an unjustified type assertion at an I/O boundary is an error.

`packages/browser` talks to Chrome over the DevTools Protocol. CDP has several hundred methods, its payloads are specified by Chrome rather than by us, and the set we depend on changes as the browser does. Writing schemas for the ten or so commands this package sends would produce a second, partial definition of somebody else's protocol — one that a Chrome update can invalidate without any test noticing, because the schema would keep passing while describing something Chrome no longer sends.

## Decision

`packages/browser` narrows CDP payloads at the call site that issues the command, against the protocol documentation, and names the boundary with a `CdpPayload` type. `anti-slop/no-unknown-parameters`, `anti-slop/no-runtime-typeof` and `anti-slop/no-unsafe-dictionary-type` are disabled for that directory in `oxlint.config.ts`, with the reasoning stated inline.

Every _other_ wire format keeps the rule. Both WebSocket protocols and the screencast frame header are Effect Schema in `packages/protocol`, including the three-number frame header where a hand-written check would have been shorter.

## Consequences

- A malformed CDP payload degrades a snapshot or drops a frame; it does not throw. That is already the failure mode this package wants.
- The exception is one directory and three named rules. Widening it means editing this file, not adding a disable comment.
- If a CDP payload ever reaches the _model_ or the _policy engine_, it must be parsed first. Page text already is: it crosses into the agent behind `PAGE_CONTENT_FENCE`, tagged as data.
