# Onboarding flow, after sign-up (FABLE51)

Written Fri 11 Sep 2026, 20:00 CEST. Six desktop boards were drawn in the Froggy Paper file (page 1, the row under the app screens): the three steps, the ready screen, the second door's ending, and a flow map. This document is the specification behind them: what each step collects, what is optional, what it writes, and every way out. It starts from the code and the ADRs (two read-only audits of HEAD `058c1d1`) and from `design/preproduction/system/COPY.md`; nothing in the tree was changed. Two independent reviews ran on the drafts before they were published — a design and copy audit against the deck's rules, and a cold read as a first-time user — and section 6 records what they changed.

Paper file: https://app.paper.design/file/01M28CWHJS9FE30X4HX2RQ3MP1/1-0 — boards "Onboarding 1 · Welcome", "Onboarding 2 · Spending rules", "Onboarding 3 · Notifications", "Onboarding 4 · Ready", "Onboarding 4b · Connect your assistant", "Onboarding · Flow map".

## The answer in five lines

1. **Three steps, then Home.** Welcome (pick a door, read the AI notice), Spending rules (one click under the defaults), Notifications (Telegram by code, the digest hour). Step 1 has "Skip setup" top right; step 2 has "Not now"; step 3's Continue works whether or not Telegram was paired.
2. **Only one thing is genuinely necessary, and today it is hidden.** The agent cannot pay until the person attaches the agent signer under their Privy policy — one signing prompt in the browser. At HEAD that button lives only on `/settings` in the Connection card (`apps/web/src/components/settings/agent-signer-consent.tsx`), and nothing on Home or Wallet asks for it. Step 2 moves it to the front, with the existing defaults ($1.00 without asking, $2.00 a payment, $10.00 a day, 30 days — `packages/domain/src/authority.ts:159-164`) and the existing button.
3. **Nothing else is collected.** The product has no display name, no profile, no guest path; identity is the Privy DID and the email or Google account behind it. Funding is never a gate ("You can look around without adding funds.") and appears only as an optional card on the ready screen, address first.
4. **The two doors are the one real fork.** "Use Froggy here" ends on a composer with three starters. "Connect your own assistant" ends on the copy-for-your-agent sentence, the `claude mcp add` line, and what the consent screen will show. Both endings say what was set and what was left for later.
5. **The copy deck's onboarding rules hold.** No "N easy steps", no "Complete your profile", no progress ring — the top bar names the three steps and ticks them off. "Leash", "pocket", "allowance", "top-up" do not appear; the words are "spending rules", "wallet", "funds". No lime anywhere: nothing on these boards needs the person.

## 1. What a new account already has, and what needs a click

From the audit of HEAD (`apps/web/src/lib/privy.tsx`, `apps/server/src/{workspaces,session,person-policies,grants}.ts`):

| Created at first sign-in, no action | Needs the person | Optional, later |
| --- | --- | --- |
| Embedded EOA on Base (`createOnLogin: "all-users"`) | **Agent signer attached under the person's policy** — Privy signing prompt, once | Telegram pairing (6-character code, ten minutes) |
| Workspace, session, default mandate (oracle host and payee, treasury) |  | Daily digest hour (Off by default; time zone from the browser) |
| Per-person Privy policy minted with the default allowance |  | Payee directory entries (a pasted URL is probed, never paid, then one click makes it payable) |
| Hedera share credited once (`POCKET_STARTING_USD`, $0.50 on testnet, 0 on mainnet) |  | External assistants (OAuth grant on `/oauth/authorize`, five abilities) |
|  |  | Funds: USDC on Base to the wallet address; from another chain via the Privy deposit address; card on Base mainnet only |

Not in the product, so not asked: display name, quiet hours, network choice, guest mode.

## 2. The steps

The top bar is the same on every board: wordmark, the three step names with the current one filled and finished ones ticked. Each step is one 720-pixel column anchored at the same height: a heading with one illustration, the content, then the actions (Back on the left, the quiet option and the one primary on the right).

### Step 1 · Welcome

- Heading with the idle pose: "Welcome to Froggy." / "Froggy does things on the web for you — research, comparisons, purchases you approve." (COPY.md, Welcome). "Skip setup →" top right.
- **How will you use it?** Two cards, one selected: "Use Froggy here" — "Ask for research, comparisons and purchases. Froggy works in a Chrome you can watch and take over." / "Connect your own assistant" — "Claude Code, Cursor or any MCP client gets Froggy's wallet and browser, under your spending rules." Hint: "You can do both. This only decides what you see after setup."
- **Before you start** — the AI notice, four lines, each with a glyph. This is `USER_FLOWS_FABLE51.md` F4 rewritten for the mainnet build and for a reader who does not know what Privy, a host, a prompt or a directory is:
  1. "You are talking to an AI agent. It can be wrong, or be misled by a web page, so check what it tells you."
  2. "It works in its own Chrome on our servers, never in your browser. You can watch it, or take over, at any time."
  3. "It pays only within rules you set next, and only to services you have approved. Code outside the AI enforces those rules; no wording can talk it past them."
  4. "We keep your email, your receipts and that Chrome's session, which is wiped when you leave. Delete everything from Account, in one click."
