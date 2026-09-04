# apps/web

Three panes: chat, the shared page, the wallet. They are one screen because the claim being demonstrated — that you can watch the agent spend and stop it — only reads as true if the refusal appears while the page it was refusing to pay for is still visible.

Screencast frames never touch React state; the painter owns the canvas directly. The canvas uses a ring and never a border, because `getBoundingClientRect()` includes borders and would offset every click by their width.

Privy is imported dynamically, so a build with no app id neither loads it nor fails on it. That is why `lib/privy.tsx` carries a scoped lint exception rather than a hard import.
