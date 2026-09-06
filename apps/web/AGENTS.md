# apps/web

First use starts at the wallet: balances, funding and agent setup. Once a task starts, the conversation contains the live shared page and its receipts; approvals sit above the composer. Wallet and settings remain available in a drawer without remounting the conversation. Keep first-use scrolling separate from chat auto-follow.

Stop asks the server to cancel a run. An acknowledged request is not proof that an already-submitted payment was reversed; keep unconfirmed cancellation visible with a retry action.

Screencast frames never touch React state; the painter owns the canvas directly. The canvas uses a ring and never a border, because `getBoundingClientRect()` includes borders and would offset every click by their width.

Privy is imported dynamically, so a build with no app id neither loads it nor fails on it. That is why `lib/privy.tsx` carries a scoped lint exception rather than a hard import.
