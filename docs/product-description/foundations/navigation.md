# Navigation

## Summary

Froggy has three destinations and two places that are reachable without being destinations. This document owns where the person can be, what is in the URL, and what a page change does.

The shape follows one decision: **a destination per capability is how a workspace becomes a dashboard**, so most things are not destinations. Home is where work starts, resumes and reports back; Explore is where you look things up and act without writing a sentence first; Wallet is the money and who may spend it. Connections and Account sit at the foot, reachable and visibly not destinations.

## The simple case

At desktop width there is a rail down the left: the three destinations, then a gap, then Connections and Account demoted to the foot. On a phone the same three destinations sit in a pill at the bottom, one tap each, with nothing hidden behind a "More" — there is nothing left to hide once there are only three.

Choosing one slides the page in the direction of the move: forward for a destination further down the order, back for one above it. Home carries a count when approvals are waiting.

## What is a destination and what is not

| Place | Route | Why it is where it is |
| --- | --- | --- |
| Home | `/` | Where work starts, resumes and reports back. |
| Explore | `/explore` | Looking things up and acting without writing a sentence first. |
| Wallet | `/wallet` | The money, what may be spent, and by whom. |
| Connections | `/agents` | Reachable, at the foot. External assistants. |
| Account | `/settings` | Reachable, at the foot. |
| A conversation | `/chat`, `/chat/{id}` | **Not a destination.** A conversation is something a task has, so it travels from Home's slot. |
| The shared browser | `/browser` | **Not a destination.** A contextual view inside a task; closing it never stops the work. |
| Activity | `/activity` | A record, reachable from what refers to it. |
| Services | `/services` | The catalog. |
| An agent | `/agents/{id}` | One connection's detail. |
| Consent | `/oauth/authorize`, `/oauth/manual` | Reached from an agent's request, not from navigation. |

Receipts are in the Wallet rather than a destination of their own, and external assistants are in Connections, for the same reason: a destination per capability turns a workspace into a dashboard.

## The request, event by event

Navigation is not a request in the sense [the request](the-request.md) means — nothing is spent and nothing runs — so only the phases that apply are described.

### Asking

The person chooses a destination, follows a link, or edits the URL. The workspace layout above the pages holds the sockets and the conversation, so moving between pages does not tear down the connection or the run.

### Answered at once

The page changes. The direction of the slide comes from the position of the two paths in the navigation order; a path outside that order would fall outside the animation, which is why a conversation is deliberately given Home's slot.

### Finishing

The new page is rendered, its heading is the page's one `h1`, and the page scrolls on its own. Links and the current destination are identified to assistive technology, and the waiting badge follows across pages.

## Variants

| Variant | Set before asking | Changed while it runs |
| --- | --- | --- |
| Who is asking | Only a person navigates. Agents and schedules have no pages. | No effect. |
| The policy in force | No effect. Navigation is never gated by the leash. | No effect. |
| Funds available | No effect. | No effect. |
| What is being asked for | Decides which page. | No effect. |
| The asking agent's grant | No effect. | No effect. |
| The shared browser | Navigating away from the browser view does not stop browsing. | No effect. |
| Appearance and motion | Width decides rail or pill. Reduced motion removes the slide, not the change. | A theme or width change re-lays out in place. |

## Cancel and interrupt

| Event | Before the page changes | While a run is going |
| --- | --- | --- |
| Stop — the person halts this run | Unrelated. | Stopping does not navigate. |
| Freeze — the wallet is frozen, mid-run | Unrelated. | No effect on where the person is. |
| Denying a waiting approval, or leaving it unanswered | Unrelated. | The badge clears when nothing is waiting; the person is not moved. |
| Asking something else while this request is still in flight | Unrelated. | No effect. |
| Leaving the page, or switching to another conversation, mid-run | This is the event. Nothing is lost; the run is the server's. | The run continues. |
| Reload; the tab or the app closed | The route is restored from the URL. | The run is rejoined. |
| Network lost; the socket drops | Pages already loaded still render; the sockets reconnect above them. | The page does not change. |
| The model, a service, or the facilitator errors or rate-limits mid-run | No effect. | The person is not moved by an error. |
| The session expires, or the person signs out | The person is returned to the signed-out surface. | The same. |
| The policy or a cap changes mid-run | No effect. | No effect. |
| Funds run out mid-run | No effect. | No effect. |
| The person takes control of the shared browser mid-run | No effect. | Taking the page does not navigate. |
| The same account open in a second tab or on a second device | Each tab has its own route. | Both can watch the same run from different pages. |

## Interactions with other systems

**The leash.** No page is gated by it. A frozen wallet changes what the Wallet says, not where a person may go.

**Money and receipts.** Receipts live in the Wallet; the activity record can be deep-linked.

**Approvals.** A waiting approval shows as a count on Home and follows the person across pages.

**Provenance.** No interaction.

**History and persistence.** The conversation id is in the URL, which is what makes a conversation linkable and restorable.

**The shared browser.** Deliberately not a destination.

**Connected agents and grants.** Connections is secondary; an individual agent has a page reached from it.

**Notifications.** The waiting badge is the only navigation-level notification.

**Navigation and URL state.** This document is it. See [url state](../cross-cutting/url-state.md) for what each page keeps in its query.

**Appearance, motion and accessibility.** One primary landmark at every width — the pill is not rendered at desktop width, so assistive technology sees a single primary navigation rather than two. Every target clears 44px, links identify the current page, and scrolling pages reserve space above the pill and the phone's safe area.

**Offline and reconnection.** Navigation is client-side and works offline for pages already loaded.

**Stubs.** No effect.

## Edge cases

- Home is the current destination for both `/` and any `/chat` path, so a conversation highlights Home rather than nothing.
- The pill and the rail are never both rendered, which is what keeps the landmark count at one.
- `/browser` exists as a route even though the browser is not a destination, so it can be opened directly and popped out.
- The navigation order is what the page transition direction is computed from; a route not in it is treated as position −1.
- Consent routes are reached from an agent's redirect rather than from anywhere in the interface.

## Open questions and verification

- This structure — three destinations with Connections and Account demoted — **differs from `docs/plan/STATUS.md`**, which describes a four-slot pill with Chat, Wallet, Services, Agents and Settings behind a More. The tree at the pinned commit is what is described here. Which is current in the deployed app has not been checked.
- The breakpoint at which the rail replaces the pill was not read out of the code.
- Whether Services and Activity appear anywhere in the navigation, or are only reachable from within other pages, is not established.
- Whether the waiting count appears on the pill as well as the rail has not been confirmed.

Verified against the Froggy tree at commit `5caed50`.
