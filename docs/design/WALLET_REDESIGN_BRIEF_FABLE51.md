# Wallet screen — redesign brief

A brief for redesigning `/wallet` in Claude Design against the **Froggy Design System** project, and the handoff record for whoever implements it. Written 8 September 2026 against `ffca8fe`.

Use it in two directions: paste the brief into Claude Design as the screen's context, and keep it beside the resulting screens so the team can see which change answered which finding.

## How to run the design pass

1. Open the **Froggy Design System** project in Claude Design. It carries all 113 `@froggy/ui` components with their real props, the compiled tokens, the three faces, and the composition rules in its `README.md` — including the _Composing a screen_ section, which is the page-level contract this brief assumes you have read.
2. Give it this brief plus the current captures listed below.
3. Design the four states, at 1440 and 390 at minimum.
4. Save the resulting JSX beside this file as `WALLET_SCREEN_FABLE51.jsx`, one exported component per state.

## Decisions that are already locked

These come from [Iteration 3](../plan/ITERATION_3.md) and are not open for redesign. A design that reopens one is wrong even if it is better.

| Locked | What it means for this screen |
| --- | --- |
| Spending limits are hidden | No caps, no allowance meter, no "$4.80 of $25.00" progress. Default mandates have no caps and the controls were deliberately removed. The policy engine still exists; the person does not see it here. |
| One balance | One dollar total — USDC on Base plus HBAR on Hedera at the mirror-node rate. Not two balances, not a per-chain hero. |
| Details behind a disclosure | The chain-by-chain breakdown stays collapsed by default. |
| Funding is address-first | Send-to-address is the primary path because it always works; card through Privy is the convenience and comes second. |
| Five workspace pages | Chat, Wallet, Services, Agents, Settings. The rail and tabs are not yours to redesign. |
| An unknown balance is not zero | Never render a missing balance as `$0.00`, and never quietly drop it from the total. |

## The screen today

`apps/web/src/routes/wallet-page.tsx` — a `Page` shell at `max-w-4xl` holding two sections:

- **`WalletHome`** — a `bg-card` hero: wallet icon chip, a `USDC + HBAR` machine label, "Your wallet", the total in `text-money` at 32/48px, one explanatory line, an _Add funds_ dialog trigger and a _Connect an agent_ link, then a collapsed _Where it is_ disclosure.
- **`WalletActivity`** — an "Activity" heading over `ReceiptTicket`s, newest first, or an `Empty` block.

Current captures, committed by the team on 7 Sep:

- `docs/evidence/ui-review-2026-09-07/after/wallet-1440.png` · `wallet-768.png` · `wallet-390.png` · `wallet-320.png`
- `wallet-breakdown-1440.png` · `wallet-breakdown-390.png` — the disclosure open
- `add-funds-1440.png` · `add-funds-390.png` — the funding dialog

## What is wrong with it

1. **Desktop is mostly empty.** At 1440 the content stops around 740px with a quarter of the viewport unused below it, and the hero is a short card floating in a wide column. The screen has one number and two buttons where it has room for the whole story.
2. **The default state is a failure state.** In the stub identity every visitor and every demo sees **"Total unavailable"** set 48px in the display face — the largest, boldest, most confident thing on the page is an absence. The explanatory line under it is correct and nobody reads it, because the headline already said the wallet is broken.
3. **The agent is invisible.** This is an agentic wallet and nothing on the wallet screen mentions an agent, except a button offering to connect one. Neither driving colour appears. A person cannot tell from this screen whether something else can spend their money right now.
4. **The house vocabulary is absent.** `Ticket`, `DrivingRing`, `DrivingDot`, `Marker`, `Badge` — the components that make Froggy look like Froggy — appear only once the activity list is non-empty. The empty screen is a generic card on paper.
5. **The empty state is a 200px dashed rectangle** that says nothing will be there until something is. It occupies more area than the wallet itself while carrying less.
6. **The two buttons are unranked.** _Add funds_ and _Connect an agent_ sit side by side at equal weight, but they belong to different jobs — one funds the wallet, the other hands it to an agent — and the screen never says which comes first.

## The thesis: the data already exists

