# Token proposal — the lime accent and the frog roles

**Status: proposal.** Nothing here is in `packages/ui/src/styles/globals.css` yet. Preproduction does not edit the app. Adding these is a Gate C decision.

## What already exists and stays

`globals.css` carries 252 custom properties and is already the brief's palette. Nothing below repaints it:

| Role           | Light                       | Dark      |
| -------------- | --------------------------- | --------- |
| `--background` | `#eff1ec` warm grey-cream   | `#0d120f` |
| `--card`       | `#fcfdfb`                   | `#171f19` |
| `--foreground` | `#15201a`                   | `#e9f0ea` |
| `--primary`    | `#2f7a4c` restrained forest | `#4fb87a` |
| `--brand-soft` | `#e2efe6`                   | `#16301f` |
| `--radius`     | `20px`                      | `22px`    |

## 1. The missing lime accent

The brief asks for "lively lime accents"; there is no lime token today and `--brand` merely aliases `--primary`. One new role, not a family:

```css
:root {
  --lime: #b4e04a;
  --lime-ink: #24400a; /* text/iconography placed on lime */
}
.dark {
  --lime: #c7ec63;
  --lime-ink: #16250a;
}
```

**Lime is an accent, never a text colour and never a surface.** `#b4e04a` against the `#eff1ec` ground is a low-contrast pairing, which is correct for a highlight and wrong for anything that must be read. Where lime carries meaning it always carries a label too.

Sanctioned uses, and the reason each one is on the list:

- the `needs-user` halo — lime is the "it wants you" colour, used in exactly one place so it keeps meaning something;
- the tongue in the `success` open mouth — one flash of personality, at the one moment the interface has something to celebrate;
- small decorative accents in illustrations.

Not sanctioned: success/failure semantics (that is `--primary` and `--destructive`), body text, large surfaces, or anything a colour-blind reader would have to distinguish by hue. Status must stay readable without colour.

## 2. Frog roles

The mark already uses `--eye`, `--pupil` and `--mouth`, which are generic names sitting in the global namespace for one component's benefit. Proposal: namespace them, and add the skin roles the rig needs.

```css
:root {
  --frog-skin: #4f9e63;
  --frog-skin-lo: #3d7f4e; /* nostrils, shading */
  --frog-belly: #d3e9d6; /* jaw shading, used at low opacity */
  --frog-eye: #fcfdfb;
  --frog-pupil: #15201a;
  --frog-mouth: #24402e;
  --frog-lime: var(--lime);
}
.dark {
  --frog-skin: #5cb473;
  --frog-skin-lo: #47935c;
  --frog-belly: #2b4634;
  --frog-eye: #f2f7f2;
  --frog-pupil: #0b140e;
  --frog-mouth: #0b140e;
}
```

Skin is deliberately lighter and livelier than `--primary`: the mascot is a character, and `#2f7a4c` on a cream card reads as a UI chrome colour rather than a frog. The forest green stays the interface's, the lighter green is the animal's.

`brand/frog-mark.svg` declares literal fallbacks for every one of these, so the file also renders correctly standalone, in an `<img>`, or in any context where the tokens are absent.

## 3. Migration note

`FrogMark` in `packages/ui/src/components/frog-mark.tsx` currently reads `--eye`, `--pupil` and `--mouth`. If these roles are adopted, that component is a three-line change and the old names can alias the new ones for one release. **Not done here** — it is app code, and this is preproduction.
