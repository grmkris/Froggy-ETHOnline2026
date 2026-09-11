# 004 — Keep live work and receipts readable

- **Status**: Implemented locally; verification and release limits in [the implementation record](IMPLEMENTATION.md)
- **Baseline commit**: `a587f55` (problem snippets below describe the pre-change code)
- **Severity**: HIGH for truthful Stop feedback; MEDIUM for motion
- **Category**: Purpose, frequency, accessibility and interaction correctness
- **Estimated scope**: 9–11 app/style files; existing stop/approval/browser tests

## Problem

```tsx
// apps/web/src/routes/workspace-page.tsx:354 — current
<motion.div
  animate={{ opacity: 1, scale: 1, y: 0 }}
  exit={{ opacity: 0, scale: 0.98, y: 8 }}
  initial={{ opacity: 0, scale: 0.98, y: 12 }}
  key={request.id}
  transition={SPRING}
>
```

The nested ApprovalTicket also has `className="rise-in"` at `components/cards/approval-ticket.tsx:72`. That CSS entrance lasts 420ms, so the approval is animated twice. BrowserStrip at `components/browser/browser-strip.tsx:38` replays the same keyframe whenever its scroll-dependent mount returns. Every ReceiptTicket also uses rise-in at `components/cards/receipt-ticket.tsx:226`, including history.

```ts
// apps/web/src/lib/scroll-to-live.ts:11 — current
?.scrollIntoView({ behavior: "smooth", block: "center" });
```

The DOM call ignores reduced motion. Frequent disclosure chevrons also animate rotation with no reduction branch.

```ts
// apps/web/src/routes/workspace-page.tsx:167 — current
await fetch("/api/chat/stop", {
  headers: token === null ? {} : { authorization: `Bearer ${token}` },
  method: "POST",
});
```

Stop ignores HTTP failure, reports network failure only in the console, and calls local `chat.stop()` independently at line 175. Local stream detachment does not prove server cancellation.

## Target

Readable amounts and controls appear immediately. One short opacity treatment is enough for an occasional approval. Ordinary stream/history/browser navigation should stay still.

| Interaction | Exact target |
| --- | --- |
| Approval arrival | One opacity 0→1 entrance, **200ms**, `cubic-bezier(0.23,1,0.32,1)`; no translate/scale; controls/focus active immediately |
| Approval resolution | Remove the resolved card immediately; no exit wait or clickable departing card |
| BrowserStrip visibility | Immediate appearance/removal at its existing fixed overlay location; no rise-in |
| Live browser card | No decorative transform or layout animation of the interactive canvas wrapper; preserve viewport observation and input behavior |
| Jump to page | `scrollIntoView({ behavior: "instant", block: "center" })`; same under reduced motion and keyboard activation |
| Historical/compact receipt | Static; no entrance replay |
| Fresh refusal label | Keep the static rotated stamp; opacity 0→.85 in **200ms** with `cubic-bezier(0.23,1,0.32,1)` only; no 1.8× scale; amount and controls do not animate |
| Disclosure chevron | Rotate to final state immediately; no transition-transform |
| Stop | Immediate request and pending feedback; no animation, confirmation delay, hold gesture or celebratory success |

Reduced motion keeps the same gentle opacity on the two status/approval effects. No animated position, rotation or scale remains in those cases. Preserve the existing driving ring and its preference handling: it has a documented ownership-indication purpose.

For Stop, use three explicit UI states: requesting, request acknowledged/no active run, or unconfirmed with Retry. `apps/server/src/router.ts:457` currently responds `{ stopped: boolean }`; `runs.ts:154` returns true when it signals an existing run, not when every in-flight effect has completed. Say **Stop requested** after true, **No active run** after false. Do not claim that an already-submitted payment was reversed. The current app protocol has no dedicated terminal run event; do not invent a confirmed-finished status from a local chat state.

## Repo conventions to follow

- Read `apps/web/AGENTS.md` and `.agents/skills/froggy-browser/SKILL.md`: frames never enter React state, human handoff is immediate, canvas uses a ring because border geometry shifts input mapping.
- Retain `.agents/skills/froggy-leash/SKILL.md` invariants: approvals stay human-owned; receipts preserve refusal reasons and settlement evidence.
- `main.tsx` already installs MotionConfig. Reuse Motion's opacity transition for the one approval wrapper; no new library.
- `NoticeList` and app `Notice` provide existing inline error presentation. Extend this pattern for Stop rather than introducing a global notification system.
- `money-card.tsx:34` already computes `fresh` for a newly arrived receipt. Keep history callers non-fresh. Do not add a global cache just to suppress a small opacity effect.

## Steps

