# design-sync notes — @froggy/ui

Repo-specific gotchas for future syncs. Read this before re-running anything.

## Setup

- **Run every render check against a modern Chrome.** Set `DS_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` for `package-validate.mjs` and `package-capture.mjs`. Homebrew's `/opt/homebrew/bin/chromium` is **Chromium 108 (2022) and does not support `oklch()`** — and every colour in this design system is oklch, so under 108 every component renders with a transparent background and black text while radii, spacing and borders look fine. That failure mode is extremely convincing and cost a full debugging cycle: it looks exactly like "the tokens aren't wired up". If previews suddenly render colourless, check `CSS.supports('color','oklch(0.5 0.1 150)')` in the capture browser BEFORE touching the CSS pipeline.
- Playwright itself is installed into `.ds-sync/` with `--ignore-scripts` (no browser download); it drives the system Chrome via `DS_CHROMIUM_PATH`.
- `bun install --frozen-lockfile` uses **isolated** installs: deps live in `packages/ui/node_modules`, not the repo root. Pass `--node-modules packages/ui/node_modules` to the converter.

## The CSS pipeline (the non-obvious part)

- `packages/ui` ships **source, not a build** — no `dist/`, and its `package.json` `exports` map points straight at `./src/components/*.tsx`. The converter therefore runs in synth-entry mode (`[NO_DIST]`), which is expected here, not a failure.
- `packages/ui/src/styles/globals.css` is **Tailwind 4 source** (`@import "tailwindcss"`, `@theme inline`, ~40 `@utility` rules). Nothing in `packages/ui` compiles it — only `apps/web`'s `@tailwindcss/vite` does, at app build time. `cfg.cssEntry` must never point at `globals.css` itself or every preview ships unstyled.
- `.design-sync/build-css.sh` is the pre-converter step (`cfg.buildCmd`). It compiles `.design-sync/tailwind-entry.css` to `packages/ui/.ds-generated/ds-compiled.css` and copies the referenced font files next to it. Run it before `package-build.mjs`, always.
- Output must land **inside `packages/ui`**: `cfg.cssEntry` is bounded to the package dir by `package-build.mjs`.
- The Tailwind CLI does **not** rebase `url()` in the `@fontsource` `@font-face` rules it inlines — they stay `url(./files/<name>)`. The build script copies each referenced file into `packages/ui/.ds-generated/files/` so the converter's `extractFonts()` (which resolves relative to the compiled CSS) finds them. 30 files, 40 `@font-face` rules.
- Bun's isolated install creates **no workspace self-link**, so `@froggy/ui` is absent from every `node_modules` and `lib/dts.mjs` crashes reading its `package.json`. `build-css.sh` recreates `packages/ui/node_modules/@froggy/ui -> ../..` on every run; it is gitignored machine state, so a fresh clone needs it.

## Scope

