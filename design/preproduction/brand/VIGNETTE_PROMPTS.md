# Illustration vignettes — ready to paste

Five small illustrations, one per task kind. Same route as the poses: you generate, I verify and install.

## Why these have no frog in them

The brief is explicit — _"one focal illustration per major screen, not a mascot on every card"_ and _"avoid sticker walls"_. The mascot already appears in the Home greeting and as the status mark. If it also appeared in every empty state and section header, it would become wallpaper and stop carrying meaning.

So these are **object vignettes**: a small still life per task kind, in the same flat vector language as the mascot, sharing its palette. They go in empty states, Explore section headers, and task result bodies before results arrive. The frog stays the thing that has moods; these stay the things it works on.

## Anchor block — paste first, in the same conversation as the poses

> Now draw a set of small object illustrations in exactly the same style as the frog character: flat vector, clean even fills, no gradients, no outlines, no texture, no shadows, no 3D, no glossy highlights. Soft rounded geometric shapes.
>
> Palette, and nothing outside it: greens `#4f9e63` and `#3d7f4e`, pale `#d3e9d6`, off-white `#fcfdfb`, near-black `#15201a`, and lime `#b4e04a` as a small accent only.
>
> **No text, letters, numbers, logos, brand marks, currency symbols or charts anywhere in any image.** No frog and no characters — objects only.
>
> Background fully transparent — an actual alpha channel, not a checkerboard drawn into the picture. Square canvas. The objects should fill about 70% of the frame, centred, and stay readable at 96 pixels.

## The five

| # | Name | Prompt |
| --- | --- | --- |
| 1 | **shopping** | "A single running shoe seen from the side, next to a small stacked pair of folded shoeboxes. Simple shapes, no laces detail, no branding, no text on the boxes." |
| 2 | **travel** | "A small suitcase standing upright with a rounded handle, beside two simple paper luggage tags and a folded paper map. No writing on the tags or the map, no place names, no aeroplane." |
| 3 | **research** | "Three blank rounded cards fanned out in a small overlapping stack, with one lifted slightly above the others. Completely blank faces — no text, no lines, no charts, no numbers." |
| 4 | **services** | "Three simple rounded plug-in modules or cartridges of slightly different heights, standing in a row like books on a shelf. Blank faces, no labels, no ports, no wires." |
| 5 | **watch** | "A simple analogue clock face with only two hands and no numerals, resting beside a small closed envelope. No digits on the clock, nothing written on the envelope." |

## Why the odd constraints, again

- **Nothing written on anything.** Text baked into reusable artwork cannot be translated, restyled, or corrected when it is wrong — and a label in an illustration is a claim.
- **No charts and no currency symbols.** A chart in a decorative illustration implies data that does not exist. Numbers live in real UI text where they can be checked.
- **`research` is blank cards, not a magnifying glass or a document with lines.** A lens reads as search; blank cards read as evidence, and cannot accidentally assert a figure.
- **`watch` has no numerals.** A clock showing a specific time in a reusable asset is either wrong or meaningless, and the interface states the real cadence in words next to it.
- **`services` is deliberately abstract.** Any recognisable logo shape would imply a provider relationship that does not exist.

## Where each one lands

| Vignette | Used in |
| --- | --- |
| `shopping` | shopping task before results; Explore → services empty state |
| `travel` | travel task result body; itinerary empty state |
| `research` | token research before evidence arrives; Explore → tokens empty state |
| `services` | Explore → services header; Connections empty state |
| `watch` | background-work setup; "nothing needs you" quiet Home |

Save full-resolution originals into `brand/vignettes/` as `<name>.png`. I check alpha, dimensions and checksums, read the C2PA provenance out of each file, record them, and wire them into the empty states already drawn in `screens/families.html`.