1. **Pull this fix forward if useful:** in `workspace-page.tsx`, check Stop HTTP status and decode the existing response shape with Effect Schema. Render requesting/acknowledged/error feedback near the composer; retain a Retry action when cancellation is unconfirmed. Do not let local chat detachment remove that feedback or the retry path. Disable duplicate Stop requests only while one is pending. Local stream handling may remain separate, but `chat.status` must not be treated as proof of cancellation. The current Boolean response acknowledges signaling only; use the wording above.
2. Keep both keyboard `/stop` and pointer Stop routed through that same operation. Check `composer.tsx` so an unconfirmed cancellation has an accessible retry/control even if chat is no longer busy. Do not add an artificial timer, hold-to-confirm or animation dependency. If product work adds a terminal run event later, adopt its versioned decoded contract instead of inferring completion.
3. In `workspace-page.tsx`, remove the approval wrapper's translate/scale/spring and delayed exit. Use one Motion opacity entrance with `transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}`. Remove AnimatePresence if nothing else needs it. Remove `rise-in` from `approval-ticket.tsx`. Preserve its input-aware focus handling, countdown, server expiry and answer callback.
4. Remove `rise-in` from `browser-strip.tsx` and the keyboard-operated Elsewhere panel in `workspace-page.tsx`. Keep BrowserStrip's overlay positioning and painter attachment; do not move it into normal layout or delay its click handling.
5. Remove `layout` and decorative y/opacity entry from the interactive live browser wrapper in `workspace-page.tsx`. Preserve its viewport-enter/leave observation, or use the existing library's observation without animation. Keep browser split resize tracking direct; do not add smoothing. Remove SPRING only if it has no remaining caller. This is a restraint/geometry safeguard, not a claim that a click regression was measured.
6. Change `scroll-to-live.ts` to the immediate target above. Verify the installed TypeScript DOM type supports `behavior: "instant"`; if a changed baseline differs, use an equivalent explicit immediate DOM scroll and document it. Do not replace this with a global smooth-scroll CSS rule.
7. Remove unconditional `rise-in` from `receipt-ticket.tsx`. In `globals.css`, simplify stamp-in to opacity only, 200ms exact ease-out, preserving the static stamp rotation/color/opacity and existing reduced-motion fallback. Historical compact tickets remain still. Do not remove receipt facts or change the shared status mapping supplied by plan 001. Keep stub labels visible on every affected receipt.
8. Remove `transition-transform` from the rotating chevrons in `browse-card.tsx` (both occurrences), `reasoning.tsx` and `tool-card.tsx`. Keep the final open/closed rotation and accessible disclosure behavior. Do not animate accordion height or add a transition to keyboard-driven opening.
9. Extend existing Stop/approval/browser tests with a forced Stop HTTP failure and network rejection, a retry, and pending/acknowledgment behavior. Retain focus and expiry cases; update obsolete fixtures only where the test is about a surviving behavior. Verify new motion by browser behavior/computed styles rather than one test per CSS class.

## Boundaries

- Plans 001 and 003 supply wallet layout/status semantics and shared motion. Coordinate edits to `workspace-page.tsx` with 002.
- Do not rewrite server cancellation, wire messages, spending rules or browser arbitration in this visual pass. If fixing confirmed terminal state requires a new event, hand that bounded contract change to the server owner and keep UI wording honest meanwhile.
- No new dependencies, animation framework, canvas transform, springy splitter, simulated stop success or automatic payment retry.
- Do not remove the driving-ring ownership cue or Streamdown's existing reduced-motion behavior. Do not revisit ADR 0008's scroller exceptions.
- Reconcile source changes before applying snippets. Preserve other agents' work and report material contract differences.

## Verification

- **Mechanical:** `bun run check:fast`, `bun run check`, then `bun run e2e`. Find existing relevant cases with `rg -n 'stop|approval|pop.out' e2e` and extend them; do not duplicate a full harness. Pin external providers to stubs.
- **Stop:** force 500 and network rejection. The UI says stopping is unconfirmed and offers Retry even after local detachment. A later acknowledged request says Stop requested; no-active-run response says No active run. Keyboard and button use the same path. No response is interpreted as a refunded or reversed payment.
- **Approval:** arrival has only one opacity entrance, no amount movement; typing focus is preserved, appropriate non-typing focus is maintained; answer works immediately and expired/resolved cards cannot submit again.
- **Browser:** scroll around the live-card visibility threshold; strip appears without repeated rise. Jump is immediate with mouse, keyboard and reduced motion. Canvas clicks, human takeover, pop-out, split resize and frame painting still work; check page errors.
- **Feel check:** inspect at normal speed and 10% animation playback. Only approval/status opacity should interpolate; history and financial figures remain static. Observe an active streamed response while opening settings, and use a physical phone for the watch-only view. Do not report performance improvement without measurement.
- **Done when:** frequent interactions are immediate, approvals/receipts stay readable, motion preferences are respected and Stop feedback accurately describes the server response.
