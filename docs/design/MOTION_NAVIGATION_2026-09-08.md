# Motion and navigation review — 8 September 2026

Builds on Passbook and Lilypad. Motion uses the existing Motion 13 dependency, Base UI transitions and torph; no new animation library. The requested skills supplied the audit and implementation vocabulary. The owner explicitly authorized implementation after the audit.

## Opportunities and applied review

| Location | Before | After | Purpose / frequency |
| --- | --- | --- | --- |
| `apps/web/src/components/nav/app-frame.tsx` | Routes replace abruptly | 125ms opacity 0.4 → 1, cubic-bezier(0.23, 1, 0.32, 1); 0.8 → 1 with reduced motion; keyboard immediate | Continuity, tens/day; no exit wait or duplicate route |
| `apps/web/src/components/stream/stream.tsx`, `turn.tsx`, `components/chat/composer-stack.tsx` | New cards pop in, approvals only enter | Stable identities and AnimatePresence; 125ms fades, no position or size animation, no initial history replay; exiting actions inert | State indication, system updates |
| `packages/ui/src/components/dialog.tsx` | 100ms zoom keyframes restart on interruption | 200ms transition from scale 0.97 and opacity 0; 125ms exit; strong ease-out; keyboard immediate, reduced-motion fade | Spatial consistency, occasional |
| `apps/web/src/components/settings/appearance-settings.tsx` | Selection jumps between controls | 200ms ease-out transform on a separate indicator behind equal 44px targets; immediate with keyboard or reduced motion | Feedback, occasional |
| `apps/web/src/components/morph-text.tsx` | torph defaults to 400ms | 200ms strong ease-out, torph numbers and accessibility retained | State indication, occasional balance changes |
| `apps/web/src/components/stream/browse-card.tsx` | Moving shimmer and jumping status width | Status fades in a reserved cell; focus takes precedence over automatic folding | State indication, system updates |

## Existing-motion audit

| Severity | Category | Location | Finding | Resolution |
| --- | --- | --- | --- | --- |
| Medium | Duration | `components/morph-text.tsx` | Implicit 400ms library duration | Explicit 200ms |
| Medium | Interruption | `ui/components/dialog.tsx` | Entry and exit keyframes | Base UI starting/ending transitions |
| Medium | Accessibility | `ui/components/spinner.tsx`, `skeleton.tsx`, `tooltip.tsx` | Missing reduced-motion handling | Static loading affordances; fade-only tooltip; instant focus handoff |
| Medium | Performance / frequency | `ui/styles/globals.css`, `stream/markdown-text.tsx` | Repeated shadow breathing and animated incoming words | Static ownership ring and immediately readable words |
| Low | Cohesion | `ui/styles/globals.css` | Unused 420ms rise-in | Deleted |

Rejected: route slides and list reflow move reading material and targets; stagger delays access; keyboard-triggered movement adds latency; animated financial charts obscure values. The existing switch, sheet and confirmation transitions were kept and given consistent timing. Loading spinners/skeletons still indicate ongoing work until completion, and are static with reduced motion. No animated financial value is invented.

The leash meter is absent from the current application (spending-limit UI was removed in the previous iteration). This lane does not restore it or alter spending authority.

## Verification and remaining feel checks

The browser suite exercises real mounted components with explicit local stubs. New coverage checks fixed appearance targets and keyboard focus through dialogs. Review the resulting captures at phone and desktop widths in both themes; physical-device touch and a fresh-eye motion review remain useful follow-up checks.

Review verdict: **Approve** after restoring an explicit keyboard focus outline on the appearance controls; the initial unlayered shadow reset had hidden the inherited focus ring. Pure fades are deliberate exceptions to transform entrances because the owner requires stationary reading material and hit targets.

## Navigation decision and final browser evidence

One bottom-centred pill works at both phone and desktop widths: it keeps destinations in the same place, frees the desktop content column from the rail, and stays close to the composer. Chat, Wallet and Services are the primary links; More groups Agents and Settings in a Base UI popover installed through the shadcn CLI. Links remain native links, with router current-page semantics. The active secondary page is also named by More when closed. The popover is portalled into the same navigation landmark, restores focus, and closes on route change, outside press or Escape. Its 200ms origin-aware scale/fade exits in 125ms; keyboard is instant and reduced motion fades only.

Pill destinations do not slide, scale or stagger. All targets stay at least 44px; the frame reserves bottom space and safe-area clearance. The late-wallet-value test still passes without page movement, and the cross-route approval test confirms the run and waiting badge survive navigation.

Final browser result: **88/88 passed** with local stubs, including all original behavioral checks plus twelve new motion/navigation checks. Existing assertions changed only for three visible links instead of five and the extra More activation. Captures under `docs/evidence/motion-navigation-2026-09-08/` show both themes at 1440px and 390px, plus the open overflow panel. Desktop and phone captures were visually reviewed; physical-device gestures were not tested.
