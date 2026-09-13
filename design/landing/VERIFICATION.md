# Verification — 13 September 2026

Implementation branch: `codex/landing-concepts`, based on `56d9e6a`. Built in the isolated `/tmp/froggy-landing` worktree while the shared checkout was being reconciled.

| Check | Result |
| --- | --- |
| `bun run check:fast` | Passed: format, lint and TypeScript |
| `bun run check` | Passed: format, type-aware lint, TypeScript, dependency graph, agent files, names, tests and Knip |
| `VITE_PRIVY_APP_ID='' bun run --cwd apps/web build` | Passed; existing large-chunk advisory remains |
| Landing Playwright suite | 17 passed, covering three responsive widths, private-route isolation, sign-in bridge states, onboarding handoff and all three promo players |
| Full Playwright suite, two workers | 221 passed; one Enso deposit test timed out while locating its receive-token field |
| Isolated rerun of that Enso deposit test | Passed in 11.9 seconds; no trading source or test changes made |
| Actual browser capture fixture | Passed with stub providers; captured real Froggy controls and a labelled synthetic merchant |
| Live preview review | All three pages: zero console/page errors; images decoded; films played, sought and paused; no horizontal overflow at 390px |
| HyperFrames checks, all three films | Passed; zero runtime, layout, motion or contrast findings. One non-blocking composition-size advisory per film |
| Encoded film inspection | All three: H.264/yuv420p, 1920×1080, 30fps, 600 frames, 20.000 seconds, no audio stream |

The full browser suite did not pass in a single run; the isolated rerun above records the timeout transparently. All checks use local/stub integrations. No live account login, spending, trading, messaging or production deployment was performed.

## Review surfaces

- Landing comparison: `http://localhost:3210/landing`
- Pond: `http://localhost:3210/landing/pond`
- Playground: `http://localhost:3210/landing/playground`
- Glasshouse: `http://localhost:3210/landing/glasshouse`
- HyperFrames Studio (Pond): `http://localhost:3220/#project/pond`

These are local preview processes, not deployed URLs. The preview API reports all external providers as stubbed.

Desktop, mobile, setup and player screenshots live beside this file. Each `*-promo-contact.png` shows six settled frames extracted from the actual MP4. Each film also has checked snapshots and motion assertions in its source directory; `video-checks.json` records the final audit summary.

## Regression fixes found during verification

Home previously rendered a fresh `Navigate` element while the lazy welcome route was pending. Its layout effect could repeatedly restart that transition for a newly authenticated visitor. The welcome redirect now runs from a stable effect; the existing setup-completion gate and screens are retained.

A video with `preload="none"` cannot wait for `loadeddata` before requesting its first playback: no load has been requested yet. The player now starts the media operation after the visitor activates Play and React attaches the source. Native play/pause/end events own the visible controls; scrolling away pauses the video.
