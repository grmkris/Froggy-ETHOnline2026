# Brand usage

Files in this directory. Sources, not exports — optimized exports are separate and are not made until a target needs them.

| File | Role | Notes |
| --- | --- | --- |
| `frog-mark.svg` | The mark, and the rig the motion contract drives | Token-driven, with literal fallbacks so it also renders standalone |
| `frog-mark-mono.svg` | One-ink mark, normal and reversed | **Must be inlined** — see below |
| `favicon.svg` | The 16px case | Literal colours, detail removed at source |
| `app-icon.svg` | Icon master, 1024 | No text inside the icon |

## The one trap worth writing down

`frog-mark-mono.svg` paints its ink with `currentColor`, so one file serves both normal and reversed use. **That inheritance only happens when the SVG is inline.** Through `<img src>` or a CSS `background-image`, an external SVG has no parent to inherit from and renders **black** — which looks like a broken asset and is not.

Inline it, or export a colour-specific copy for that one use. Both are fine; silently using it in an `<img>` and wondering why it is black is not.

Its eyes and mouth are **holes**, not strokes, subtracted by a mask with the pupils put back as ink islands. A stroke in the same ink as the silhouette is invisible, and the first version of this file was exactly that: a black blob with two ears.

## Sizes and what drops

The mark carries a `detail` class on the jaw shading, nostrils and any accent. Below about 40px those are **dropped, not scaled** — the silhouette and the eyes carry the identity. `favicon.svg` has them removed at source because a favicon has no stylesheet to drop them.

Tested at 16, 24, 32, 48, 64 and 128, on cream, on white and on ink.

## App icon

Artwork sits inside roughly a 78% safe area, so platform masking — squircle, circle, rounded square — cannot clip the eyes. No text inside the icon at any size.

Final native export sets are **not** produced here. Platform requirements change, and the brief says to check them at the time rather than bake a stale matrix into a repository.

## Wordmark

Set in Inter Tight 600 at −0.025em with the mark at cap height, as shown in `screens/review-board.html`. **Not outlined**, and not shipped as an SVG for that reason: outlining needs a font tool that is not on this host, and an SVG wordmark with live `<text>` silently falls back to whatever face the viewer has, which is the same failure as the emoji favicon. Outline it before any use where the font cannot be guaranteed.

Inter Tight and IBM Plex Mono are both OFL and already vendored as `@fontsource` packages. No proprietary font is redistributed.

## Do not

- Reproduce another project's frog, or mix borrowed frog geometries into this one.
- Put the mascot on every card. One focal illustration per major screen.
- Use sunglasses or any accessory in a small status mark — it stops being character and becomes an obstruction. Occasional expression only.
- Animate a number, or place the mascot where a number needs to be read.
- Use lime as text, as a surface, or as the only signal for a state.
