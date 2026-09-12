# apps/web

The workspace is five pages under one layout route (`routes/workspace-layout.tsx`): chat, wallet, services, agents, settings, reached from one floating pill at every width: Chat, Wallet and Services, with Agents and Settings under More. The layout owns the sockets, the conversation and the painter and hands them down through `lib/workspace-context.ts` and `lib/chat-context.ts`, so leaving the chat mid-turn never stops the turn; the chat page reads its state from the context and unmounts freely. Once a task starts, the conversation contains the live shared page and its receipts; approvals sit above the composer. Keep each page's own scrolling separate from chat auto-follow.

`/welcome` is the sixth route under the layout and the one drawn without its chrome: four steps after sign-up (the doors and the AI notice, the spending rules with the same signer grant Settings offers, Telegram and the digest, then an optional permanent email address) and two endings. Home sends a signed-up person there while `GET /api/setup` says they have never finished or skipped it, and every exit writes that fact with one `PUT`; a local identity is never sent, and anyone reaches it again from the link at the foot of Home. The steps reuse the Settings and Connections components rather than restating them, and the grant goes through `lib/agent-policy.ts` from both places.

Stop asks the server to cancel a run. An acknowledged request is not proof that an already-submitted payment was reversed; keep unconfirmed cancellation visible with a retry action.

Screencast frames never touch React state; the painter owns the canvas directly. The canvas uses a ring and never a border, because `getBoundingClientRect()` includes borders and would offset every click by their width.

Privy is imported dynamically, so a build with no app id neither loads it nor fails on it. That is why `lib/privy.tsx` carries a scoped lint exception rather than a hard import.