- Action: **Continue**. The notice is shown, not signed; "Continue" is the acknowledgement. Nothing is written except the door, for this session.

### Step 2 · Spending rules

- Heading with a sliders glyph, not the mascot (no mascot where a number must be read, BRAND.md): "How much may Froggy spend?" / "One click sets the rules. They are checked by code on every payment, outside the AI — Froggy cannot talk its way past them."
- Four tiles in story order, the defaults from `authority.ts`: **$1.00** up to this without asking · **$2.00** most for one payment · **$10.00** most in a day · **30 days** ends 11 Oct. "Adjust these numbers" opens the existing four-field `AllowanceForm`.
- Four notes, the first in ink because it answers the question every first-time reader carried through the draft ("pay with what?"):
  1. "Your balance is $0.00. Froggy cannot spend anything until you add funds, and then only within these rules."
  2. "Between $1.00 and $2.00 for one payment, Froggy asks you first. Above $2.00, or past $10.00 in a day, it cannot pay at all."
  3. "Only services you have added can be paid. A link you paste is checked first, never paid."
  4. "You can change these numbers, or stop the agent, at any time in Wallet."
- Above the actions: "One confirmation from Privy, which holds the wallet. Nothing is paid now." and, quieter, "Skip, and Froggy asks when it first needs to pay."
- Actions: **Let Froggy pay under these rules** and **Not now**. The primary calls `identity.grantAgentSigner` and `POST /api/agent-signer/refresh`, exactly what the settings card does; the live button says "Let the agent pay under these rules", and the boards say Froggy because every other line does.
- Writes: the agent signer under the person's policy. Skipping writes nothing; at the first paid task the ticket says "To buy this, Froggy needs a way to pay. You set the limit." (COPY.md, Access asked late).

### Step 3 · Notifications