- 30 source files export **113** PascalCase components — the compound-component parts (`CardHeader`, `DialogTitle`, `FieldLegend`, …). All 113 ship fully importable. Authored previews cover the ~30 top-level components; the parts keep the floor card, which is the intended baseline, not a failure.
- `globals.css` already carries its own `@source` globs (apps/**, ../**, and streamdown's dist). `.design-sync/tailwind-entry.css` adds the authored preview dir. Scanning `apps/web` is deliberate: it gives the design agent the class vocabulary the real product uses.

## Known render warns

These are triaged and benign. A warn that is **not** on this list is new — look at it before assuming it is noise.

- `[RENDER_THIN] Dialog / AlertDialog / Sheet: rendered height is 0px` — benign and expected. All three previews open the real overlay, which Base UI renders through a portal with `position: fixed`; the measured root therefore collapses to zero height even though the card is full. Confirmed visually: the screenshots are 24-32 KB and show the complete panel, backdrop, close button and footer. Do not "fix" these by reworking the previews.
- `[TOKENS_MISSING] --transform-origin, --sdm-tbg, --tw, --streamdown-caret` — non-blocking. `--tw*` is Tailwind's own runtime plumbing; `--transform-origin` is set at runtime by Base UI's positioner; the `--sdm-*` / `--streamdown-*` pair comes from `streamdown` classes picked up by the `apps/web` source scan. None are DS tokens and none need a `cfg.tokensPkg`.

## Re-sync risks

- **Browser drift.** The oklch trap above is the single most expensive thing to rediscover. Re-check the capture browser's version first, every time.
- **The CSS is a compiled snapshot.** `ds-compiled.css` only contains utilities Tailwind found in the scanned sources at build time. A class the design agent invents that nothing in `packages/ui` or `apps/web` uses will not exist in the shipped stylesheet. If designs come back missing styles for plausible-looking utilities, widen the `@source` globs or add `@source inline(...)` for the families worth safelisting.
- `@froggy/ui` has no build and no `.d.ts`, so props come from ts-morph reading `src/` directly. Renaming or moving `src/components/*.tsx` changes the component list silently.

## docsDir depth (easy to get wrong)

`cfg.docsDir` is resolved with `resolve(PKG_DIR, …)`, and **PKG_DIR is the symlink** `packages/ui/node_modules/@froggy/ui` that `build-css.sh` creates — not `packages/ui`. So the path to a repo-root directory needs **five** `../` segments: `../../../../../.design-sync/docs`. The obvious-looking `../../.design-sync/docs` silently resolves to `packages/ui/node_modules/.design-sync/docs`, no doc matches, and every component lands in the single `general` group. If the pane ever shows one flat group again, check this first. A wrong path is at least loud in the build log (`! docsDir: … not found — skipped`).

`.design-sync/docs/` holds one `<kebab-name>.md` per component: `category:` frontmatter sets the component's group in the pane, and the body becomes the first half of its `.prompt.md` (the generated `## Props` section is still appended, so a short body loses nothing).

## The repo's own hooks apply to these files

`lefthook` runs `oxfmt` and `oxlint` on commit, and `.design-sync/` is not exempt. Two consequences when authoring previews:

- **Filenames must stay `<ComponentName>.tsx`** — design-sync looks previews up by exact component name. `unicorn/filename-case` wants kebab-case and is turned off for `.design-sync/previews/*.tsx` in `oxlint.config.ts`. Do not "fix" the filenames; the cards would silently drop back to the placeholder.
- **The lint rules still judge the preview code.** Real errors caught here on the first run: an unused import, an export named `Shapes` (the anti-slop rule wants a domain name, not a structural one — it is now `TextLines`), and `render={<a href=… />}` anchors whose text comes from the parent at runtime, which `jsx-a11y` cannot see and which need an explicit `aria-label`. Run `bun run lint` before committing rather than discovering it in the hook.
- `oxfmt` reformats `conventions.md` and the previews on commit. Harmless, but it means the first commit after authoring leaves the generated README one formatting pass behind; the next sync's rebuild picks it up and re-uploads.

## Screens need a wider stylesheet than components do

`tailwind-entry.css` now carries an `@source inline(...)` safelist below the three globs, and it is there for screen design specifically.

The globs give the vocabulary the repo already writes, which is exactly enough for component cards — a preview reuses the classes its own component ships. A **screen** does not: page layout reaches for grid tracks, breakpoint-prefixed spacing and type steps that no current file happens to write, Tailwind emits only what it finds, and the screen comes back half-styled. That failure looks identical to the oklch trap above — plausible classes, no styling — so check the safelist before suspecting the token pipeline.

The families covered are the layout floor: grid and column tracks, gap/padding/margin/space, sizing and `max-w`, display/flex/position/overflow, type steps and treatment, `/5`–`/90` opacity on the semantic colours, radius and border. Bounded to the `sm:` / `md:` / `lg:` prefixes the app itself uses. Cost: the compiled sheet went 160K → 332K. Widen it further if a design comes back missing something plausible; do not widen it speculatively.

## The oxfmt drift is real, and it costs one re-upload

NOTES already predicted this and the 8 Sep re-sync confirmed it: the commit hook's `oxfmt` pass reformatted 10 preview files _after_ they had been uploaded, so the next sync saw 10 moved `sourceKeys` with no authored change behind them — `AlertDialogHeader, Badge, ChromeBar, Collapsible, DrivingRing, Message, MessageScroller, Switch, Textarea, Ticket`, of which 5 also moved their `renderHashes` (JSX reflow shifts text-node whitespace).

Benign, and it settles on its own. But it means **a re-sync run straight after the first commit of new previews will always show a batch of "changed" components that nobody changed.** Do not go looking for a regression. To avoid it entirely, run `bun run format` before the sync rather than after.
