# Froggy landing concepts

Three public entry pages, one existing workspace and onboarding flow.

| Route | Direction | Promo |
| --- | --- | --- |
| `/landing` | Visual comparison of all three concepts | Links to each world |
| `/landing/pond` | Cream, forest green, illustrated pond-side desk | `pond-promo.mp4` |
| `/landing/playground` | Lime, bold type, outlined toolkit and stickers | `playground-promo.mp4` |
| `/landing/glasshouse` | Deep forest, luminous miniature greenhouse, translucent labels | `glasshouse-promo.mp4` |

The routes are explicitly public children of the root route. They sit outside `WorkspaceLayout`, so reading a landing page opens no workspace sockets and requests no private API data. All other routes retain the existing authentication gate.

The sign-in buttons use the existing identity bridge and dynamically loaded Privy integration. A completed sign-in started on a landing page enters `/` through the router; Home then decides whether to show `/welcome`. Home now starts its welcome redirect from a stable effect, allowing the lazy route to finish loading without restarting the pending transition. An already authenticated visitor can browse a concept and choose Open workspace. Local identity previews are labelled. The existing onboarding screens and spending authority are unchanged.

## Assets and films

Eleven illustrations were generated for this implementation: three hero scenes, five setup illustrations, and card-checkout, trading and watchlist illustrations. `originals/` retains source PNGs; optimized WebP deliveries and the prompt manifest live in `apps/web/public/froggy/landing/`.

Real app screenshots retain their demonstration labels. `e2e/landing-assets.spec.ts` reproduces the browser and watchlist captures against stub providers. The browser contains an explicitly synthetic merchant inside Froggy's real browser controls; no remote browser, real purchase, notification or trade is performed. The screen manifest records the source of each other capture. Art is illustrative; the page does not claim every integration is live in every deployment.

The three films are 20-second, silent, 1920×1080, 30fps HyperFrames compositions. They use local images, fonts and GSAP. Each project includes its own brief, storyboard, editable HTML, motion assertions and frozen assets. Playback on the landing starts only after a click, uses a poster, exposes pause/replay, and pauses when scrolled away. Reduced-motion visitors get static page art and the same explicit video controls.

## Working with HyperFrames

From this worktree:

```sh
cd design/landing/videos/pond
bun run dev
bun run check
bun run render
```

Use `playground` or `glasshouse` in place of `pond`. The scripts pin HyperFrames 0.8.36. Studio opens at the URL printed by `dev`; use its timeline to inspect individual frames. `index.html` contains six timed scene clips, with a paused GSAP timeline registered as `window.__timelines["froggy-pond"]` (or the corresponding concept). Change copy, layout or tween timings there, run the browser check, review snapshots, then render. Keep root duration and scene boundaries consistent. Do not introduce wall-clock animations or remote asset requests into a composition.

The HTML intentionally keeps each short film together for straightforward editing. HyperFrames emits a composition-size advisory; runtime, layout, contrast and motion checks must have no errors. The original registry `ui-3d-reveal` was inspected for perspective-reveal motion; its unrelated product assets were not used.

## Inspiration

The supplied [SVG shaders](https://github.com/shuding/svg-shaders) and [liquid glass](https://github.com/shuding/liquid-glass) informed the Glasshouse material direction. [ThreeUI](https://github.com/MengTo/threeui) and the supplied Three.js/WebGPU repositories informed the miniature-world treatment. The rendered hero artwork and light CSS motion deliver that direction without making a WebGPU renderer part of the sign-in path. Existing shadcn/Base UI controls provide the functional interface.

## Verification

Run `bun run check:fast`, `bun run check`, and `bun run e2e`. The landing tests cover responsive rendering, asset decoding, public-route isolation, protected-route gating, local entry, simulated Privy bridge states, cancelled/retried sign-in, onboarding handoff and video playback. Simulated identity tests validate the integration contract; they do not prove a live Privy account login.

See `VERIFICATION.md` for the completed run results and `NEXT.md` for the deferred onboarding and presentation work.
