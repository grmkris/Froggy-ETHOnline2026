# Playground implementation · 13 September 2026

Baseline: `main`, `fbe650757b96a56daedd15032bb2255152c832c1`, origin `grmkris/Froggy-ETHOnline2026`. Existing server/domain/wallet edits and untracked original artwork belong to concurrent work and are preserved.

## Working brief

`froggy_landing_handoff/froggy-prompt.md` overrides the older handoff: preserve the approved hero and cream/forest/lime identity; defer product-app captures; use editable, explicitly illustrative previews; prioritize shopping, travel, tickets/games; keep eSIM a minor travel detail. Keep the existing `/landing` architecture, sign-in behavior, and private workspace. All preview state stays in the public page. No backend actions, credentials, purchases, messages, or authority changes. No branch, push, merge, or deployment.

## Claims and evidence

| Capability | Implementation reference | Evidence available | Permitted wording / missing evidence |
| --- | --- | --- | --- |
| Shared browser and takeover | `apps/web/src/routes/browser-page.tsx`, `docs/decisions/0016-paid-cloud-browser.md` | Source and existing browser tests | Shared Chrome, follow work, take over. No live provider verification in this task. |
| Integrated wallet | `docs/decisions/0024-browser-wallet-provider.md`, `0038-browser-signed-credit-purchases.md` | Source and decisions | Supported payments, explicit signing authority. No universal checkout claim. |
| Separate credits and funds | `apps/server/src/skill.ts`, existing money page | Source and protocol | Credits run work; separately funded wallet pays for supported operations. No invented prices or balances. |
| Inbox, reports and outbound review | `apps/server/src/email-tools.ts` | Document and draft tools, explicit human review requirement | Prepare reports and email drafts; review exact recipients/content/files before sending. No delivery guarantee. |
| Telegram | `apps/server/src/telegram/cards.ts`, `pairing.ts` | Pairing and notifications implementation | Link Telegram for conversations and updates; signing returns to Froggy. No Telegram wallet-signing claim. |
| Monitoring | `apps/server/src/monitoring.ts`, `monitoring-runner.ts`, `docs/decisions/0035-substreams-watchlist-alerts.md` | Source, existing monitoring tests | Saving and monitoring are distinct; watches require configuration. Exact shopping + wallet combinations remain example workflows, not verified automation. |
| Shopping, travel, tickets, gifts | Browser/tools primitives only | No end-to-end merchant verification | Compare, prepare, monitor; clearly labeled hypothetical requests/results. No purchase, booking or availability guarantee. |
| Existing agents | `apps/server/src/skill.ts`, `e2e/agent-docs.spec.ts` | Public deployment-aware instructions, scoped OAuth | Compatible MCP clients; sign in and approve access. Public copy links to `/skill.md`; no token creation. |
| Networks | `docs/decisions/0035-substreams-watchlist-alerts.md`, product handoff override | Product direction; source support varies by operation | Base and Robinhood Chain are intended mainnet direction; support varies. Robinhood Chain is not a brokerage connection. |

Runtime results, visuals, asset details and refresh instructions are recorded after verification below.

## Delivered page

The current public route is `/landing`; `/landing/playground` is an explicit public alias. `/` remains the private workspace. Work was performed directly on `main`; the parallel agent advanced the branch during implementation. No branches, merges or deployments were made. The operator subsequently authorized committing and pushing the landing work.

The page preserves the approved three-line hero and illustration. A four-step local report walkthrough replaces the old promo. One accessible tabbed showcase covers shopping, travel and tickets/games, with independently editable requests and fictional totals. Each example previews a match, explains the human review, and can return to a clearly local “keep watching” state. Browser/wallet, inbox and Telegram explain the shared context; smaller gift, order-follow-up and report examples complete the story. The connection section copies secret-free instructions using `window.location.origin`, with success/error feedback and the real `/skill.md` guide. Separate balances, three optional setup steps, six keyboard-accessible FAQs and working closing links finish the page.

Auth logic is retained in `controls.tsx`: viewing while signed in does not redirect, and a CTA starts the existing sign-in flow. Public examples use React state only. Landing tests assert zero private API requests and workspace sockets. No product screenshot or app-recording asset is rendered or requested; the old capture/video files are retained as historical material.

Changed implementation files: `apps/web/src/routes/landing-page.tsx`, `components/landing/controls.tsx`, new `components/landing/examples.tsx`, `lib/landing.ts`, `router.tsx`, and the scoped `.landing` portion of `packages/ui/src/styles/globals.css`. Static metadata lives in `apps/web/index.html` and the small Vite HTML transform; `turbo.json` includes `APP_ORIGIN` in the web build’s environment/cache key. No backend or authenticated workspace implementation was changed by this task.

## Artwork and production media

The existing approved hero is reused, with a new 720×480 responsive WebP and a 1200×800 JPEG social image. Three new scenes were actually generated using the built-in image tool: sneaker inspection, packing for a weekend, and tickets/games. New originals live in `design/landing/originals/`; only optimized responsive variants were added under `apps/web/public/froggy/landing/`.

[Asset manifest](../../apps/web/public/froggy/landing/manifest.json) records exact generation prompts, references, source dimensions, byte sizes and intended placements. The local-path image reader failed to initialize its filesystem sandbox, so inspected reference images were supplied through the tool’s recent-conversation image mechanism. No API/CLI generation fallback or new paid service was used. The new artwork has an opaque cream background; alpha transparency is not claimed. Existing untracked `public/froggy/landing/originals/` files belonging to the operator were preserved.

