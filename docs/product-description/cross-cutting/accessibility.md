# Accessibility

## Summary

Froggy is a workspace where money moves without a person's hand on it, so the questions accessibility asks here are sharper than usual: can the person hear that a spend was refused when they were not looking at the corner it appeared in, and can they answer an approval without a mouse before it times out. This document is about how keyboard traversal, focus, landmarks, names and announcements behave on every surface — not about any one control.

The companion is [appearance and motion](appearance-and-motion.md), which owns the two looks and what reduced motion removes. The rule that joins the two documents: **no state is ever signalled by colour or motion alone.**

## Landmarks and headings

Every page in the workspace is built from the same frame: a banner across the top, one primary navigation, and one `main`. Each page contributes exactly one `h1`, which `e2e/screens.spec.ts` asserts at four widths on five pages.

The navigation is the interesting one. At 768 px and up it is a rail down the left; below that it is a pill at the bottom. **The two are never both present** — the one that is not in use is not rendered rather than hidden, because a `display: none` copy is still a second navigation to anything that reads the document instead of looking at it. Both carry the same accessible name, **Primary**, so the landmark a person tabs to is the same landmark at every width. The wordmark follows the same rule: the rail carries it above 768 px and the top bar carries it below, never both.

Regions inside a page are named where they are a thing rather than a layout: the wallet is a region named **Wallet**, the appearance choices are a group named **Appearance**, an approval ticket is labelled by the question it is asking.

