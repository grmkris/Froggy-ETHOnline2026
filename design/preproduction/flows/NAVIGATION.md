# Navigation — six destinations into three

**Status: proposal.** `apps/web` is not touched in preproduction. This is the mapping an implementer would follow, and the record of what the brief changes.

## Today, in the code

`apps/web/src/lib/nav.ts` declares six destinations. `PillNav` puts the first three in a floating pill and the rest behind a "More" popover:

| Route       | Label    | In the pill? |
| ----------- | -------- | ------------ |
| `/`         | Chat     | yes          |
| `/wallet`   | Wallet   | yes          |
| `/services` | Services | yes          |
| `/agents`   | Agents   | More         |
| `/activity` | Activity | More         |
| `/settings` | Settings | More         |

Plus `/browser` as its own route, and `/oauth/authorize` and `/oauth/manual` for external clients.

## The brief

Three primary destinations — **Home/For You, Explore, Wallet** — and an explicit prohibition on separate Portfolio, Browser, Agents, Receipts, Earn, Telegram or ChatGPT items in the primary navigation. Connections and account settings are secondary. The browser is a contextual task view, not a destination.

## The mapping

| Today | Becomes | Why |
| --- | --- | --- |
| `/` Chat | **Home** | Home is not a chat log. The composer stays, but the page leads with what needs the person, what finished, and what was found. A conversation is something a _task_ has, not the front page. |
| `/wallet` Wallet | **Wallet** | Unchanged as a destination. Absorbs holdings, positions, available versus reserved funds, payment methods, permissions and history. |
| `/services` Services | **Explore** → services tab | Services are one thing to explore, alongside tokens and wallets/friends. Not a destination of their own. |
| `/agents` Agents | **secondary → Connections** | External assistants and their granted allowances. Reachable from account, and surfaced inside the task an assistant started. Explicitly not primary. |
| `/activity` Activity | **absorbed** | Receipts and history belong to the Wallet; per-task events belong in the task. A global activity feed is the dashboard habit the brief is trying to break. |
| `/settings` Settings | **secondary → Account** | Foot of the sidebar on desktop, behind the account control on mobile. |
| `/browser` | **contextual task view** | A compact "View browser" affordance while browsing, and a task-specific handoff when the person must act. Closing the view must not stop the work. |
| `/oauth/*` | unchanged | Consent screens, not destinations. |

Nothing is deleted. Every capability keeps a home; four of them stop being top-level.

## Shape per width

**Desktop** — a left rail: wordmark, then Home / Explore / Wallet, then Notifications and Account pushed to the foot, visually demoted. This follows the clean layout reference and is what `screens/review-board.html` section 7 shows.

**Mobile** — the existing pill, with three items instead of four. The "More" popover disappears, which is the point: with three destinations there is nothing to hide.

`PillNav`'s mechanics survive intact — one landmark at every width, the popover rendered inside the nav for assistive technology, a shared `LayoutGroup` indicator, and a reduced-motion branch. Only `NAV_ITEMS` and the popover's existence change.

## What the browser affordance has to distinguish

The brief asks for three states to be visually distinct, and the repo already has the right component for it. `packages/ui/src/components/driving-ring.tsx` encodes exactly this: amber while the agent drives, blue and still while the person does, neutral when idle — one signal that answers "who has the page" the same way on every surface.

| State | Reads as | Controls present |
| --- | --- | --- |
| Closed but running | a compact "View browser" chip | open, stop |
| Watching | agent driving, live | take control, stop |
| Taking control | person driving, agent paused | give back, stop |
| Handoff needed | blocked on login or checkout | open handoff, cancel task |
| Disconnected | honest failure, work state stated | retry, stop |

Closing the view is not stopping the work, and the copy has to say so. Cancelling the task is the only thing that stops it.

## Order on Home

Priority, not recency:

1. needs the person — approvals, decisions, expiring quotes
2. meaningful results — a task finished
3. relevant findings — with source, why it appeared, when observed, freshness, next action
4. quiet background status — a compact one-line summary, not a section

Roughly three cards in the first viewport, plus the composer and that one summary line. Each finding carries dismiss, mute and stop-watching. A suggestion is visibly not an enabled automation, and asking for research never authorizes buying or indefinite monitoring.

## Cost of the change

`nav.ts` is a six-line list; the rail is new; `PillNav` loses its popover branch. The real work is not navigation — it is Home becoming task-driven rather than a chat page, and `/browser` becoming contextual. Both are app changes and both are out of scope here.
