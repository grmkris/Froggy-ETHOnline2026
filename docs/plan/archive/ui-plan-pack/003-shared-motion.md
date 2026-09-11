# 003 — Establish restrained shared motion

- **Status**: Implemented locally; verification and release limits in [the implementation record](IMPLEMENTATION.md)
- **Baseline commit**: `a587f55` (problem snippets below describe the pre-change code)
- **Severity**: MEDIUM
- **Category**: Accessibility, easing, transition scope and cohesion
- **Estimated scope**: 7 shared UI files; focused browser verification

## Problem

`apps/web/src/main.tsx:26` already sets `MotionConfig reducedMotion="user"`, but active shared controls animate through CSS independently.

```text
packages/ui/src/components/sheet.tsx:54 — current class fragments
transition duration-200 ease-in-out
data-[side=right]:data-ending-style:translate-x-[2.5rem]
data-[side=right]:data-starting-style:translate-x-[2.5rem]

packages/ui/src/components/message-scroller.tsx:111 — current class fragments
transition-[translate,scale,opacity] duration-200
data-[active=false]:duration-400
data-[active=false]:ease-[cubic-bezier(0.7,0,0.84,0)]

packages/ui/src/components/alert-dialog.tsx:55 — current class fragments
data-open:animate-in data-open:zoom-in-95
data-closed:animate-out data-closed:zoom-out-95
```

The sheet, Delete dialog and jump control have no reduced-motion branch. Button, TabsTrigger, Badge and ProgressIndicator use `transition-all`. The installed progress indicator writes width, so broad transitions also animate financial progress. This is a scope/clarity issue; no dropped frames were measured.

## Target

A small shared vocabulary in `packages/ui/src/styles/globals.css`, extending its current theme structure:

```css
/* Target shared variables; define each once. */
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
--motion-feedback: 125ms;
--motion-panel: 200ms;
--motion-sheet: 250ms;
```

Add `--ease-in-out: cubic-bezier(0.77,0,0.175,1)` only if a real in-place movement caller needs it; do not introduce an unused token for completeness.

| Surface | Exact target | Reduced motion |
| --- | --- | --- |
| Sheet popup | Existing 2.5rem travel on its side axis, opacity 0→1; `translate` and `opacity` only; 250ms `cubic-bezier(0.32,0.72,0,1)` in both directions | No animated translation; opacity only, 200ms `cubic-bezier(0.23,1,0.32,1)` |
| Sheet overlay | Opacity 0→1, 200ms ease-out above | Same opacity feedback |
| Delete dialog popup | Scale .97→1 and opacity 0→1, 200ms ease-out; reverse toward .97/0; centered origin | Scale fixed at 1; 200ms opacity only; preserve static centering translation |
| Delete overlay | 200ms opacity ease-out | Same |
| Jump to latest control | Opacity 0↔1, 125ms ease-out; keep fixed position and inactive pointer-events | Same; jump action itself is immediate |
| Shared Button | Named background-color/color/border-color transitions only, 125ms `ease` for ordinary hover; active/focus-visible feedback immediate; remove active 1px translation | Same immediate press/focus, no movement |
| TabsTrigger | Instant selection and focus; optional 125ms `ease` hover color only | Same |
| Badge | Remove transition-all; static unless an existing interactive use actually needs 125ms `ease` color feedback | Same |
| ProgressIndicator | Width/value update immediately; no transition-all or width tween | Same |

Tailwind 4 individual `translate` and `scale` properties are distinct from `transform`: name the actual properties used. Never reset every transform/translate globally; that would break centered overlays and RTL alignment.

## Repo conventions to follow