There is no skip link. On the phone that costs nothing — the pill is at the end of the document — but on the rail every page begins with five links before the content. See [Open questions](#open-questions-and-verification).

## Names that carry state

A name is where state is put when the visual signal is a colour or a dot.

- A destination with approvals waiting is named **"Home, 1 approval waiting"** rather than "Home". The count is in the name, not only in the badge, because "Home" and "Home, 1 approval waiting" are different places to a screen reader and the same place to a glance. The coloured dot on the phone is hidden from assistive technology outright, since the name already carries it.
- The shared browser's canvas is named for what the person can do with it: "The shared browser. Click to take the page." when it can be driven, and "The shared browser. Open Froggy on a desktop to drive it." when it cannot. The name changes with the capability rather than describing a picture.
- The appearance group's explanatory sentence is tied to the group, so a screen reader hears what the three words mean before it hears the three choices.
- The current destination is marked as the current page on the link, and Home owns the conversation routes, so a conversation reads as being on Home rather than nowhere.

## Keyboard traversal

Everything reachable by pointer is reachable by keyboard, and the focus ring is a 2 px ring offset from the control in both looks. Interactive targets clear 44 px; the pill's destinations clear 48.

| Key | Where | What it does |
| --- | --- | --- |
| Tab / Shift+Tab | Everywhere | Moves through the frame, then the page |
| Enter | The composer | Sends — unless an input method is mid-composition, in which case it confirms the composition and sends nothing |
| Shift+Enter | The composer | A line break |
| Escape | Any dialog | Closes it and returns focus to the control that opened it |
| Enter | The browser canvas | Hands the keyboard to the remote page |
| Space / Enter | The appearance segments | Chooses that look, with no motion |

The composer's Enter rule is written down with its reason: Enter while an input method is composing confirms the composition, and a person typing Japanese, Chinese or Korean must not have half a word sent for them.

The browser canvas is in the tab order **only when it can be driven**. When the person cannot drive it — a phone, or a disconnected socket — it is made inert and taken out of the tab order rather than left as a focusable rectangle that swallows keystrokes. The same treatment is applied to a card that is animating out: it is inert while it leaves, so focus cannot land on something on its way to not existing.

## Focus

Focus is moved in exactly two situations, and both are written to be conservative.

**When an approval arrives.** Focus moves to the ticket — but only if the person is not typing. If the active element is a text box, focus is left alone, because a card arriving must not take the keyboard away from a half-written message. When focus does move, it lands on **Deny**, not on the primary yes. The primary yes sits last in the row, furthest from a stray click and furthest from a stray Enter; the answer a keypress away is the safe one.

**When a page changes.** The services page moves focus to its heading on arrival. Other pages do not, which is an inconsistency rather than a decision; see [Open questions](#open-questions-and-verification).

Dialogs trap focus while open and return it to the opener on Escape, which `e2e/motion.spec.ts` checks with reduced motion on.

## Announcements

There is **one live region per page**, visually nothing, assertive, and fed a sentence derived from state rather than a queue of things that happened. Deriving it is the point: what matters is whatever is true now, so nothing is said twice and nothing stale is said at all.

It has a precedence order:

1. An approval waiting on the person: "Your call: {the question}".
2. Otherwise, a refusal that landed while the person was watching: "Refused: {the sentence}".
3. Otherwise, nothing.

A question outranks a fact. A receipt filed before the page loaded is not an event the person watched, so it is never announced on arrival at a page.

Everything else uses roles rather than that region. The streaming answer is a `log` marked busy while a turn is in flight, so a screen reader defers its announcements until the answer has settled instead of reading a sentence three words at a time. The "Thinking…" marker deliberately has no role, because a status role would announce every turn. Failures are alerts — a refused card, a form error, the unconfirmed state of a stop, which announces itself and offers **Retry stopping**. Successes are not: a copied address, a saved setting and "Stop requested" are quiet status output that a screen reader reaches when it gets there.

## Variants

| Variant | Set before asking | Changed while it runs |
| --- | --- | --- |
| Who is asking | Only a person has an interface. An agent over MCP, Telegram and a schedule have no focus, no landmarks and nothing to announce. | No effect. |
| The policy in force | No effect on traversal. A refusal by [the leash](../foundations/the-leash.md) is announced whatever the rule was. | A refusal mid-run replaces whatever the live region was saying, unless an approval is waiting. |
| Funds available | No effect. | Running out produces a refusal, which is announced like any other. |
| What is being asked for | Decides what is on the page to traverse: a browsing turn adds a canvas to the tab order. | The canvas enters and leaves the tab order as the browser opens and closes. |
| The asking agent's grant | No effect. | No effect. |
| The shared browser | Whether the canvas is focusable, and what its name says. | Taking the page changes both. |
| Appearance and motion | Reduced motion and keyboard input both remove animation; neither changes the tab order, the names or the announcements. | A look changed mid-run does not move focus. |

## Cancel and interrupt

| Event | Focus and announcements | What is left |
| --- | --- | --- |
| Stop — the person halts this run | "Stop requested" is quiet output; "Stopping is unconfirmed" is an alert with a **Retry stopping** button in the tab order. | Focus stays where it was. |
| Freeze — the wallet is frozen, mid-run | The refusals that follow are announced one at a time, the newest winning. | Nothing is moved. |
| Denying a waiting approval, or leaving it unanswered | The ticket leaves and the live region falls back to the next thing true. Focus is not moved after the card goes. | Focus can be left on a control that no longer exists; the browser returns it to the document. |
| Asking something else while this request is still in flight | The composer keeps focus. The superseded turn announces nothing. | The log stays busy. |
| Leaving the page, or switching to another conversation, mid-run | The live region is per page, so it starts empty on the new one. | An approval still waiting is announced again on arrival. |
| Reload; the tab or the app closed | Nothing is announced for anything that happened before the load. | Focus starts at the document. |
| Network lost; the socket drops | Nothing announces the loss. The badge is visual only. | The composer becomes disabled with its reason as its placeholder. |
| The model, a service, or the facilitator errors or rate-limits mid-run | The failed card is an alert. | Focus is not moved. |
| The session expires, or the person signs out | The sign-in gate has its own alert for a failure. | The workspace frame is gone entirely. |
| The policy or a cap changes mid-run | Not announced. A change made in the editor is a quiet save. | No effect. |
| Funds run out mid-run | Announced as a refusal, with the sentence the code carries. | No effect. |
| The person takes control of the shared browser mid-run | The arbitration badge is a polite live region, so the change is spoken without interrupting. | Focus follows the click into the canvas. |
| The same account open in a second tab or on a second device | Each tab announces for itself. An approval waiting is announced in both. | Answering in one clears the ticket in both. |

## Interactions with other systems

**The leash.** Every refusal reaches the live region, so a person not looking at the wallet still hears it. See [the leash everywhere](the-leash-everywhere.md).

**Money and receipts.** Amounts are set in a display face with tabular figures so columns line up, and the plain value is what assistive technology is given even while the digits are morphing.

**Approvals.** The one place focus is taken, the one entrance with a different shape, and the one thing that outranks everything in the live region. See [approvals](../workspace/conversation/approvals.md).

**Provenance.** A transaction id is rendered in the machine face, wrapped rather than truncated, so it can be read and selected in full.

**History and persistence.** Nothing about accessibility is stored. The reduced-motion preference is the system's, not the account's.

**The shared browser.** The remote page's own accessibility is not Froggy's: what is cast is a picture. Froggy owns the canvas's name, its place in the tab order, and the fact that Enter hands the keyboard over. See [the shared browser](../foundations/the-shared-browser.md).

**Connected agents and grants.** The consent screen is a plain page with its own errors as alerts, reachable without the workspace frame. See [identity and agents](../foundations/identity-and-agents.md).

**Notifications.** The waiting count is in an accessible name; the dot beside it is hidden. That is the whole of it — there is no sound and no system notification.

**Navigation and URL state.** One primary landmark at every width, current-page marking on every link, and the conversation counted as Home. See [navigation](../foundations/navigation.md).

**Appearance, motion and accessibility.** See [appearance and motion](appearance-and-motion.md): keyboard input removes animation on its own, before any preference is consulted.

**Offline and reconnection.** The loss of the socket is not announced, only badged. See [offline and reconnection](offline-and-reconnection.md).

**Stubs.** The stub markers are words — "fixture", "Simulated", "local identity" — in the text, so they are read out. The one exception is the top bar's count, whose list of which integrations are stubbed is a hover title. See [stubs](stubs.md).

## Edge cases

- The live region is assertive rather than polite, so a refusal interrupts whatever is being read. That is the right choice for a refusal and a debatable one for the rest.
- Answering an approval leaves focus on a button that is about to be removed; nothing catches it afterwards.
- The streaming log is marked busy for the whole turn, so a person using a screen reader hears the answer only when it has finished — deliberate, and it means they wait longer than a sighted person for the same words.
- The browser canvas takes Enter to hand the keyboard to the remote page, which means Enter does two different things depending on where focus is.
- A `title` attribute is used for the stub list and is unreachable by keyboard and by touch.
- The composer's disabled reason is its placeholder, which some screen readers do not announce for a disabled control at all.

## Open questions and verification

- **There is no skip link anywhere in the workspace.** On the rail, every page begins with five navigation links. Worth treating as a defect.
- Only the services page moves focus to its heading on arrival. Whether that is deliberate for that page or missing from the others was not established.
- No specification in `e2e/` runs an accessibility audit. Landmarks, heading count and focus return are asserted individually in `screens.spec.ts`, `motion.spec.ts` and `themes.spec.ts`; contrast, name quality and reading order are not checked anywhere.
- Whether the announcement order — a waiting approval always outranking a fresh refusal — is right when several approvals are open was not established; the region names the most recent one.
- Whether a screen reader actually defers on the busy log, and for how long, has not been watched. This is the claim in this document most likely to be wrong in practice.
- Contrast ratios for the amber stub role and the lime accent against both backgrounds were not computed.
- Nothing here was tested with an actual screen reader.

Verified against the Froggy tree at commit `5caed50`.
