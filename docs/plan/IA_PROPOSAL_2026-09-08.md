# Which pages, and which modules — a proposal (Tue 8 Sep 2026)

Kristjan asked, after the restyle and the pill navigation landed: rethink which pages the app surfaces and which modules sit on them, from what the app is about. This is that proposal, written for a decision in the group. It builds on the pitch (`MVP_PITCH_FABLE51.md`: "your agent gets an allowance, not your keys", two halves: a wallet with rules for the person, a service any agent can buy), on Jonas's handoff (`../design/SCREENS_HANDOFF_FABLE51.md`: the words that leave, one balance, "Froggy can spend"), and on the seven demo clips (`VIDEO_FLOWS_FABLE51.md`).

## The test for a page

A page earns a place in the pill when a person opens the app to do that thing. Today the pill holds Chat, Wallet, Services and More (Agents, Settings). Two of the four fail the test: nobody opens Froggy to browse a catalog, and "Services" is a supplier word; and Wallet is still a crypto word for what is, to the person, their balance.

## Four pages

| Pill | Page | What it is for | Modules on it |
| --- | --- | --- | --- |
| 1 | **Home** | Ask Froggy for something, watch it work, see what it cost. | The thread; the live browser (fixed column on desktop, a card in the stream on phone); receipts inline in the thread as rows; the approval ticket when Froggy needs a yes; three suggestion chips that name what Froggy can buy (this is where the catalog goes: "Search the web $0.05", "Second opinion $0.10", "Make an image $0.12"); "Later" rows for anything scheduled. |
| 2 | **Balance** | Know how much there is, put money in, see where it went. | One dollar number; Add money and Withdraw; the "Froggy can spend" switch; "Spent this week" against the weekly limit, as a bar that fills; Activity grouped by day, receipts and declines with a plain reason; tap a row for the receipt with the explorer links behind "Details". |
| 3 | **Agents** | Hand your own agent the allowance. The recruiting flow, so it stays top level. | The connect card (link, Copy link, three steps); connected agents as rows with "can spend" and what each spent this week; Disconnect; Telegram as a connected app with Pair/Unpair. |
| 4 | **More** | Everything a person changes once. | **Limits** (per purchase, per week, ask me above $x, sites Froggy can pay); **Summaries** (daily, weekly); **Appearance** (Passbook, Lilypad, System); **Security** (signed-in devices, sign out everywhere); Delete account, quiet. |

Services stops being a page. Its two halves move to where they are used: the catalog becomes the suggestion chips and a "What Froggy can buy" sheet from Home, and the results become rows in the Home thread and in Balance's Activity, since a bought service is a receipt like any other. The results list a person needs after a reload is Activity.

## Modules that leave the person's view

Directory; the raw rule list with rule ids (replaced by Limits in words); Connection details (signer, session, WebMCP); the stub/live mode badges; HCS topic and transaction hashes on the surface (they stay behind Details on a receipt); the pocket and top-up vocabulary; provider names and "Configured" badges on services.

## Modules that appear

The weekly bar on Balance (the leash, which the code has but no page shows); the "Froggy can spend" switch on Balance and per agent; declines with a reason as rows, not toasts; "Later" on Home for schedules; a badge on the Home pill when an approval is waiting.

## Three questions for the group

1. Four pages in the pill (Home, Balance, Agents, More), Services folded into Home and Balance: yes or no?
2. Balance, not Wallet, on the pill: yes or no? The handoff already made this call for the page title.
3. Do Agents stay top level for the hackathon (the wedge), or go under More once the demo is recorded?

## After the decision

One Codex lane, briefed from this file and the handoff, after the second motion pass lands: move modules, rename the pill, delete the Services route, keep every browser test green or rewrite the ones the move makes wrong, recapture the tour. Roughly three hours.