- Heading with the needs-user pose: "When Froggy needs you." / "Get a message when something needs you. Telegram is the one channel for now, and you can add it later."
- **Telegram** — "Talk to Froggy and answer its questions from your phone, under the same rules as here." (the live Connections copy). The pairing panel: "Open Telegram and tap Start, or send this to @FroggyBot yourself", `/start K7Q2MD`, **Open Telegram** (the deep link, the panel's one primary), **Copy**, and "Waiting for Telegram. You can continue now; linking finishes on its own. The code is valid for ten minutes." The code is minted when the step opens (`POST /api/telegram`) and polled every two seconds, as on Connections today. `@FroggyBot` stands for the deployment's bot name.
- **Daily digest** — "One short message a day: what finished, what needs you." Off · 07:30 · 08:00 · 09:00, with "Europe/Berlin, from your browser" underneath. **Off is selected**, the product default; a draft pre-selected 08:00 and the audit rightly called it a silent opt-in.
- Action: **Continue**, drawn as an outline button so the panel's "Open Telegram" stays the only green one. There is no separate "later": continuing unpaired is the later.
- Writes: the Telegram pairing if it completed, and the digest hour with the browser time zone (`PUT /api/digest`) if one was chosen.

### Ready (door A)

- Heading with the completion pose: "You're set." / "Ask Froggy to look into something. Research is free; paying for anything waits for funds and stays inside your rules."
- The composer, placeholder "What should I look into?" (COPY.md, First task), with a plain border, and three starters in an order a $0.00 account can act on: "Compare running shoes under $150", "Browse services", "Buy a lending brief · $0.05". Dollars throughout; the draft's "€150" was the one euro on the boards.
- **What you set up** — four lanes with a tick or a muted "Later": Spending rules ("$1.00 without asking · $2.00 a payment · $10.00 a day · ends 11 Oct"), Daily digest ("Off. Account › Daily digest, when you want it."), Telegram ("Not connected. Connections › Telegram, when you want it."), Your assistant ("Not connected. Connections › Connect one.").
- **Add funds · optional** — "You can look around without adding funds. Paid steps wait until there is a balance.", "$0.00", then "Send USDC on Base to 0x4c1f 8a2e ··· 3d0f 9e2a" with a copy control, **From another chain**, **By card**. Address first, per decision `ffca8fe`; the card door is only offered on Base mainnet.
- Action: **Finish**. The draft said "Go to Home", and the cold reader's answer was "I thought this was home."
- If step 2 was skipped, the first lane reads "Not granted. Froggy cannot pay yet. Wallet › Let Froggy pay." with the muted state, and the heading's second sentence drops "inside your rules". Not drawn; one variant of one row.

### Ready B · Connect your assistant (door B)

- Heading with a terminal glyph: "Connect your assistant." / "Paste one sentence into your agent's chat, then approve access in your browser." (the live hint).
- The sentence, verbatim from `copy-agent-prompt.tsx`: "Read {origin}/llm.md and follow it to connect yourself to my Froggy wallet as an MCP server; then tell me what you can do." with **Copy for your agent** and "Works with Claude Code, Cursor and any MCP client."
- "Or add it by hand (Claude Code)": `claude mcp add --transport http froggy {origin}/mcp` (from `/llm.md`).
- "What happens next": 01 "Your assistant reads llm.md and asks to connect." 02 "A consent screen opens here. You choose what it may do: browse in your shared Chrome, pay for services under your rules, buy research briefs, read your history." 03 "Ask it what Froggy can do. Disconnect it any time on Connections." Line 02 paraphrases the consent screen's five switches in plain words; the screen itself keeps its own labels.
- "It spends from your Froggy wallet, inside the rules you set. Balance $0.00 — add funds from Wallet when it needs them." and "Waiting for your assistant. This updates when it connects."
- Action: **Finish**. Writes nothing here; the OAuth grant is written by the consent screen when the assistant arrives.

## 3. Ways out

| Exit | Where it lands | What is left behind |
| --- | --- | --- |
| Skip setup, step 1 | Home | The rules exist but the agent cannot pay yet; digest off; nothing paired. Home shows "Nothing yet. Ask Froggy to look into something." and the composer. |
| Step 2 · Not now | Step 3 | The first paid task raises the ticket "To buy this, Froggy needs a way to pay. You set the limit." |
| Step 3 · Continue, unpaired | Ready | Connections › Telegram and Account › Daily digest hold the same controls. |
| Ready · Finish | Home | — |
| Returning user | Home directly | The flow is shown once per account; a `setupSeenAt` on the workspace is enough. |

## 4. What this asks of the app

Small, and all inside `apps/web` except the flag:

1. A `/welcome` route inside `AppShell`, three panels and two endings, shown when the workspace has no `setupSeenAt`. One server field and one `PUT`.
2. Step 2 reuses `AgentSignerConsent` and `AllowanceForm` as they are; the only change is where they appear, and the button's wording.
3. Step 3 reuses `TelegramSettings` (mint, poll, deep link) and `DigestSettings`.
4. Door B reuses `CopyAgentPrompt`; the consent screen is untouched.
5. The AI notice is new copy on one panel. It replaces the stale F4 text; legal basis unchanged (EU AI Act Art. 50, GDPR Art. 13).

Nothing here changes spending authority: the grant is the same grant, the rules are the same numbers, and consent to an assistant still grants abilities, never limits.

## 5. Decisions, and what is still open

Jonas decided the first five on 11 Sep 2026, 21:00 CEST:

1. **The notice is a notice.** "Continue" is the acknowledgement; nothing is signed or stored beyond `setupSeenAt`.
2. **Digest Off by default.** Later, the same digest may also go to the assistants that invoked Froggy — an agent-facing digest over MCP rather than a person-facing message. Not in this flow; noted so the digest is built with a second audience in mind.
3. **Door choice is not stored.** The door only picks the last screen of setup. Home looks the same for everyone; whether a person "has an assistant" is read from Connections (is one connected?), not from what they clicked on day one. Recorded as the default because it is the simplest reading of "I do not understand" — if Home should lead with the connection card for assistant people, say so and it becomes one stored field.
4. **No guest path.** The guest door comes off the sign-in board. A **demo path for the jury** is the thing to consider instead: a reserved demo account (the `DEMO_USER_DID` seat exists at HEAD, with a reserved browser seat, no money) that judges can open from the submission. Open question for that path: do judges see this onboarding, or land on Home with the rules already granted and a small balance? The three-step flow is short enough to show; the grant needs a Privy prompt the judge would have to click.
5. **"Spending rules" wins.** The Wallet board in Paper now says "Spending rules today" instead of "Today's allowance"; the onboarding boards already said it. "Allowance" stays out of UI copy per ADR 0011.

Still open:

6. **The rules are not fully wired at HEAD** (`ADR 0019:5`, review items B-02/B-03): edits reach Privy but not the live mandate until the next hydrate. The step-2 copy states the rules the product promises; the fix is engineering's.
7. **The bot's name.** The pairing panel names `@FroggyBot` because a reader with a copied command needs to know where to paste it; substitute the real handle.
8. **The Wallet board's numbers.** It still shows the earlier design's caps ("$0.12 of $10.00", "Per call ≤ $0.05"); the onboarding boards use the built defaults ($2.00 a payment, ask above $1.00). The Wallet board should follow when it is next touched.

## 6. What the two reviews changed

The cold read (a person who uses ChatGPT and Revolut and has never held a crypto wallet) would have finished the draft flow but scored it 6/10, and every confusion was in the fine print: "$1.00 asks you above" read backwards; the rules screen never said the balance was zero; "Privy", "our host", "the prompt", "export a key" and "your directory" meant nothing; "One tap" on a laptop; "Go to Home" on a screen that looked like home; "Pay by card" read as paying for something; a euro among dollars; three exits on one screen. The design audit added: the digest pre-selected 08:00 against a product default of Off; the composer's lime border broke the token rule; two green primaries on the Telegram step; the leash glyph read as a phone handset; headings jumped between steps; the first starter could not succeed on an empty balance.

All of that is fixed on the published boards. Two findings were judged and kept as drawn: the needs-user pose on step 3, because the step is literally about the moment Froggy needs you and the token rule governs the lime halo, not the pose; and the "Your assistant — Later" lane for door A, because it is the one place the second door is advertised to a person who chose the first.
