# Hand verification

The feature documents were written from the code and the tests. This directory is the protocol for checking them against the running product, one observable claim at a time.

## What is here

| File | Covers |
| --- | --- |
| [foundations.md](foundations.md) | `foundations/*` |
| [workspace.md](workspace.md) | `workspace/*`, including the conversation |
| [agent-surface.md](agent-surface.md) | `agent-surface/*` |
| [cross-cutting.md](cross-cutting.md) | `cross-cutting/*` |

Each file has one table per document. Each row is an item with a stable ID (`FUND-07`, `LEASH-12`), a priority, what it needs, the claim with a link to the document section, the setup, numbered steps, the expected result, and a Result column for the tester. Items that cannot be checked by hand are listed under each document as "Not checkable by hand".

Priorities: **P1** is an established fact, a claim many documents depend on, or a suspected bug; **P2** is an ordinary claim; **P3** is a number, a colour, or a timing.

## The rule that overrides the usual protocol

Froggy ships with a loud stub for every external service, and **a stubbed run never verifies a claim about money, provenance, or a live service.** A pass run against stubs can confirm that a refusal appears, that a dialog opens, that focus returns; it cannot confirm that a payment settled, that a Hedera transaction exists, or that a Graph query returned real numbers.

Three things in particular have no stubbed substitute, and an item that depends on one is `blocked` rather than `pass` until it is run for real:

- A Graph query returning numbers that **change between runs**, from a live key.
- A Hedera transaction id from a real paid request, resolving on a testnet mirror explorer.
- One live Privy financial flow.

Mark such items `blocked (stub)` rather than passing them. This is the failure mode the whole product is built to prevent, and a verification pass that launders a stubbed run into a green row would be the worst possible way to reintroduce it.

## How to run a pass

1. **Bring up the surface.** Either the deployed app at its Railway URL, signed in with a real account — which is the only way to check anything about money — or locally with `bun run dev`, which runs the server and the web app together against whatever credentials the environment holds. Check `/health` before starting: it reports each integration as live or stubbed, and that reading decides which items can pass and which are blocked.
2. **Confirm the commit.** Every document ends with `Verified against the Froggy tree at commit 5caed50`. Run `git rev-parse --short HEAD`; if it differs, the documents describe a different build and some failures will be drift rather than defects. This tree moves daily and several agents commit to it, so expect drift and check before filing.
3. **Keep the document open beside the product.** Read the linked section before each item; the item is a summary and the section is the claim.
4. Work through **P1 first across all files**, then P2, then P3.
5. Record `pass`, `fail`, `blocked`, or `blocked (stub)` in the Result column, with a note for anything other than a clean pass.
6. **File every fail in [`bug-triage.md`](../bug-triage.md)**: if an entry exists, add a Status line quoting the item ID; if not, add an entry with the item ID under "Raised by". A fail is not automatically a product bug — sometimes the document is wrong and the fix is to the document. The Status line says which.
7. When every P1 and P2 item for a document has passed or been filed, change its row in the [coverage table](../README.md#coverage) from `drafted` to `verified`.

## Devices and conditions

- **desktop** — a window at 1440px or wider, where the navigation is the rail.
- **phone** — 390px, where the navigation is the pill. 320px is the narrowest layout the suite covers.
- **keyboard** — traversal, focus return, and Enter/Escape behaviour. Several claims are keyboard-only, including the approval card's focus rule.
- **reduced motion** — the OS or browser setting, not a query parameter. Claims about transitions being removed need this.
- **offline** — pulling the network, not only a devtools toggle: a toggle does not always fail an in-flight socket the way losing the connection does, and several claims here are specifically about an in-flight run.
- **second tab** — the same account in a second tab of the same browser. Needed for every "appears on every tab" claim.
- **second device** — genuinely a second device, not a second tab. A few claims distinguish them.
- **live credentials** — an environment where `/health` reports the relevant integration live. Required for anything about money, provenance, or a real service.
- **a connected agent** — an MCP client actually connected through consent, for the agent-surface items. A token created in the interface is not the same condition as a client that went through the consent screen.

## Driving the product from a script

The Playwright suite in `e2e/` is the closest thing to an automated pass, and it is not one. It runs against **explicit local stubs**, pinned to a stub identity, on its own ports — so it proves the interface behaves, and proves nothing about settlement.

Where an item's expected result is a state rather than something visible, the suite's own helpers (`e2e/mandate.ts` lowers the approval threshold, for example) are a reasonable way to set up a scene. Use them to arrange and observe, not to stand in for the interaction the item is about.

A scripted pass can check what was rendered, what was announced, focus position, exit codes and stored state. It cannot check how long something took to appear, whether motion felt right, or whether a payment happened.

## Results so far

**No pass has been run.** Every Result column is `—`, and no document is marked `verified` in the coverage table.

The documents were drafted from the code and the tests at commit `5caed50`. Everything in them that was not confirmed by hand is listed in that document's "Open questions and verification" section, and those questions are where a first pass should start: they are the claims the author was least sure of.
