# Stubs

## Summary

Every external service Froggy depends on has a stand-in, so the whole product runs before any key arrives. That is a convenience. The thing that matters is the rule attached to it: **a stub is loud, and it is loud in the data before it is loud in the interface.** Every receipt a stub touches carries `stubbed: true` as a field, not as a label — so a screenshot of a stubbed run cannot be presented as a settled payment, and a run that could pass for real is the one failure mode this entire design exists to prevent.

There is a second rule that most people meet first, and it is stronger: **a public deployment cannot boot stubbed at all.** Stubs are a laptop and a test runner, not a state a person on the deployed workspace can be in.

This document is what a stub changes about what the user sees, everywhere, and what no stub can ever stand in for.

## One place decides, and it decides by placeholder

`apps/server/src/environment.ts` is the only place in the codebase that branches on an environment variable. Nothing else asks. If anything else did, "is this real?" would have as many answers as there are call sites, and the interface could not be trusted to know.

The test is not "is the variable set" but "does it still hold the placeholder from `.env.example`". A copied example file behaves identically to no configuration at all, rather than producing a confident client pointed at a nonsense key.

Half-configured is never half-live. Hedera needs both an account and a key — an account with no key cannot sign and a key with no account cannot be addressed. Telegram needs both the bot token and the webhook secret, because a bot that answers unverified webhooks is a bot anyone on the internet can answer approval cards through. Either half missing and the whole integration is a stub.

Ten integrations report a mode this way — the model, Privy, Hedera, the database, The Graph, the browser, Telegram, and the three market-data providers — and five trading venues report a third value, `unavailable`, meaning there is no adapter at all rather than a fake one. Every one of them is printed at boot, one name and one mode per line, on the principle that silence about a stub is a trap.

> Technical note: the modes are published to the browser in the session's welcome message, so the interface knows what is stubbed from the moment it connects rather than inferring it from what comes back. `/health` reports the same table to anyone who asks.

## A public origin refuses to boot stubbed

If any integration would attach a stub adapter and the app's origin is not a loopback address, **the server does not start**. It throws, naming the origin and listing the stubbed integrations.

This is the single most important fact in this document. It means:

- On the deployed workspace, a missing credential is a refused deployment or an `unavailable` capability. It is never a fixture that could be screenshotted as a settlement.
- Stubs exist for a keyless laptop and for the Playwright suite, which run on loopback and are allowed them.
- The two simulated trading venues are demoted to `unavailable` rather than `stub` on a public origin, so a public deployment never advertises a simulated venue even in a list.

Everything below — every badge, every "fixture", every "Simulated" — is therefore what a person sees on a **local** build. On the deployed app they should see none of it, and seeing any of it is itself the finding.

## What a stub changes, surface by surface

**The top bar.** A badge reading "3 stubs" in the agent-amber role every stub in the product wears, with a hover title naming them and the sentence "Nothing here is a real settlement." When Privy is stubbed a second badge reads **local identity**, so a development sign-in cannot be mistaken for a login.

**The first-use screen.** Under the wallet peek: "This build uses a simulated agent and marks its receipts."

**A tool card in the conversation.** The word `fixture` in the machine typeface, beside the call's summary.

**A Graph answer.** Beside "3 of 4 indexes fresh", the phrase "· recorded fixture, not a live index" in the stub colour, in the same line as the number the agent acted on.

**The model's own input.** The Graph tool's text ends with `[STUB: recorded fixture, not a live Graph provider. Say so if you cite it.]`. The marker reaches the model, not only the person — so an answer that cites the number is instructed to say where it came from.

**The services directory.** A **Simulated** badge on the card, and the button reads "Try simulated · $0.10" rather than "Run · $0.10". The request form carries an alert headed "Simulated on this build." The result the provider returns begins "DEMO — " in its own text, so even a copied paragraph carries the mark.

**Purchases.** "Simulated payment" where a live one says "Paid", a **Simulated** badge on the detail, and "Simulated wallets" where the wallets are fixtures.

**Trades.** "Simulated · no funds move" on the review and the panel, "Simulated · no wallet funds" on positions, and each rule row labelled "Simulated" or "Live" beside its id.

**A receipt.** `stubbed: true` in the data. In the interface, the evidence line reads "Because 3 of 4 Graph indexes answered at a current block (a recorded fixture)".

**The browser pane.** With no provider key there is no browser: the pane refuses to open one and says so, rather than showing a page nobody is hosting.

