# Froggy preproduction — start here

Preproduction workspace for Froggy's brand, assets, motion, screens and implementation handoff. Working brief: [`FROGGY_PREPRODUCTION_SPEC.md`](FROGGY_PREPRODUCTION_SPEC.md) (v1.0, 10 Sep 2026). This workspace is **not** authorization to rebuild the production app.

**Current phase: Gate C approved. A–C, E, F and H complete; D waiting on imagery.** Read [`STATUS.md`](STATUS.md) for the exact next action. A fresh agent can resume from these two files alone.

## Read in this order

| File | What it holds |
| --- | --- |
| [`STATUS.md`](STATUS.md) | Done, blocked, next action. The live one. |
| [`ENVIRONMENT.md`](ENVIRONMENT.md) | Hosts, the capability matrix, what was actually tested |
| [`INVENTORY.md`](INVENTORY.md) | Keep / rework / replace / missing across the checkout |
| [`TOOLCHAIN.md`](TOOLCHAIN.md) | The proposed smallest toolchain, costs, rollback |
| [`DECISIONS.md`](DECISIONS.md) | Settled choices. Do not reopen these. |
| [`SOURCES.md`](SOURCES.md) | Dated primary-source verification |
| [`GALLERY.html`](GALLERY.html) | **One index over everything.** Open this first. |
| [`handoff/README.md`](handoff/README.md) | The implementation package and ordered backlog |
| [`agents/RIVE_MAC_SETUP.md`](agents/RIVE_MAC_SETUP.md) | The Rive runbook for the Mac — kept, unexecuted |
| [`motion/MOTION_CONTRACT.md`](motion/MOTION_CONTRACT.md) | The five states and how real `TaskStatus` maps to them |
| [`references/`](references/) | The three supplied concept images + provenance |
| [`evidence/`](evidence/) | Test output and screenshots, per phase |

## Three things kept separate, everywhere in here

- **Desired product** — what the brief says Froggy should support.
- **Verified implementation** — what this checkout and tested tools actually do.
- **Prototype simulation** — fixture data used to evaluate design.

Nothing in a concept image proves a feature, a payment, a provider relationship or a live integration. Labels in these documents say which of the three a statement is.

## Workspace mapping (why this path)

The brief defaults to `design/preproduction/` in a dedicated worktree. This checkout is shared by several concurrent agents and the repository's own operating rules say to work on `main` and commit with explicit pathspecs rather than opening a bookkeeping branch, so this workspace lives on `main` at `design/preproduction/`. Two existing design surfaces are reused rather than duplicated — see `INVENTORY.md`:

- `.design-sync/` — the live design-system bridge for `@froggy/ui` (113 components).
- `docs/design/` — the earlier FABLE51 screens board and handoff.