| Asset | Production dimensions | Production bytes | Smaller variant bytes |
| --- | --- | --- | --- |
| playground-hero | 1440 × 960 | 115,136 | 44,352 |
| watch-sneakers | 960 × 720 | 44,714 | 16,732 |
| weekend-trip | 960 × 720 | 53,510 | 19,804 |
| tickets-games | 960 × 720 | 39,108 | 15,224 |
| playground-social | 1200 × 800 | 126,104 | — |

Re-encode scene variants with the installed FFmpeg, using each retained source:

```sh
ffmpeg -i design/landing/originals/watch-sneakers.png -vf scale=960:720 -c:v libwebp -quality 82 -frames:v 1 /tmp/watch-sneakers.webp
ffmpeg -i design/landing/originals/watch-sneakers.png -vf scale=480:360 -c:v libwebp -quality 80 -frames:v 1 /tmp/watch-sneakers-480.webp
```

The hero is eager with high fetch priority; all images reserve dimensions and have alternative text. Scene images are lazy and use 480/960px sources. No video downloads or extra animation dependency were added. Button feedback is a 160ms transform transition; the local notification uses a 180ms opacity/6px entrance with the existing `--ease-out`. Hover motion is pointer-gated, reduced motion disables movement, and hero text is visible immediately.

## Future screenshot replacement points

The media modules have explicit `data-media-slot` attributes. Replace their interior without rebuilding their surrounding section or changing auth:

| Slot | Current media | Later replacement |
| --- | --- | --- |
| `request-to-result` | Editable four-step HTML example and report outline | Current task + browser capture, with truthful result/review state |
| `scenario-shopping`, `scenario-travel`, `scenario-tickets` | Generated scene + editable local review card | Verified workflow capture where available; retain illustrative labels for unverified parts |
| `inbox` | HTML draft example | Sanitized current inbox/draft capture |
| `telegram` | Illustrative HTML notification | Sanitized supported update capture |
| `connections` | HTML relationship diagram with SVG icons | Current consent/Connections UI beside or in place of the diagram |

Product screenshots are explicitly deferred, not a release prerequisite for this landing version. Do not promote a fixture into live purchase evidence. If video replaces a slot later, add intent loading, pause/replay/error handling, hidden-tab/offscreen pausing and text equivalents before restoring any play control.

## Visual verification and refresh

All three supplied boards were visually inspected. `00-approved-playground.png` and the existing hero controlled the identity; generated poster text and claims were not copied. The baseline is `verification/baseline-desktop.png`. Final full-page views are `verification/landing-{320,390,768,1024,1440}.png`; production hero captures are `verification/production-hero-{390,1440}.png`. Desktop/mobile close-ups cover `watch`, `possibilities`, `connect`, `money`, `travel`, and `tickets` in the same folder.

Visual iteration restored the exact three-line headline rhythm, kept the first mobile action before the artwork, tightened the 320px header, preserved generous whitespace, and checked every scenario’s artwork and editable values. All five widths have document width equal to viewport width. Actual screenshots were inspected; no console errors or broken image requests appeared on successful loads. Image-failure tests separately confirm that copy and CTAs remain usable. A Chromium full-page capture artifact involving an offscreen fixed skip link was resolved by scrolling to the top before captures; keyboard focus still exposes the real skip link normally.

Refresh public-page screenshots with the isolated test suite:

```sh
FROGGY_E2E_PORT=3190 bun run e2e e2e/landing.spec.ts --workers=2 --output=/tmp/froggy-landing-results
```

This boots stub services and tests only local flows. Full-page images are attached in the Playwright output. To refresh production views, build with the deployment’s actual public `APP_ORIGIN`, run the web preview, wait for fonts/image decoding, scroll to the top, and capture at the same widths. Capture the section identifiers above for close-ups; switch the tab before capturing a scenario.

## Metadata and performance limits

Title, description, favicon, Open Graph fields and social image are present in crawler-visible HTML. With `APP_ORIGIN` supplied at build time, canonical, `og:url` and the absolute social-image URL use that origin. The test build deliberately used `http://127.0.0.1:3188`; no production domain is guessed. When the origin is absent, canonical/`og:url` are omitted and the image path is relative. Production must build with its real origin.

The existing app is a client-rendered Vite SPA and has no prerender pipeline. The marketing body still requires JavaScript; this task did not introduce a second application or backend rendering. Static metadata is available without JavaScript. The existing router’s shared app bundle contributes to initial transfer even though no workspace queries or sockets open.

Measured in headless Chromium against a local Vite production preview, fresh browser contexts, no network/CPU throttling, one run at each width. These are observations, not a Lighthouse score or a production guarantee. [Raw metrics](verification/performance.json) include resource bytes, LCP, layout shift, primary-action position, metadata counts and error/request checks.

| Width  | LCP   | CLS    | Initial resource transfer | Hero CTA top |
| ------ | ----- | ------ | ------------------------- | ------------ |
| 1440px | 736ms | 0.0015 | 747,948 bytes             | 668px        |
| 390px  | 556ms | 0.0013 | 719,966 bytes             | 504px        |

The browser initially fetched the responsive hero and the nearby shopping scene; other scenes were loaded on selection. No video or old app screenshot was fetched. One description tag is present after React renders. See [verification results](verification/RESULTS.md) for command outcomes and unresolved repository-wide failures.
