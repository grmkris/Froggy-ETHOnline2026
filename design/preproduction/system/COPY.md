# Copy deck

The rule that governs everything here: **personality in greetings and illustrations, precision in permissions, prices, risks and outcomes.** A playful sentence next to a number is fine. A playful sentence _about_ a number is not.

Voice: plain, second person, present tense. Say what happened and what happens next. No apologies, no exclamation marks in anything involving money.

## Onboarding

Minimal by design. Nobody connects a wallet, adds funds, links Telegram and configures an assistant before trying anything.

| Moment | Copy |
| --- | --- |
| Welcome | "Froggy does things on the web for you — research, comparisons, purchases you approve." |
| Two doors | "Use Froggy here" / "Connect your own assistant" |
| First task | "What should I look into?" |
| Access, asked late | "To buy this, Froggy needs a way to pay. You set the limit." |
| Funding, never a gate | "You can look around without adding funds." |
| Telegram, optional | "Get a message when something needs you. You can add this later." |

Never: "Get started in 4 easy steps", "Complete your profile", a progress ring on setup.

## Status

Say the stage. Never invent a percentage.

| State          | Copy                                                     |
| -------------- | -------------------------------------------------------- |
| Working        | "Working on it." / "Comparing three retailers."          |
| Long-running   | "Still going. Started 11:04."                            |
| Needs you      | "One thing needs you."                                   |
| Done           | "Done, and confirmed."                                   |
| Stopped by you | "Stopped. Nothing was submitted."                        |
| Failed         | "This failed. Nothing was paid."                         |
| Uncertain      | "Outcome not yet known."                                 |
| Scheduled      | "Checked twice a day until 20 Sep." — never "monitoring" |
| Paused         | "Paused. It will not resume on its own."                 |

## Permissions

The agent's authority is always narrower than or equal to yours, including when another assistant delegates. Say the cap, the payee and the expiry.

- "Froggy can spend up to €200 a day from your card. You can change or stop this."
- "This allowance ends on 20 Sep." / "This allowance has ended."
- "Froggy cannot pay yet — it has no signer. Grant one to let it spend."
- "Your assistant asked for this task and was given €50 of your allowance."
- Never: "Froggy is fully authorized", "unlimited", or any wording that hides a cap.

## Money

- Approve buttons name the amount: "Approve €135.40".
- Four lines, never one total: product, delivery, fees, and the agent's own research spend.
- "Quote valid until 12:20 CEST."
- Changed price: "Your approval does not cover this. Nothing was paid."
- Uncertain: "The payment may have gone through. Froggy will not try again and will not switch payment method until this is resolved." **Never** offer a second attempt.
- Handoff: "Card payment is not something Froggy can complete. Approving hands you the checkout with the basket already filled."
- Stub: "Nothing was paid. This receipt exists so a demo cannot be mistaken for a purchase."

## Risk and evidence

- Every claim: source and time. "shop-a.example · seen 11:31"
- Unknowns stay unknown: "Returns unclear" — never rounded up to a benefit.
- Yield: "Rates change. Fees and withdrawal conditions apply." with source and time.
- **Banned outright:** "risk-free", "safe", "guaranteed", "audited so it's safe", "can't lose", "safe bag". Audited is not safe. Public is not private.
- Token research: "This is what Froggy found. It is not advice."

## Notifications

- "One thing needs you: approve €135.40 to Example Shoe Co. Expires 12:20."
- Quiet hours: "Held until 08:00 because of your quiet hours."
- Expired: "This approval expired at 12:20. Nothing was paid."
- Already decided elsewhere: "You already approved this from the app."

## Errors

What went wrong, then what to do. No apology, no blame, no stack.

| Case | Copy |
| --- | --- |
| Provider down | "Couldn't reach the price source. The task is paused." → Retry |
| Auth expired | "Your connection to Example Bank expired." → Reconnect |
| Browser lost | "Disconnected at 11:38. The task is paused, nothing was submitted." → Retry |
| Blocked | "The site blocked automated access. You can take control." → Take control |
| No result | "Nothing matched under €150. Widen the budget or change the constraints." |

## Empty states

Say what will appear here, and give the one action that fills it.

- Home, first use: "Nothing yet. Ask Froggy to look into something."
- Home, quiet: "Nothing needs you. Two tasks are running."
- Explore, no results: "Nothing matched. Try a different name or address."
- Wallet, no funds: "No funds yet. You can still browse and compare."
- Receipts: "Receipts appear here after Froggy pays for something."
- Connections: "No assistants connected. Connect one to give it Froggy's abilities."
