# Icons

**Reuse a licensed family for ordinary controls; custom-draw only what is Froggy's.** The repository already wires `lucide` through both `components.json` files, so that is the family. Nothing here proposes replacing it.

## Rules

- 24px default, 20px in dense rows, 16px inline with text. One stroke weight — lucide's default 2 — at every size; never scale a 24px icon down and inherit a thinner stroke.
- Icons take `currentColor`. No icon carries meaning on its own: every one either sits beside a label or has an accessible name.
- An icon is never the only indicator of state. Status reads without colour and without the icon.

## Mapped from lucide

| Meaning | Icon | Where |
| --- | --- | --- |
| Home | `home` | primary nav |
| Explore | `compass` | primary nav |
| Wallet | `wallet` | primary nav |
| Notifications | `bell` | secondary |
| Account | `circle-user` | secondary |
| Composer send | `arrow-up` | composer |
| Open task | `arrow-right` | task card |
| View browser | `monitor` | browser affordance |
| Take control | `hand` | browser affordance |
| Stop | `square` | stop control — a filled square, never a skull or a cross |
| Approve | `check` | approval |
| Reject | `x` | approval |
| Receipt | `receipt` | wallet history |
| Watching | `eye` | findings |
| Stop watching | `eye-off` | findings |
| Scheduled | `clock` | background work |
| Paused | `pause` | background work |
| Source link | `external-link` | evidence |
| Copy | `copy` | addresses, references |
| Risk / caution | `triangle-alert` | risk findings — never on an uncertain payment |
| Connections | `plug` | external assistants |
| Telegram | `send` | connections |

`triangle-alert` is deliberately absent from the uncertain-payment state. Uncertain is not an error, and an alert triangle would say it is.

## Custom, because lucide has no honest equivalent

| File | Meaning | Why custom |
| --- | --- | --- |
| `icons/leash.svg` | The spending policy — what the agent may spend, and the cap it cannot raise | Froggy's central idea. `lock` implies nothing can happen; `shield` implies protection from an attacker. Neither is a leash: a leash permits movement up to a length. |
| `icons/stubbed.svg` | This came from a stub; nothing real happened | Must be unmistakable and must not read as an error, a warning, or a success. Nothing in a general icon set means "this was simulated". |

Both are drawn on lucide's 24×24 grid at stroke 2 with round caps and joins, so they sit in a row with the mapped set without looking imported.
