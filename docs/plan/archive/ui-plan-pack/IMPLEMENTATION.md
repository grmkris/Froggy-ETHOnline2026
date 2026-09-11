# Wallet UI implementation

The approved direction is deployed: **a calm wallet with a playful frog accent**. The product story is **a wallet for your agents: fund tasks, set spending limits, watch the work, and keep receipts**.

This work started from `a587f55`. The concurrent `56c9d34` bridge-record update changed only documentation and was preserved. This report now records the release candidate prepared after deployment was authorized. GitHub CI and Railway record the release outcome for its commit; the local verification below is complete.

## What changed

| Before | After | Why |
| --- | --- | --- |
| The first-use wallet participated in chat auto-follow and could start above the viewport. | A normal scroll container starts at the wallet. Chat keeps its existing conversation anchoring once a task begins. | The first action is visible without hunting or scrolling backwards. |
| Connect opened the default Policy tab. | Connect opens Agents; Wallet opens the wallet; Edit limits opens Policy. | Each action reaches the destination it promises. |
| Unknown balances became a complete-looking total; some unsettled receipts said paid. | Unknown amounts remain unavailable. Totals require known constituents. A receipt needs settlement evidence to say Paid. | Financial labels follow the available evidence. |
| Funding appeared in several places with a fixed top-up amount. | One funding panel separates adding wallet funds from requesting a chosen amount of task credit. | The user can understand what each step does and review its amount. |
| Failed agent setup could look empty; closing the panel lost the one-time skill. | List/create/disconnect errors have retries. Unacknowledged skill text survives closing in memory. Created credentials say Waiting for first use. | Setup remains recoverable without pretending an agent has connected. |
| Broad transitions, repeated entrances and duplicate progress tracks added movement. | One spending track; 125 ms feedback, 200 ms panels and 250 ms sheets; financial figures and frequent controls stay still. | Feedback is restrained and reduced-motion behavior is explicit. |
| Stop detached locally without verifying the server response. | Pending, Stop requested, No active run, and unconfirmed-with-Retry states use the decoded server response. | Local stream state cannot prove server cancellation. |

The palette uses the existing warm background, white cards and typography with a forest-green primary action. The existing frog mark is the accent. Main wallet actions and close controls have at least 44 px targets. On small screens actions precede the detailed balance breakdown; this keeps Connect visible at 320×568. Action handlers retain stable positions when balances arrive, fixing a press/release race found by the browser tests.

Copy feedback, wallet amount interpretation and receipt status have shared app-owned implementations. The oversized funding component was split into small components in the same file. No dependencies were added. A wording-only suggestions assertion was removed; policy, ledger, authorization, browser and other behavioral tests were retained.

## Browser evidence

These are deterministic local stub captures, not screenshots of a real funded account:

- [Desktop, 1440×1000](../../../evidence/ui-wallet/desktop.png)
- [Phone, 390×844](../../../evidence/ui-wallet/mobile.png)
- [Small phone, 320×568](../../../evidence/ui-wallet/small-phone.png)

All three were visually inspected. The browser checks also cover 768×1024, initial viewport position before clicks, enlarged desktop text, horizontal overflow, direct destinations, Escape/focus return, reduced motion, and page errors. Late wallet updates keep scroll position and action destinations stable. Setup checks exercise creation/list/disconnect failure, retries, clipboard denial and retained skill text. Funding checks cover zero/known/unknown balances, amount validation and retention of the requested state after a failed chat request. Stop checks force both HTTP and network failure, followed by an acknowledged retry. Existing approval, stream, authentication, split and pop-out flows pass.

Shared-component browser inspection confirmed the configured transition properties at normal and reduced motion. Primary white text measured approximately 6.20:1 contrast, with approximately 5.05:1 on hover. No performance improvement is claimed from these presentation changes.

## Verification

| Check | Result |
| --- | --- |
| `bun run check:fast` and `bun run check` | Passed after formatting the imported skills/notes and correcting skill metadata. |
| `bun run lint:types` | Passed across the repository. Subsequent test additions also passed scoped type-aware lint. |
| `bun run typecheck` | Passed all workspaces and tool/test projects; updated browser tests were checked separately. |
| `bun run graph` / `bun run names:check` | Passed. |
| `bun run agents:check` | Passed for all 15 repository skills. Full descriptions remain in their bodies; metadata now meets the existing limit. |
| `bun run test` | 384 passed, 0 failed across nine test-bearing workspaces; unchanged packages used valid Turbo cache results. |
| `bun run knip` | Passed. |
| `FROGGY_E2E_PORT=3310 bun run e2e -- --workers=2` | Full suite: 35 passed in the release run. |
| Earlier onboarding/agent run | 10 passed, including late-balance/funding and expanded list/disconnect recovery. These are included in the final 35-test suite. |
| `bun run build` | Both production builds passed. |

Browser configuration pins external services to stubs, uses the selected web port and its following API port, and refuses to reuse an unrelated running server. No live financial operation was performed. Release preparation fixed the imported Markdown formatting and skill metadata without weakening any gate. Machine-managed hooks and per-tool skill links are ignored; shared skills remain in `.agents/skills`. Existing Hedera custody variables are now preserved by the Railway infrastructure declaration. The production network settings were inspected: unset network variables retain Hedera testnet and Base Sepolia defaults.

## What remains

1. **Durable funding:** plan 002 step 8 is still open. An authenticated operation must bind a stable idempotency ID to the user and amount, correlate receipts, distinguish submitted/uncertain/confirmed outcomes, and recover partial allocation. The current panel requests the existing chat top-up and directs the user to its task/receipt. Neither model prose nor a provider callback is treated as a confirmed deposit.
2. **Live onboarding:** verify Privy initialization and the Base onramp with the configured provider, then the actual paid task and receipt journey. Existing testnet evidence and deployment records do not prove this new UI's live flow.
3. **Human review:** try the first task without coaching and on a physical phone, including the software keyboard. Browser device emulation and automated keyboard checks are the evidence available in this pass.
4. **Mainnet release:** follow the existing conditional cutover after the accounts are funded and a Blocky402 settlement is verified. The UI release does not change networks, move funds, or make the private repository public. Public repository access remains a submission requirement.

Plans 001, 003 and 004 are deployed. Plan 002's interface portion is implemented; its durable financial completion remains explicitly incomplete.

## Live release follow-up

The UI shipped at `6608fcc` with GitHub CI run `34062079388` green. The live desktop/mobile sign-in and Privy email form were exercised without page errors. Mainnet configuration and subsequent live findings are recorded in [the mainnet release evidence](../../../evidence/MAINNET_RELEASE.md). Final payment and Telegram fixes are being verified for the combined release with marketplace/MCP/CLI work.
