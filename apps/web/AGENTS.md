# apps/web

The workspace shares one layout route (`routes/workspace-layout.tsx`). Home, Inbox and Watchlist are the primary destinations; Your money, Tools, Activity, Connections and Account live in the desktop rail and workspace menu. Mobile uses a bottom navigation bar. The layout owns the sockets, conversation and canvas painter, so leaving chat mid-turn never stops the run. The session-scoped draft provider keeps unsent chat text, queued messages, email context and unsaved email fields through client navigation, without storing message bodies in localStorage. Inbox has its own list and reader; chat shows only a compact email summary. Keep each page's scrolling separate from chat auto-follow. Browser split view requires at least 1280px and leaves 480px for chat; narrower layouts use the inline browser.

`/welcome` is a route under the layout and the one drawn without its chrome: four steps after sign-up (the doors and the AI notice, independent credit spending limits, Telegram and the digest, then an optional permanent email address) and two endings. Home sends a signed-up person there while `GET /api/setup` says they have never finished or skipped it, and every exit writes that fact with one `PUT`; a local identity is never sent, and anyone reaches it again from the link at the foot of Home. The steps reuse the Settings and Connections components rather than restating them, and wallet signer grants remain separate in Account.

Stop asks the server to cancel a run. An acknowledged request is not proof that an already-submitted payment was reversed; keep unconfirmed cancellation visible with a retry action.

Screencast frames never touch React state; the painter owns the canvas directly. The canvas uses a ring and never a border, because `getBoundingClientRect()` includes borders and would offset every click by their width.

Privy is imported dynamically, so a build with no app id neither loads it nor fails on it. That is why `lib/privy.tsx` carries a scoped lint exception rather than a hard import.