## Stubbed is contagious

A receipt's `stubbed` is not set by the thing that wrote the receipt. It is carried up from whatever the payment touched, combined with **or**: a purchase is stubbed if its payment was stubbed or its receipt was; a service task is stubbed if the card was a demo or the signature was; a conversion is stubbed if Privy is; a row in the invocation trail is stubbed if the database is.

The consequence is the one worth knowing: **there is no way to end up with a clean-looking receipt that has a faked leg inside it.** One stubbed step anywhere in the chain marks the whole record, permanently, in the field a reader checks rather than in the label a screenshot crops out.

## What a stub does not change

**The leash is never stubbed.** It is local arithmetic over local rules, so a refusal on a stubbed build is a real refusal, produced by the real engine, for the real reason. That is what makes the refusal demo honest: what is faked is the settlement underneath, and the receipt says so.

**A run is a real run.** It takes turns from the model budget, writes history, produces receipts, and can be stopped, frozen, detached from and resumed. Nothing about the shape of a run tells you whether it was real. Only its receipts do — which is exactly why the marker is on the receipt.

## What no stub can stand in for

Three things have no substitute, and each has to happen against real credentials before anything is claimed:

1. **A Graph query returning numbers that change between runs**, from a live Subgraph Studio key. Mocked data explicitly disqualifies the Graph track; a fixture is by definition the same number twice.
2. **A real Hedera transaction id from a paid request, resolving on a mirror explorer.** A transaction id that only exists inside Froggy proves nothing to anyone outside it.
3. **One live Privy financial flow.**

From this follows the verification rule that overrides the ordinary one in this repo: **a stubbed run never counts.** A claim about money, provenance, or a live service is verified only against real credentials, however green the local suite is. See [verification](../verification/README.md) and `.agents/skills/froggy-verification`.

## Variants

| Variant | Set before asking | Changed while it runs |
| --- | --- | --- |
| Who is asking | The same modes for everyone. A person sees badges and the word "fixture"; a connected agent gets `stubbed` as a field on the task, the purchase and the receipt it reads back. Telegram carries the receipt's own words. | Cannot change. Modes are fixed at boot. |
| The policy in force | No effect. [The leash](../foundations/the-leash.md) is never stubbed and judges a stubbed spend exactly as it judges a real one. | No effect. |
| Funds available | A stubbed payment does not move funds, so a stubbed build cannot run out. The balance it shows is not money. | No effect. |
| What is being asked for | Decides which integrations are touched, and so which markers appear. A free answer on a stubbed build may carry no marker at all. | The marks appear as each call lands, mid-turn. |
| The asking agent's grant | No effect. No scope hides or reveals a stub. | No effect. |
| The shared browser | With no provider key there is no browser at all, so a browsing request cannot be demonstrated rather than being demonstrated falsely. | No effect. |
| Appearance and motion | Markers wear the agent-amber role in both looks and are words as well as colours. | No effect. |

## Cancel and interrupt

| Event | On a stubbed build | What is left |
| --- | --- | --- |
| Stop — the person halts this run | Identical to a live build. The run ends; what it "spent" stays on the ledger, marked. | Receipts carrying `stubbed: true`. |
| Freeze — the wallet is frozen, mid-run | Identical. A stubbed spend attempted while frozen is refused with `frozen`. | A refused receipt, marked. |
| Denying a waiting approval, or leaving it unanswered | Identical. The four answers and the three unanswered endings behave the same. | The answer is recorded on the receipt as usual. |
| Asking something else while this request is still in flight | Identical. The new run supersedes the old. | No difference. |
| Leaving the page, or switching to another conversation, mid-run | Identical. A stubbed run is still the server's. | The marks are in the replayed part too. |
| Reload; the tab or the app closed | Identical. Modes are re-delivered on connection, so the badges come back. | No difference. |
| Network lost; the socket drops | Identical. | No difference. |
| The model, a service, or the facilitator errors or rate-limits mid-run | A stubbed provider does not rate-limit, so this path is the one thing a stubbed build cannot exercise. | Nothing. |
| The session expires, or the person signs out | With Privy stubbed there is no real session to expire; the local identity walks straight back in. | The **local identity** badge. |
| The policy or a cap changes mid-run | Identical. Policy edits are not stubbed. | No difference. |
| Funds run out mid-run | Cannot happen; nothing is drawn down for real. | Nothing — and this is a gap, not a feature. |
| The person takes control of the shared browser mid-run | There is no browser to take when the browser is stubbed. | Nothing. |
| The same account open in a second tab or on a second device | Identical. Both tabs get the same modes and the same badges. | No difference. |

