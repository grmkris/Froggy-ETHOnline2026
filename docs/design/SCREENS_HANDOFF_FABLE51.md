# Screens handoff: Passbook and Lilypad (FABLE51)

Written 8 Sep 2026. This is the implementation handoff for the restyle. The board with every screen rendered is `SCREENS_BOARD_FABLE51.html` in this folder (open it in a browser; it loads Inter Tight, Archivo and IBM Plex Mono from Google Fonts). The same board is published at https://claude.ai/code/artifact/bdd5cd69-eb8b-41a9-8d3a-8c94a1dc267b.

Two directions survived the review: **Passbook** (light) and **Lilypad** (dark). They share one component structure and differ only in CSS variables, so the app can ship one and add the other as a theme later. Recommendation: Passbook first.

Every screen was also rewritten in consumer language. To the person, Froggy is not a crypto product: no wallets, tokens, chains, addresses or hashes appear anywhere.

## 1. The words that leave

| Today | Now | Note |
| --- | --- | --- |
| Wallet | Balance | The page and the word. "Your balance", "your money". |
| Fund, top up | Add money | Withdraw stays Withdraw. |
| Freeze; agent signer granted / pending / absent | "Froggy can spend", a switch | One control replaces a button and a status. Pending shows "Waiting for you" in place of the switch. |
| USDC on Base, HBAR on Hedera | gone | One balance in dollars. Where it sits is not the person's problem. |
| 0x address, hash, hcs #, rule id | Receipt 1204 · 14:12 | A number and a time, like any receipt. |
| Refused | Declined, with a reason | "Site not approved", "Over today's limit". |
| Spending window | This week, today | Calendar words. |
| Paid endpoints, 402 | Sites Froggy can pay | An approved list in Settings. |
| MCP URL, token, mint, revoke | Connect link, connect, disconnect | No credential words on screen. |
| Connection, signer, session | Security | Signed-in devices and sessions. |
| Integrations, stubbed, live | Connected apps | Telegram only. The plumbing is not a setting. |

Money is always dollars with two decimals and tabular figures: $4.80, $128.40, +$50.00. A balance the backend cannot answer for is "Balance unavailable right now", never $0.00.

## 2. The system

Inter Tight everywhere, six type steps, negative tracking on every heading. No borders: cards separate by an inset highlight, a soft shadow and a 1px ring. One radius hierarchy. Dense, predictable spacing.

| Step | Size / line | Weight | Tracking | Used for |
| --- | --- | --- | --- | --- |
| Money | 32 / 36 | 600 | -0.9px | The one figure a screen exists for |
| Greeting | 26 / 30 | 600 | -0.9px | The sign-in headline only |
| Title | 22 / 28 | 600 | -0.7px | Page title, one per screen |
| Section | 19 / 24 | 600 | -0.6px | Section headings above a card |
| Body | 15 / 20 | 400 | -0.2px | Everything readable |
| Label | 12.5 / 16 | 500 | -0.1px | Labels, chips, tab titles |

- Radius: 54 device frame, 20 card, 12 row and chip, 50% circular control. Lilypad: 22 card, 14 row and chip, pill and circle controls.
- Spacing: 26 page margin, 18 between card groups, 10 inside a component.
- Card: `inset 0 1px 0 highlight, 0 1px 2px shadow-1, 0 12px 28px -16px shadow-2, 0 0 0 1px ring`. Dividers are 1px of the track colour, never a border colour.
- Circular buttons: 46px, inset highlight plus an inner shadow at the bottom, no flat fills. Primary buttons are a two-stop vertical gradient of the accent.
- Charts and spend grids draw from a five-step ramp, track to deep accent, never from the accent directly.
- Who is doing what: amber is an agent, blue is the person, the red is a decline. Every list carries one of them.
- Passbook keeps IBM Plex Mono for receipt numbers and times. Lilypad has no mono.

### Passbook variables

```css
--ground: #eff1ec;
--card: #fcfdfb;
--inner: #f3f5f0;
--track: #e2e6df;
--tabbar: #f7f8f5;
--bezel: #131916;
--text: #15201a;
--muted: #6b776f;
--strong: #2b3b31;
--accent: #2f7a4c;
--accent-hi: #348452;
--accent-lo: #276a41;
--accent-soft: #e2efe6;
--on-accent: #f6fbf7;
--agent: #9a6314;
--agent-ink: #7a4f10;
--agent-soft: #f8f0e2;
--human: #3866d6;
--human-soft: #e3eafb;
--refused: #b3402f;
--refused-soft: #f7e4e0;
--r0: #e2e6df;
--r1: #c6dccd;
--r2: #8fc3a3;
--r3: #55a072;
--r4: #2f7a4c;
--hl: rgba(255, 255, 255, 0.95);
--ring: rgba(21, 32, 26, 0.055);
--sh1: rgba(21, 32, 26, 0.05);
--sh2: rgba(21, 32, 26, 0.18);
--r-card: 20px;
--r-row: 12px;
--r-cta: 14px;
--machine: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
--eye: #f3f5f0;
--pupil: #15201a;
--mouth: #15201a;
--knob: #ffffff;
```