- Inspect `packages/ui/components.json`: existing shadcn base-nova primitives, Base UI state attributes, semantic tokens and `cn` class composition.
- `sheet.tsx` already uses `data-starting-style`/`data-ending-style` transitions. Apply that approach to the active AlertDialog rather than retaining restartable entry/exit keyframes. Installed AlertDialog re-exports DialogPopup and supports those attributes.
- `globals.css:642` shows scoped reduced-motion handling that retains readable feedback. Keep existing shimmer, driving ring and Streamdown behavior.
- ADR 0008 intentionally removes problematic scroller utilities and `content-visibility:auto`; this plan changes only the jump control's motion.

## Steps

1. Add the exact timing/easing variables above alongside the existing theme definitions. Check whether plan 002 already created the same values; reuse, do not duplicate. Keep the existing color/font tokens and no new stylesheet system.
2. In `sheet.tsx`, replace the generic transition and built-in easing with named translate/opacity transitions and the sheet token. Retain side placement and the 2.5rem entrance/exit travel. Scope reduced motion to this popup: starting/ending translate is zero while opacity remains. Overlay gets the target opacity timing. No swipe behavior, input lock, waiting timer or animation-end-driven dismissal.
3. In `alert-dialog.tsx`, replace open/closed keyframe animation utilities on popup/overlay with the supported starting/ending-state transitions. Popup's dynamic scale begins/ends at .97; its existing `-translate-x-1/2 -translate-y-1/2` remains untouched. Use only opacity under reduced motion. Keep default focus, escape, portal and confirmation semantics.
4. In `message-scroller.tsx`, remove active/inactive scale, vertical travel and 400ms accelerating exit classes from MessageScrollerButton. Keep its position, horizontal centering, RTL variant and directional arrow. Use 125ms opacity only. Inactive pointer-events stay off. Do not change Provider, Item or viewport behavior.
5. In `button.tsx`, remove transition-all and the active translation; retain all disabled, invalid and focus-visible states. Restrict normal transitions to named colors. Press feedback is immediate color, and focus rings appear immediately. Do not add JS modality tracking or a scale animation to every button.
6. In `tabs.tsx`, `badge.tsx` and `progress.tsx`, apply the table's narrower behavior. Tabs selection stays immediate for keyboard navigation. Financial progress updates directly. Plan 001 owns the duplicate ProgressTrack fix; do not introduce another track or override it here.
7. Inspect representative app callers: main wallet actions, details sheet, Delete dialog, spending meter and jump control. Unused generic Dialog/Tooltip/Switch are outside this plan; do not expand to a library-wide cleanup.

## Boundaries

- Run after plan 001 because both touch CSS/progress; coordinate with other agents editing those files.
- No component markup overhaul, gesture library, dependency upgrade, blanket reduced-motion reset, focus suppression or new toast stack.
- No hover movement. If future hover movement is introduced, gate it with `(hover: hover) and (pointer: fine)`.
- Retain all accessible labels and actual Base UI lifecycle behavior. Do not simulate transitions with a timer that delays action completion.
- Re-read source when the commit changed. Report a changed primitive contract rather than guessing from this plan.

## Verification

- **Mechanical:** `bun run check:fast`, `bun run check`, `bun run e2e`. Use the existing deterministic browser setup; no live destructive or payment actions.
- **Computed styles:** sheet uses translate/opacity with 250ms timing; jump control uses only 125ms opacity; progress has no width transition. Under reduced motion, sheet translate does not interpolate and dialog scale remains 1 while centering stays correct. Do not write brittle tests asserting the full Tailwind class string.
- **Interaction:** open/close/reopen the sheet quickly. It retargets from its visible position without ignoring a click. Open Delete and cancel; focus returns correctly. Tab/arrow navigation and press feedback are immediate. Scroll repeatedly across the jump-control threshold; it never performs a slow traveling exit.
- **Feel check:** compare normal playback and 10% in browser animation tools. Verify easing starts promptly, movement and opacity end together, and there are no accidental size changes. Toggle reduced motion live. On a physical phone, check sheet close, scroll and tap behavior; no gesture implementation is required.
- **Done when:** active primitives share the timings above, respect motion preferences and remain usable during transitions, with no changed payment or browser behavior.