The most useful finding for whoever implements this. `WalletSummary` already carries the agent-facing facts, and **the wallet screen renders none of them** — they surface on Settings, inside a chat card, or nowhere at all. Verified against `apps/web/src` at `ffca8fe`:

| Field | Type | Rendered today | Available to this redesign |
| --- | --- | --- | --- |
| `totalUsdMicros` | `int \| null` | The hero figure | yes — keep as the hero |
| `balances.usdcUnits` / `hbarTinybars` / `usdMicrosPerHbar` | `string \| null`, `finite \| null` | The disclosure | yes |
| `address`, `hederaAccountId` | `string \| null` | The disclosure, the funding dialog | yes |
| `agentSigner` | `"granted" \| "pending" \| "absent"` | **Settings only** | **yes — whether an agent can spend at all** |
| `agentNote` | `string \| null` | **Settings only** | **yes — why it cannot, in its own words, shown verbatim** |
| `windowSpentUsdMicros` | `int` | **A chat-stream card only** | **yes — what has been spent this window** |
| `ledgerNote` | `string \| null` | **nowhere in the app** | **yes — set when spend history could not be read** |
| `balanceLabel` | `string` | MCP text only | yes — the words for a total that has no figure |
| `pocketUsdMicros` | `int \| null` | The disclosure, when held | yes |
| `signerAddress` | `string \| null` | Settings only | probably not — the money address is the one that matters here |

So the redesign needs **no new backend work and no new endpoint**. Every fact below is already in the payload the page receives. That is the difference between a mockup and something the team can pick up.

Two of these deserve emphasis:

- **`agentSigner`** answers the question this product exists to answer — _can something other than me spend this money?_ — and it is currently three clicks away on Settings. On the wallet screen it is a `DrivingRing` or a `Marker` in the agent's amber, with `agentNote` as the verbatim explanation when the answer is no.
- **`ledgerNote`** is documented in `packages/protocol/src/app.ts` with the exact reason it matters: _"a wallet reporting `$0 spent` because the database is unreachable looks exactly like one with a full allowance left."_ The app renders it nowhere. Any spend figure this screen shows must carry it when it is set.

## What the redesign must do

- **Fill the desktop column** without inventing content. The material is the table above.
- **Give "Total unavailable" a proportionate treatment.** It is a real and frequent state, but it should read as _waiting on a chain_, not as _your money is gone_. `balanceLabel` carries words for exactly this case.
- **Put the agent on the money screen** in the driving language: amber for the agent, blue for the person, `DrivingRing` / `DrivingDot` / `Marker` over prose.
- **Rank the two actions.** Funding and connecting an agent are sequential, not parallel.
- **Make the empty state earn its space** — say what will land here and how to make that happen, sized to its content.
- **Keep the receipt as a `Ticket`.** Refusals keep `stamp-refused`; a refusal is the product working.
- **Keep `text-money` + `tabular-nums` on every figure**, and `MorphText` on any figure that updates live.

## The four states to design

| State | Condition | Must show |
| --- | --- | --- |
| **Unavailable** | `totalUsdMicros === null` | The `balanceLabel` words, whichever chain balances _did_ answer, and that unavailable is not zero. This is the demo default — design it first, not last. |
| **Funded and idle** | A total, `agentSigner: "absent"`, no receipts | The figure, the agent not yet holding a signature with `agentNote`, and the funding → connect sequence. |
| **Working** | A total, `agentSigner: "granted"`, receipts present | The figure, the agent in amber, `windowSpentUsdMicros`, and the receipt tickets. The product's best state — this is the demo screenshot. |
| **Refused** | As above, with a `deny` receipt newest | The same, with the refusal stamped at the top of activity. |

Design 1440 and 390 for each; check 320 for overflow. Loading is `Skeleton` on the figure, not a spinner over the page.

## Out of scope

The nav rail, the bottom tabs, the top bar and its identity chips. The funding dialog's internals — the team reordered it two commits ago at `ffca8fe` and it is settled. Spending controls of any kind. Anything needing a new API field.

## Handoff

For each state, the team gets the JSX using real `@froggy/ui` imports, plus one line naming the finding above that it answers. Implementation should be composition and wiring against fields that already arrive in `WalletSummary` and `Receipt`; anything that is not is a signal the design drifted out of scope, and worth raising before it is built.
