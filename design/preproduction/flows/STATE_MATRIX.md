# State matrix

Every surface answers all twelve. A state with no design is the one a person will hit.

Legend — **Mascot**: the motion state from `motion/MOTION_CONTRACT.md`. **Stop**: is a stop/cancel control present. It is present in every row where work exists, and it is never disabled or delayed for an animation.

| State | What the person sees | Mascot | Action offered | Stop |
| --- | --- | --- | --- | --- |
| Empty | What will appear here, and the one action that fills it | `idle` | the filling action | n/a |
| Loading | Indeterminate indicator plus an honest stage label. **No invented percentage.** | `working` | — | yes |
| Partial result | What is known so far, marked as partial, with what is still outstanding | `working` | use what's here | yes |
| No result | Why nothing matched and what to change | `idle` | change constraints | n/a |
| Provider unavailable | Which source failed, that the task is paused, that nothing was lost | `stopped` | retry | yes |
| Auth expired | Which connection expired; nothing attempted since | `needs-user` | reconnect | yes |
| Blocked | The site refused automated access | `needs-user` | take control | yes |
| Needs user | The decision, the amount, the payee, the expiry | `needs-user` | approve / reject | yes |
| Rejected | Recorded, nothing paid, task state after rejection | `idle` | reopen / close | n/a |
| Cancelled | Who cancelled and when; nothing submitted | `stopped` | start again | n/a |
| Failed | What failed, that nothing was paid, what to do | `stopped` | retry / abandon | n/a |
| Completed | The outcome and its receipt | `success` → `idle` | open receipt | n/a |

## Settlement is its own axis

Task completion is **not** purchase settlement. A task can be `done` while a payment is still reconciling. If the two disagree, the receipt wins and the interface shows the payment's state.

| Settlement | Styled as | Offers |
| --- | --- | --- |
| Confirmed | success, with a reference | receipt |
| Pending | **neutral, not an error** | check again |
| Uncertain | **neutral, not an error** | check again, contact merchant — **never a second debit, never a rail switch** |
| Failed | error, with "nothing was paid" | retry |
| Stubbed | marked `stubbed`, unmistakable | nothing to pay |
| Reauthorization needed | needs-user, prior approval void | approve the new amount |

Reauthorization is required whenever a material detail changes: amount, payee, item, size, delivery, or payment method. The old approval is never reused.

## Background work

Never imply continuous monitoring when it is scheduled.

| State | Copy shape | Controls |
| --- | --- | --- |
| Scheduled | "Checked twice a day until 20 Sep" | pause, stop |
| Checked recently | "Last checked 4 min ago" | pause, stop |
| Stale | "Last checked 3 days ago" — flagged, not hidden | resume, stop |
| Expired | "This watch ended on 20 Sep" | restart, dismiss |
| Paused | "Paused. It will not resume on its own." | resume, stop |

Closing the app does not cancel an authorized background task. Cancelling the task does. Closing the browser view does not stop the task either — only Stop does.

## Delegated work

| State | Requirement |
| --- | --- |
| External assistant asked | The task names the assistant and the allowance granted |
| Allowance partly spent | Remaining shown, never only the total |
| Allowance exhausted | Work stops and asks; **no tool raises its own cap** |
| Consent revoked | In-flight work stops; already-spent is still shown |

## Accessibility, in every row

Status readable without colour · focus visible on every control · text enlarges without clipping · reduced motion keeps each state a distinct static pose · essential labels live in accessible UI, outside the decorative canvas · the canvas is `aria-hidden`.