## Interactions with other systems

**The leash.** Never stubbed. See [the leash everywhere](the-leash-everywhere.md).

**Money and receipts.** The receipt is where the mark lives and the reason the mark exists. See [money and receipts](money-and-receipts.md) and [money](../foundations/money.md).

**Approvals.** Unaffected. A stubbed spend still asks when it is over the line, and the answer is still recorded. See [approvals](../workspace/conversation/approvals.md).

**Provenance.** This is the concern stubs bear on most. A stubbed settlement has no chain behind it, so nothing about it is provable; see [provenance](provenance.md). A transaction id that resolves on a mirror explorer is the only proof that counts.

**History and persistence.** With the database stubbed, history is in memory and does not survive a restart — and every row it produces is marked stubbed for that reason.

**The shared browser.** No provider key, no browser. The pane says so rather than pretending. See [the shared browser](../foundations/the-shared-browser.md).

**Connected agents and grants.** An agent reads `stubbed` as a field on what it fetches, so an agent is no more able to mistake a fixture for a settlement than a person is. See [identity and agents](../foundations/identity-and-agents.md).

**Notifications.** A stubbed Telegram sends nothing at all; the pairing card reports that it is not configured. A stubbed run's own outcomes still appear in the workspace.

**Navigation and URL state.** Nothing about stubs is in the URL, and there is no way to ask for a stubbed view of a live deployment. See [url state](url-state.md).

**Appearance, motion and accessibility.** Every mark is a word as well as a colour, so a stub is legible to a screen reader and in a screenshot. The exception is the top bar's count, whose list of names is a hover title; see [accessibility](accessibility.md).

**Offline and reconnection.** The modes arrive with the rest of the state on every connection, so a reconnecting tab cannot come back without its badges. See [offline and reconnection](offline-and-reconnection.md).

**Stubs.** This document is it.

## Edge cases

- **The top bar's count omits the five trading venues.** They are counted for the boot refusal but are not part of the mode table the badge reads, so a build can show "0 stubs" while a venue is simulated. The trading surfaces mark themselves, so nothing is unmarked — but the count is not the whole answer.
- The list of which integrations are stubbed is a hover title, so on a touch device the count is the only thing available.
- A stubbed build with no Graph key still produces a receipt with evidence, deployments and block numbers — plausible-looking numbers, marked as a fixture in one phrase inside a collapsed disclosure.
- The `[STUB: …]` note asks the model to say so if it cites the number. That is an instruction to a model, not an enforcement, and it is the one marker in the product that can be ignored by the thing it is addressed to.
- QuickNode counts as stubbed when no RPC endpoints are configured, which means a public deployment with no RPCs configured refuses to boot rather than degrading.
- A stubbed build cannot demonstrate running out of money, a rate limit, or a failed settlement, so the recovery paths for all three are the least exercised in the product.
- The mark on a receipt is permanent. A receipt written on a stubbed build stays stubbed forever, which is correct and means a database carried from a local build into a live one keeps its fixtures visibly separate.

## Open questions and verification

- **The wallet pane does not mark stubs.** Both `AGENTS.md` and the header comment in `environment.ts` say "the wallet pane shows a chip per stubbed integration"; in the tree at this commit the marker is one aggregate badge in the top bar, and the wallet pane carries no stub chip at all. The marker moved and the comments did not. Worth treating as a documentation defect at least, and possibly as a regression — the wallet is where a person looks at money.
- Whether the deployed workspace is in fact fully live was not checked. The boot refusal makes it true or makes the deployment dead, but which of those is the case at any moment is a question for `/health`, not for this document.
- The exact set of badges a person sees on a keyless local build was assembled from the components; it has not been observed all at once.
- Whether a connected agent is told the modes anywhere before it makes a call — the way the browser is told in the welcome — was not established.
- Whether a stubbed receipt is visually distinguishable in the wallet list, as opposed to inside the evidence disclosure, was not established.
- No specification in `e2e/` asserts that a stub marker is present; the suite runs on a stubbed build throughout and takes the fixtures for granted.

Verified against the Froggy tree at commit `5caed50`.