### Lilypad variables

```css
--ground: #0d120f;
--card: #171f19;
--inner: #1f2921;
--track: #2a3630;
--tabbar: #121814;
--bezel: #050706;
--text: #e9f0ea;
--muted: #8e9d92;
--strong: #c8d5cb;
--accent: #4fb87a;
--accent-hi: #5ecb8b;
--accent-lo: #3ea468;
--accent-soft: #16301f;
--on-accent: #07130b;
--agent: #e8a33d;
--agent-ink: #e8a33d;
--agent-soft: #2a2113;
--human: #6b93f0;
--human-soft: #132433;
--refused: #e26a5a;
--refused-soft: #33201c;
--r0: #2a3630;
--r1: #2c4b3a;
--r2: #357a53;
--r3: #42a06b;
--r4: #4fb87a;
--hl: rgba(255, 255, 255, 0.07);
--ring: rgba(255, 255, 255, 0.05);
--sh1: rgba(0, 0, 0, 0.4);
--sh2: rgba(0, 0, 0, 0.7);
--r-card: 22px;
--r-row: 14px;
--r-cta: 999px;
--machine: "Inter Tight", Inter, system-ui, sans-serif;
--eye: #0d120f;
--pupil: #e9f0ea;
--mouth: #0d120f;
--knob: #eaf5ee;
```

The system's suggested accent, #3866D6, is not the accent here; green is. That blue became the human-driving colour, where the product already has a job for it. Lilypad lifts it to #6B93F0 so it holds on the dark ground.

## 3. Mapping to @froggy/ui

The board is self-painted HTML so it renders anywhere. In the app the same values land as tokens in `packages/ui/src/styles/globals.css`:

- `--background`, `--card`, `--muted`, `--border` (used only as the divider colour), `--foreground`, `--muted-foreground`, `--primary`, `--brand`, `--brand-soft`, `--drive-agent`, `--drive-agent-soft`, `--drive-human`, `--drive-human-soft`, `--destructive`, `--refused-soft` take the values above.
- `--radius` becomes the card radius; rows and chips use the row radius; circular controls use `rounded-full`.
- `shadow-card` becomes the card recipe. `border` utilities on surfaces go; `border-t` survives only as the row divider.
- `font-display` and `font-sans` both become Inter Tight (one @fontsource package); `font-mono` stays IBM Plex Mono in Passbook and is retired in Lilypad.
- `text-money` keeps the tabular figures and takes the 32px step.

The shell (rail, tab bar, top bar) is not redesigned. Every screen designs only its content column, as `.design-sync/conventions.md` already says.

## 4. What changed on each screen

Written by the agent that composed the screen, for the person implementing it. These notes still use the internal field names on purpose, so each visible change maps back to the data it comes from.

### Home

- The first-run hero (the 'What would you like to do?' headline, three outline action tiles and the balance peek line) is replaced by the page title with the live thread and three neutral suggestion chips taken from suggestions.ts; the greeting moves into the desktop intro sentence, and the balance moves into the 'This session' card on desktop as 'Available'.
- The live browser card keeps its place in the stream on mobile, and on desktop it becomes the fixed right column instead of an optional split pane, with the site name in the bar and a Working chip in agent amber so it reads as Froggy on the site, not the person.
- Every paid step is filed into the thread as a receipt row: amber dot, plain description, 'Receipt 1204 · 14:12' in machine text and the amount right, so cost is visible without leaving the chat; the suggestion chip about a decline now reads 'Why was that declined?'.
- 'Froggy can spend' is a switch in the session card rather than a pause control, and the suggestion chips need a 44px hit area around the 24px pill when built.

Checker corrections: Header: both fragments now begin with <h4 class="t-title">Home</h4> (the .t-greet headline is reserved for the sign-in screen); the 'Good morning' greeting moved into the desktop intro sentence.; Desktop: the header and intro sentence were moved out of the two-column grid so the fragment begins with the header as specified; the grid now follows them.; Notes: removed banned words 'Wallet:', 'freeze', 'mandate' and 'refused' from the notes text, rewording to 'balance peek line', 'pause control' and 'the suggestion chip about a decline'.

### Balance

