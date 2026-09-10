# Mascot pose prompts — ready to paste

**This file is not an asset.** It is the input to the one step this host cannot do: there is no image-generation route here, so you generate and I verify. Agreed at Gate A (P-03), €0.

## How to run it

1. Paste **the anchor block** first, in a fresh conversation, with `brand/frog-mark.svg` attached or `evidence/phase-b/states/idle.png` as the reference image. Ask for the canonical reference first and approve it before any pose.
2. Then paste one pose prompt per generation. Keep the same conversation so the character stays consistent.
3. Save **full-resolution originals** into `brand/poses/` as `<pose>.png`. Do not crop, do not resize, do not flatten transparency.
4. Tell me they are there. I check format, real alpha, dimensions and checksums, record provenance and the model in `ASSET_MANIFEST.json`, and flag anything that came back with a checkerboard baked in instead of an actual alpha channel.

## Anchor block — paste this first, every session

> You are drawing a mascot for a product called Froggy. Match the attached reference exactly: a friendly, rounded, front-facing frog head-and-body in one silhouette, with two large eye domes rising above the head, a wide simple mouth, and no neck.
>
> Palette, and nothing outside it: body `#4f9e63`, shading `#3d7f4e`, pale jaw `#d3e9d6`, eye white `#fcfdfb`, pupil `#15201a`, mouth `#24402e`, and a lime accent `#b4e04a` used sparingly.
>
> Style: flat vector, clean even fills, no gradients, no outlines, no texture, no drop shadows, no 3D, no glossy highlights. Soft geometric shapes. The whole character reads clearly at 64 pixels.
>
> Background: fully transparent. Not white, not a checkerboard pattern drawn into the image — an actual alpha channel.
>
> Keep the same character in every image: same proportions, same eye size and spacing, same mouth width, same colours. Do not add clothing, hats, sunglasses, text, logos, coins, charts, currency symbols or crypto imagery of any kind. No text anywhere in the image.

## Canonical reference — generate and approve this first

> Draw the canonical reference: the frog centred, facing forward, calm and neutral, arms and legs relaxed and visible, full body. This is the master every other pose must match. Square canvas, character filling about 80% of the frame, transparent background.

## The six poses

Each is one generation. Same conversation, same character.

| # | Pose | Prompt |
| --- | --- | --- |
| 1 | **idle** | "The same frog at rest. Sitting, relaxed, eyes open and looking straight ahead, mouth a gentle closed smile. Nothing in its hands. Calm, not sleepy." |
| 2 | **research** | "The same frog looking closely at something small held in one hand — an unlabelled blank card. Head tilted slightly, eyes narrowed in concentration, mouth flat. Curious, not worried. No magnifying glass, no text or symbols on the card." |
| 3 | **browse** | "The same frog seen from behind and slightly to the side, one hand raised as if reaching toward something ahead of it. Nothing in front of it — leave that space empty. Occupied and purposeful." |
| 4 | **needs-user** | "The same frog turned to face the viewer directly, eyes wide and attentive, one hand raised in a small wave, mouth open slightly as if about to speak. Asking politely for attention. Not alarmed, not distressed." |
| 5 | **completion** | "The same frog mid-hop, both feet off the ground, arms up, eyes happy and squinting, mouth open in a wide smile with a small lime tongue visible. One or two simple lime sparkle shapes near it. Pleased, not manic." |
| 6 | **resting** | "The same frog sitting low and settled, eyes half-closed, mouth a small flat line, body slightly slumped. Quiet and still. Not sad, not asleep, not sick — the pose for work that has stopped or an outcome that is not yet known." |

## Why the odd constraints

- **No sunglasses, hats or accessories.** They obstruct at small sizes, and the brief allows them as an occasional expression only — never in a pose that becomes a status icon.
- **No coins, charts or currency symbols.** The mascot carries mood; numbers and money live in real UI text where they can be read and checked. A frog holding a coin is a financial claim in a picture.
- **No text in the image.** Text baked into reusable artwork cannot be translated, cannot be restyled, and cannot be corrected when it is wrong.
- **Resting must not read as sad.** It also covers "outcome not yet known", and a dejected mascot there would be lying at exactly the moment a person is most likely to do something expensive out of anxiety.
- **`research` holds a blank card, not a magnifying glass.** A magnifier reads as search; this pose means examining evidence. And a blank card can't accidentally assert a figure.

## After they come back

Poses are illustration. Small marks stay hand-drawn vector: `frog-mark.svg` remains the rig the motion contract drives, and nothing generated replaces it. **A PNG placed inside an SVG is not a vectorized character** and will not be recorded as one.
