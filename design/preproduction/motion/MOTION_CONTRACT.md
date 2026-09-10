# Motion contract

**Status: proposal, not yet approved.** Phase D2 deliverable, written before any editor is opened so the authoring session builds the contract the app will actually consume. It governs both routes: Rive on the Mac, and the SVG fallback if export stays blocked.

State names here are **proposed application states**, not Rive tool names and not existing Rive fields. The actual artboard, state-machine and view-model names get chosen after the Mac smoke test reports what the installed build's data binding really supports.

## The five states

| State | The mascot is | When |
| --- | --- | --- |
| `idle` | Resting, breathing, occasional blink | Nothing is running |
| `working` | Purposefully busy, looping | Work is in progress |
| `needs-user` | Attentive, turned toward the reader, looping but calmer | A decision is required |
| `success` | One brief celebration, then settles to `idle` | A confirmed completion |
| `stopped` | Still, neutral, not sad | Stopped, failed, or **outcome unknown** |

Five, not eight, and deliberately so: the mascot carries _mood_, and the precise state lives in text next to it. A frog cannot be trusted to tell the difference between "failed" and "we do not know yet", and the difference matters more than any animation.

## Mapping from the real domain

`packages/domain/src/task.ts` defines the actual union — **eight** states, not the brief's five:

```
quoted · paid · running · paused · awaiting_approval · done · failed · uncertain
```

| `TaskStatus` | Motion state | Note |
| --- | --- | --- |
| `quoted` | `needs-user` | A quote is a question. The person has not agreed yet. |
| `paid` | `working` | Money moved; the work has not finished. |
| `running` | `working` |  |
| `paused` | `idle` | Paused is calm, not broken. Nothing implies it resumed by itself. |
| `awaiting_approval` | `needs-user` |  |
| `done` | `success` → `idle` |  |
| `failed` | `stopped` |  |
| `uncertain` | **`stopped`** | See the rule below. This is the important row. |

### `uncertain` is not `failed` and never becomes `success`

The brief is explicit: a pending or uncertain payment is not a failed payment, and no blind second debit or rail switch is offered until the outcome is reconciled. So `uncertain` renders as `stopped` — **still, never a failure colour, never a celebration** — and the accompanying text says the outcome is not yet known and what happens next.

`stopped` is therefore a _neutral resting_ state, not a sad one. It has to be honest for "you stopped this", "this failed" and "we do not know" alike, with the words carrying the distinction. A dejected mascot would be lying in the third case, which is the case where a person is most likely to do something expensive out of anxiety.

### Success follows the confirmed domain event. Nothing else.

`success` is entered on a confirmed `done`. Not on a timer, not on an animation ending, not on request submission, not on an optimistic click. This is `C-11` in `DECISIONS.md` and it is not negotiable — an animation that celebrates before settlement teaches people to trust a picture over a receipt.

Separately: **task completion is not purchase settlement.** A task can be `done` while a payment is still reconciling. If the two ever disagree, the receipt wins and the mascot shows the payment's state, not the task's.

## Transitions

```
        ┌──────────────────────────── success ──┐
        │                                       ▼
idle ⇄ working ⇄ needs-user            (auto, once) ──▶ idle
  ▲        │           │
  └────────┴───────────┴──────────────▶ stopped ──▶ idle (on new work)
```

- Every state is reachable from every other state. A run can be stopped from anywhere.
- `success` is the only non-looping state: it plays **once** and settles into `idle`. It can be interrupted by new work; it must never be re-entered without a new confirmed event.
- `working → needs-user` is the most common transition and gets the most care: it must read as "it wants you" within one glance, without a jump-scare.
- `stopped → idle` happens when new work starts, never on its own.

### Interruption and re-entry

Transitions are interruptible at any point. A state re-entered while already active does **not** restart from frame zero — a task that flickers between `running` and `awaiting_approval` must not produce a strobing mascot. Rapid transitions, re-entry, stopping mid-transition and load failure are all explicit test cases in `agents/RIVE_MAC_SETUP.md` step 6.

## Rules that outrank the animation

- **Stop and approval controls appear immediately.** Never delayed for an entrance, never removed during an exit. If a person wants to stop something, the animation is irrelevant.
- **Essential labels and interaction live in accessible UI, outside the decorative canvas.** The canvas is `aria-hidden`. Status is readable as text, and readable without colour.
- **Numbers stay still.** Balances, quotes, amounts, payees and identifiers are immediately readable and never animate, count up, or blur in. A number in motion is a number that cannot be checked.
- **No invented percentages.** Unknown progress gets an indeterminate indicator and an honest stage label. `working` says "working", not "73%".
- **Reduced motion** — `prefers-reduced-motion: reduce` collapses every loop to a static pose per state. State changes remain perceivable, as an instant swap plus the text change. The repo's `lib/motion.ts` and `useReducedMotion` already do this for UI motion; the branded canvas must match, and the review harness reads it back from the document.
- **Offscreen and inactive** — every continuous loop pauses when offscreen or when the tab is hidden. An `IntersectionObserver` and `visibilitychange` gate, not a permanently spinning canvas. `idle` and `working` are the two that will otherwise run forever.
- **Static fallback** — if the runtime asset fails to load, a still SVG pose renders in its place and the interface loses nothing but decoration. Tested by blocking the asset, not assumed.
- **Most of the interface stays still.** One focal animation per screen at most.

## Sizes to test

Compact **24 px** and **32 px**; large **64 px** and **128 px**; on cream, on white cards, and on the dark ground. At 24 px the mask must still read as a frog and the states must still be distinguishable — this is where an accessory like sunglasses stops being character and starts being an obstruction, so the compact mark is a separate, simpler asset from the full-body illustration.

## Budgets

Deliberately unset. The brief is right that a budget invented before a baseline is theatre. Once one real asset exists, netcup measures file size and actual rendering behaviour and _then_ a budget gets written here. No frame rate will be claimed from visual impression.

## What the app needs from the asset

A single semantic entry point — one input carrying the state name, plus theme, size and reduced-motion flags. The app maps `TaskStatus` to a state name using the table above and sets one value. It does not drive keyframes, does not know about artboards, and never calls a "play celebration" function directly, because that is how a celebration escapes its domain event.