- The wallet becomes one dollar number called Balance: the USDC + HBAR label, the per-chain breakdown, addresses and the "Connect an agent" link leave this screen, and the actions become Add money, Withdraw and Receipts.
- agentSigner turns into the "Froggy can spend" switch (granted is on, absent is off, pending shows the label "Waiting for you" in place of the switch) and windowSpentUsdMicros is shown as "Spent this week" with an amber dot so the person sees it is Froggy's spending.
- Activity is grouped by day as rows in one card with a dot for who acted (amber Froggy, blue you, declined in the refused colour) and a plain reason on declines, replacing the stack of receipt tickets and any policy or signer wording.
- When totalUsdMicros is null show "Balance unavailable right now" instead of a number, and when ledgerNote is set label the spend row "Spent this week, at least" so an unreadable ledger never looks like zero spend.

### Services

- The five service cards in a two-up grid become one list of rows named as what the person gets (Web search, Second opinion, Make an image, Read it aloud, Recent posts on X) with the real catalog price at the right; on desktop the chosen row is highlighted and the request form sits beside the list instead of replacing it.
- Your tasks becomes Your results: each row says who started it (blue dot for you, amber for Froggy), a status in the person's words (Working, Ready, Declined with a plain reason such as Over today's limit), the receipt number and time, and a round download button on a finished row.
- Provider names, the Simulated and Configured badges, the readiness note and the technical wording about spending rules leave the person's view; the form keeps the real price on the button (Start for $0.12, not the placeholder $0.80), the character count, and the honest line that a failed job is not refunded automatically.
- First-time empty state for the results card is one line, No results yet, what you and Froggy buy here lands in this list, with a single Pick a service button.

Checker corrections: notes[2]: replaced the banned phrase 'wallet-policy wording' with 'technical wording about spending rules'.

### Agents

- The Connect by URL card becomes one connect card: a readable link, a Copy link button and three numbered steps, since the agent signs in with the person's account in the browser and no credential changes hands; the per-client snippets for Claude Code and Cursor and the credential path for assistants that cannot sign in move behind Advanced options.
- Connected agents are rows in one card: an amber dot for an agent that has done work, a machine line with when it connected and what it spent this week, and a switch (it can spend) as the everyday control, with Disconnect inside the row's detail; a connection with no use yet (lastUsedAt null) reads Added today, not used yet with a muted dot, and each row also says in plain words what its grant lets it do.
- Telegram is a row with a Paired chip on mobile and a card under Connected apps on desktop with a quiet Unpair; the pairing code flow appears only while it is not paired.
- First-time empty state for Your agents: a .empty with the line No agents yet. Copy the connect link and paste it into your assistant, and a Copy link button.

Checker corrections: Removed the intro sentence under the mobile title; the header rule only allows an intro sentence on desktop.; Added the plain-words capability line (Can search the web, read pages...) to the two agent rows on mobile, matching desktop and keeping mobile content in the 620 to 780px range after the intro was removed.; Notes: replaced the word token with credential (twice) so the banned term does not travel with the draft, and dropped the on desktop qualifier now that both fragments show the capability line.

### Settings

- The Connection card (signer, agent standing, session, WebMCP, policy) and the Integrations badges are gone entirely; in their place Security lists the person's signed-in devices with a Sign out everywhere row, and Telegram moves under Connected apps with a Paired chip.
- Paid endpoints becomes Sites Froggy can pay: each approved site is one row with an amber dot, when it was approved, how often Froggy paid it and what it costs; a decline because a site was not on the list shows as a declined row with its receipt number and an Allow button that runs today's probe-and-add in one step; the site field sits behind Add a site instead of at the top of the card.
- The daily digest hour picker becomes a Daily summary switch with the time as a reference line (tapping the row changes the hour), the weekly recap is new and off by default, and what the person asked Froggy to do later keeps its own Scheduled section whose empty state points to the chat; on mobile it sits below Reminders when something is scheduled.
- Delete my data is renamed Delete account and demoted to a quiet decline-coloured action under Sign out; it keeps the existing confirm dialog.

Checker corrections: notes[1]: replaced "refused row" with "declined row" and "the URL field" with "the site field" to keep the notes on the product vocabulary.; notes[3]: replaced "refused-coloured" with "decline-coloured".

### Sign in

- The headline drops the word wallet: "Give your agents an allowance." replaces "A wallet for your agents." and the sentence under it now says what happens to the money instead of "Fund tasks and follow the work".
- The Fund / Control / Follow beats become three rows for You, Your agents and Receipts, each with a blue, amber or green dot, so the split of who does what is visible before the person signs in.
- The tagline under the button ("Bring your own agent, or start a task with Froggy") goes away; the button stands alone at the bottom on mobile and inside the card on desktop, and the headline sits with the frog hero on the left at desktop widths.
- Loading and failed states keep this layout: loading shows skeleton lines where the three rows are, and failed swaps the button for "Try again" with a one-line declined-coloured message above it.

## 5. How the screens were made

Six agents ran in parallel, one per screen, each reading the current page source before composing a phone and a desktop fragment against the class vocabulary above. A checker then scrubbed each fragment for banned words, stray class names, hex colours and em dashes. A final scan of the assembled board found zero of each across all twelve fragments.
