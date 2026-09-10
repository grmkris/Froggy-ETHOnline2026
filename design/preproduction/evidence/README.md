# Evidence

Test output, per phase. A screenshot here is only ever evidence of what the accompanying `review.json` says was true when it was taken — it is not evidence of animation timing, and a still frame is never offered as proof of motion.

Large captures are not committed. `TOOLCHAIN.md` and `DECISIONS.md` D-09 explain why: the existing-board run below produced 18 MB of full-page PNGs, so the finding was kept and the pixels were discarded.

## phase-a

| Artifact | What it shows |
| --- | --- |
| `browser-probe.html` | The probe page: token-coloured card, a button, an infinite pulse with a `prefers-reduced-motion` branch, and a runtime `oklch()` support check. |
| `harness/review.json` | The passing browser-review loop across 1440/768/390/320 and reduced motion. Chromium 151.0.7922.34, `oklch` true everywhere, zero console errors, `running=1` normally and `running=0` under reduced motion. |
| `harness/*.png` | The captures behind that run. |
| `probe-*.png` | The first manual probe, before the harness was factored out. Kept because it is the capture that first established Chromium 151 and `oklch` support on this host. |
| `existing-board/review.json` | `docs/design/SCREENS_BOARD_FABLE51.html` reviewed with the same harness. Clean at 1440/768/390 with no console errors — and **horizontal scroll at 320 px**, the brief's narrow stress check finding a real defect in the prior direction. |

### How to reproduce any of it

```sh
node design/preproduction/tools/review-shot.mjs <url|file> <out-dir> [--click sel] [--video]
```

Exits non-zero if any viewport logged a console error, so it can gate a review rather than merely illustrate one. Each viewport gets its own browser context, so parallel workers never share a profile and none can reach a signed-in everyday browsing session.
