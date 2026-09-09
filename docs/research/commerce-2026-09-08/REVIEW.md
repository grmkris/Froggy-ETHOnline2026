# Froggy commerce, shared browsing, and card payments

Froggy can bring trading, shopping, and paid agent tools into one workspace: a person gives an agent a persistent job, watches it work in a shared browser, and sees what it spent and accomplished. The strongest initial audience is crypto-native people who already combine wallets, market research, social feeds, and online services. Coding-agent users are a natural second entry point into the same capabilities. This is a product recommendation, not a measured market-size or demand claim.

The recommended architecture keeps Bun and Froggy's durable task system, evaluates Browser Use as a browser driver, uses typed APIs for swaps and bridges, and delegates card credential storage to a suitable payment provider. Anthropic's commerce reference contributes useful interaction and enforcement patterns. It does not supply a working payment processor or an agent that buys from arbitrary websites.

The immediate product opportunity is a visible, persistent instruction such as “watch this launch,” “compare these products,” or “prepare this purchase.” Shopping should remain a first-class use of the shared browser. Launch watches, public profiles, and external coding agents can share the task history, evidence, and permission system without requiring every workflow to pass through a web page.

**Recommended decisions**

| Question | Recommendation | Evidence or condition |
| --- | --- | --- |
| Replace Bun with Browser Use? | Keep Bun; evaluate Browser Use behind the browser boundary. | Runtime, browser hosting, and agent control are separate choices. |
| Run Browser Use on the existing browser? | Prototype an authenticated CDP integration before committing. | The current Bun.WebView transport is not the documented Browser Use attachment interface. |
| Charge x402 for browsing? | Sell a bounded, durable browser task with explicit service pricing. | Merchant payment and any upstream browser charges need separate accounting. |
| Swap and bridge using the browser? | Prefer typed Uniswap and Circle integrations; display progress beside the browser. | Exact routes and transactions are easier to validate outside page interaction. |
| Fund an existing MetaMask Card? | Link its funding address and check which network/token the card actually uses. | Linea may be unnecessary if the card can spend existing Base USDC. |
| Save card details in Settings? | Embed a provider-hosted collection form; retain its reference and display metadata. | Crossmint documents this pattern, but the specific MetaMask Card must be eligible. |
| Issue a new Froggy card? | Consider Privy/Bridge later. | This is a separate issuing program, not an import flow for the existing card. |

## Product shape and present capabilities

The proposed shared object is a **task with a standing instruction**: purpose, inputs, permitted actions, expiry, observations, and outcomes. A launch task might check a designated source periodically, record a candidate contract, validate it, then execute once under a previously established rule. A shopping task might compare offers, select an exact variant, prepare a cart, and hand over for payment verification. These are examples of intended behavior; scheduled observation is not a promise of immediate launch entry or a guaranteed fill.

Public profiles can publish selected tasks, observations, and transaction receipts. Wallet following can provide another observation feed: new positions, transfers, or activity matching a task's conditions. Following a profile should subscribe to its public activity. Copying a task should create a draft under the new owner's authority. Neither action should silently authorize trades. External coding agents can create and operate tasks through the same service interfaces, while the human controls permissions in Froggy.

The documented verified trading milestone provides market search and inspection, RPC reads, and unsigned Uniswap Classic quotes through durable service tasks. The implementation checklist places transaction execution, additional routing, positions, and persistent launch reactions in follow-on milestones. Execution code is also being added in the working tree; its presence does not establish that those flows are integrated, verified, or live. Capability claims should follow completion evidence rather than the appearance of a quote card or a new module. [Local implementation status](../../plan/TRADING_IMPLEMENTATION.md), [service guide](../../TRADING_SERVICES.md).

Froggy already has server-owned runs, receipt persistence, and human/browser arbitration. It also has deliberate browser/wallet dependency separation. Those are foundations worth retaining. Configurable spending caps are currently disabled by default following the recorded product direction; proposed task budgets would be an explicit addition, not a description of universal enforcement already present. [Current iteration direction](../../plan/ITERATION_3.md), [browser session](../../../packages/browser/src/session.ts), [dependency declaration](../../../tools/graph.ts).

The technical sponsor roles remain coherent: Privy provides wallet authority, Hedera settles paid services, and The Graph supplies indexed onchain evidence where a relevant dataset exists. Uniswap can serve the trading workflow independently of whether Froggy selects its prize track. Technical integration choices and prize nominations are separate decisions; provider access and live sponsor evidence still need their own validation. [Local sponsor and provider review](../../plan/SPONSOR_TRADING_APIS.md).

## Anthropic's commerce reference

Anthropic positions commerce agents around merchant and shopper experiences across retail, travel, telecom, and entertainment. Its public repository contains fictional ACME businesses and integration examples. The README explicitly states that checkout does not place an order or charge a card. It also labels the reference unmaintained. Treat it as a source of patterns, not a supported payment dependency. [1: Commerce solution](https://claude.com/solutions/commerce), [2: Repository README](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/README.md).

The architecture article recommends a coherent agent loop with progressively loaded capabilities and rich UI outputs. Froggy's analogue is one task context that can research, browse, quote, and explain, with bounded subtasks when useful. A separate “shopping agent,” “bridge agent,” and “card agent” need not each reinvent the customer's intent or acquire broad independent authority. [3: The anatomy of effective commerce agents](https://claude.com/blog/the-anatomy-of-effective-commerce-agents).

**Canonical facts in rich UI.** Presentation tools accept product identifiers and short explanations. Server enrichment resolves those identifiers against products returned in the session and supplies the displayed facts. The server also computes comparison values. Froggy should use the same pattern for offers, services, token observations, and trade quotes: model-selected record IDs, with amount, chain, address, freshness, fees, and status supplied by code. This prevents a plausible sentence from becoming the source of a displayed price. [4: Presentation schemas](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/shopping-agent/core/shopping_agent/tools/presentation.py), [5: Enrichment](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/shopping-agent/core/shopping_agent/enrichment.py).

For a backpack purchase, the useful display is a small comparison with actual variant, delivered price, return terms, and availability, plus the agent's reasoning. For a token purchase, it is an exact network and contract, source timestamp, liquidity observations, quote, and proposed spend. Unknown information should stay unknown. The model may explain why a choice fits; its explanation remains fallible even when the rendered numerical fields come from records. The reference itself distinguishes structured grounding from claims made in free text. [6: Safety model](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/docs/safety.md).

**The same executor for UI and tools.** In the examples, direct cart buttons use the same executor as agent calls. Cart gates check provenance, variant selection, and quantity limits. This is worth copying conceptually: a “Buy” button, a chat tool, and an external MCP caller should reach the same transaction validation and permission checks. A returned product or quote proves provenance, not permission to purchase it. Backend stock and eligibility checks must still be atomic. [7: Cart gates](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/shopping-agent/core/shopping_agent/gates.py), [8: Direct UI execution](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/examples/demo_common/storefront.py).

**Prepared changes and application-owned authority.** The merchant example stages a proposed change, reruns guardrails, and requires a host-written approval mark before application. Chat text saying “approved” does not create that mark. For Froggy, approval should bind the actual proposed operation: amount, recipient, item or quote identity, network, expiry, and relevant constraints. A standing rule can authorize matching actions; repeated pop-ups are not required merely because the action is automated. [9: Merchant apply gate](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/merchant-agent/core/merchant_agent/gates.py).

There is a consequential adapter caveat. The Managed Agents merchant MCP server disables its own host-approval requirement and instead relies on the hosting platform's permission manifest. A different MCP client would not inherit that platform's approval interface. Froggy must enforce financial authority inside its own server regardless of which coding agent connects. [10: MCP configuration](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/merchant-agent/managed-agents/merchant-mcp-server/merchant_mcp_server.py), [11: Agent permission manifest](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/merchant-agent/managed-agents/merchant-agent/agent.yaml).

**Checkout is an explicit handoff.** The backend interface can return hosted checkout URLs after the agent has prepared the cart; those URLs travel to the UI outside the model's response. It provides no card-charge method. Froggy can adopt that separation while adding a real payment integration: cart prepared, verification required, payment submitted, and merchant order confirmed are distinct states. A bridge transaction or successful card authorization alone cannot prove that a merchant accepted an order. [12: Backend interface](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/shopping-agent/core/shopping_agent/backend.py).

**Keep business state outside the transcript.** The integration guide assigns ordered workflows and idempotency to the backend. Its examples nevertheless use in-memory sessions, so they are not a durable recovery implementation to transplant. Froggy should retain persisted operation identities and reconciliation. Repeated intentional purchases also need distinct operation IDs; an identical cart does not always mean a duplicate request. [13: Backend integration guide](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/docs/backends.md), [14: Example session store](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/examples/demo_common/sessions.py).

**Use evaluations that match commerce failures.** The repository contains deterministic gate tests and instructions for deployment-specific behavioral evaluations. Useful Froggy cases include changed prices after approval, duplicate calls from external agents, injected payment instructions, expired quotes, missing variants, and human takeover during checkout. The existence of tests and evaluation instructions does not establish a measured agent completion or safety rate. [15: Cart gate tests](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/shopping-agent/core/tests/test_gates.py), [16: Evaluation authoring guidance](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/plugins/commerce-builder/commands/author-commerce-evals.md).

The main adaptation challenge is trust. Anthropic's examples assume a business supplies its catalog and backend. Froggy's shared browser visits arbitrary sites. An observed merchant total should carry source and timestamp, and be rechecked before submission; observing text cannot convert it into payment authority. Retain Effect Schema, versioned contracts, and browser/wallet separation rather than porting the Python framework wholesale.

## Browser Use, Bun, and the shared Chrome

Browser Use's open-source agent supports attaching to Chrome through a CDP URL. It runs in Python; Bun can remain Froggy's application runtime and communicate with a sidecar. Browser Use Cloud offers a remote API instead. Neither choice requires rewriting Froggy's task, wallet, or web application. [17: Browser parameters](https://docs.browser-use.com/open-source/customize/browser/all-parameters), [18: Cloud quickstart](https://docs.browser-use.com/cloud/quickstart).

The current integration is more specific than “a Chrome tab.” Bun.WebView owns Chrome through a debugging pipe, while Froggy wraps its commands, events, snapshots, and human input. It does not expose the ordinary CDP endpoint documented for Browser Use. The popup workaround also recreates a target and loses opener relationships, which matters for OAuth and payment flows. These are concrete integration constraints, not proof that Browser Use is better. [Local CDP adapter](../../../packages/browser/src/cdp.ts), [Chrome launch notes](../../../packages/browser/src/chrome-detect.ts), [popup handling](../../../packages/browser/src/popups.ts).

| Option | What stays in Froggy | What changes | Main decision criterion |
| --- | --- | --- | --- |
| Current Bun.WebView integration | Browser hosting, controls, screencast, arbitration, application | Improve specific browser limitations | Can it complete representative shopping and authentication flows? |
| Browser Use open source with owned Chrome | Application, wallet, task history, potentially the same browser stream | Python driver and supported CDP hosting/control integration | Can every agent action obey Froggy's human takeover and credential boundaries? |
| Browser Use Cloud | Application, task contract, wallet policy | Provider hosts browser and executes the agent | Do persistence, handoff, costs, and data handling fit the product? |

Cloud live preview can be embedded and interactive. Its human-in-the-loop documentation describes stopping the agent and continuing with a new run in the same session. That is useful, but does not by itself demonstrate Froggy's existing immediate human-priority behavior. A second unrestricted CDP controller could also bypass the local input gate. Any new driver must relinquish control when the human takes over and must not resume until the application grants it again. [19: Live preview](https://docs.browser-use.com/cloud/browser/live-preview), [20: Human handoff](https://docs.browser-use.com/cloud/agent/human-in-the-loop).

The recommended decision experiment is a small comparison on the same representative tasks: selecting sizes and variants, maintaining a cart, login popups, payment iframes, human takeover, reconnecting after interruption, and receiving an order confirmation. Measure completion, intervention count, latency, cost, and information exposure. Start with non-purchasing tasks and merchant test environments. Evaluate the browser driver separately from the payment executor so one provider's success does not obscure another layer's failure.

## Charging x402 for browser tasks

Froggy already contains an x402 browser-task seller: POST /api/tasks accepts a browse task, assigns a durable identity, handles idempotent retries, and caps the run at 40 steps. The code prices this at $0.50, charged in HBAR at the mirror-node rate. It explicitly records paid tasks that subsequently fail without implying a refund. This is code-present capability; live service delivery is a separate verification question. [Local task seller](../../../apps/server/src/tasks.ts).

That service can use a different browser driver without changing its commercial identity. The proposed extension is a richer shopping contract: “research these products and prepare a cart,” with precise inputs, status retrieval, explicit termination conditions, and a bounded result. Pricing should state whether it buys execution time, a defined deliverable, or another measured unit. Charging a service fee must not imply that the merchant purchase price is included.

Browser Use already documents x402 access using Base USDC. Its flow funds service credits when needed, while status requests authenticate without another payment. The guide explicitly names API v2 and v3; the current cloud quickstart uses v4. Compatibility between v4 and x402 needs a direct integration check. The guide also describes insufficient credits terminating a running task rather than pausing it for a later top-up. [21: Browser Use x402 guide](https://docs.browser-use.com/cloud/guides/x402).

For Froggy, keep three records distinguishable: the customer's payment for the Froggy task, Froggy's supplier cost if it buys browser execution, and the customer's payment to the merchant. A funding transfer or bridge is another movement of principal with its own fee and status. This avoids counting one shopping experience as a single opaque “spend.” Upstream Base payments and Froggy's Hedera service settlement are separate legs; using both does not require a bridge inside every request.

External coding agents should receive narrow browser-task tools with owner isolation, idempotent creation, cancellation, and result retrieval. They should not receive the shared browser's unrestricted control endpoint or card secrets. The commercial advantage is a persistent, inspectable task with a wallet and browser already connected; a generic browsing API alone is easier to substitute.

## Uniswap, bridging, and MetaMask Card funding

Swaps and bridges should normally execute through typed integrations while the browser remains available for research and human review. The current Uniswap API supports cross-chain and multi-step “Chained Actions,” with quotes, plans, ordered actions, and status updates. The application still executes wallet actions and handles confirmation. Froggy's existing Classic quote adapter does not implement that lifecycle. [22: Chained Actions](https://developers.uniswap.org/docs/trading/swapping-api/concepts/chained-actions).

Linea appears in Uniswap's supported-chain documentation. That does not prove a particular Base-to-Linea token pair is bridgeable through the API: inspect supported tokens and obtain the exact quote before choosing the route. A route must preserve the intended output asset, recipient, fee limits, and execution conditions across every step. [23: Supported chains and tokens](https://developers.uniswap.org/docs/trading/swapping-api/supported-chains).

For native USDC funding, Circle CCTP supports Base and Linea. A proposed transfer can burn on the source network and mint to the person's designated MetaMask address on the destination. A fixed recipient does not require importing that recipient's private key into Froggy. Circle also documents destination forwarding for Linea, which may simplify minting and gas delivery; source authorization, fees, and recovery still need implementation. [24: CCTP domains](https://developers.circle.com/cctp/concepts/supported-chains-and-domains), [25: Technical guide](https://developers.circle.com/cctp/references/technical-guide), [26: Forwarding service](https://developers.circle.com/cctp/concepts/forwarding-service).

The transfer should expose a durable sequence: source submitted, source confirmed, attestation pending, destination submitted, destination confirmed. Use current route fees and finality requirements rather than a fixed completion-time promise. A destination mint failure must not encourage a second source burn. [27: CCTP finality](https://developers.circle.com/cctp/concepts/finality-and-block-confirmations), [28: CCTP fees](https://developers.circle.com/cctp/concepts/fees).

There may be no reason to bridge. MetaMask's current funding documentation lists Linea, Base, Solana, and Monad, with supported assets depending on network. The actual card dashboard and regional eligibility determine what this particular card can spend. If it is already enabled for Base USDC, sending funds to that designated Base account is simpler than adding a Linea bridge. [29: MetaMask Card funding](https://support.metamask.io/manage-crypto/metamask-card/funding).

Saving a funding wallet address is useful for onchain monitoring. Label the result “wallet balance” or “eligible token balance,” not “available card balance.” Card limits, spending priorities, authorizations, exchange treatment, and issuer status can affect what a purchase can use. A wallet signature can establish control of an address; it does not establish that the card issuer associates that address with the supplied card. No public issuer integration establishing that link was identified in the cited documentation. [30: Managing MetaMask Card](https://support.metamask.io/manage-crypto/metamask-card/managing/).

Privy authority over a Froggy-controlled wallet governs its outgoing funding transactions. Once funds reach an independently controlled MetaMask account, subsequent card charges follow the card's authorization system. The interface must not imply that a Froggy wallet rule automatically constrains all purchases made with that card.

## Existing-card Settings and alternative providers

The desired interface is reasonable: **Settings → Payment methods → Add existing card**, with a separate linked funding address. The appropriate implementation is provider-hosted credential collection. Froggy stores the provider's payment-method reference and permitted display metadata, while the provider manages the reusable underlying credential.

A generic database field for reusable card number, expiry, and CVC would create avoidable credential exposure. PCI's merchant guidance prohibits retaining a verification code after authorization, including encrypted retention. Scope and issuer exceptions require care, so this is an architecture recommendation rather than a claim that every form of CVC storage is universally illegal. Froggy should use a provider designed for this flow. [31: PCI SSC verification-code guidance](https://www.pcisecuritystandards.org/faqs/are-merchants-allowed-to-request-card-verification-codes-values-from-cardholders/).

**Crossmint is the closest documented candidate for an existing card.** Its hosted payment-method component collects card data directly and returns a paymentMethodId. Saving does not authorize spending. Froggy can retain the desired Settings experience while keeping raw enrollment data away from its server. [32: Save a card](https://docs.crossmint.com/agents/payment-methods/cards/save-card).

Registration then reports available payment rails, including Mastercard AgentPay and Visa Intelligent Commerce, with enabled, pending, or error states. A Mastercard logo alone does not establish compatibility. No cited Crossmint source confirms support for this particular MetaMask Card issuer/BIN or its region, so eligible registration and production access are conditions for selection. [33: Register a card](https://docs.crossmint.com/agents/payment-methods/cards/register-card), [34: Agentic cards product](https://www.crossmint.com/products/agentic-cards).

The user verifies an order intent with amount, currency, expiry, and preferably a fixed merchant. The application can then request a bounded card credential for checkout. Crossmint instructs immediate use without logging or persistence; credential creation also consumes allowance capacity even when unused, so retries need reconciliation. The sensitive executor should fill that credential without sending it through the agent transcript. [35: Create an agent card](https://docs.crossmint.com/agents/payment-methods/cards/create-agent-card), [36: Retrieve secure card numbers](https://docs.crossmint.com/agents/payment-methods/cards/retrieve-agent-card).

Crossmint also offers agent checkout sessions with an interactive embedded browser, a maximum cost, and explicit user-action steps. This may accelerate checkout development, but the hosted browser is a separate provider session. It does not establish payment support inside Froggy's existing Chrome. Its payment step expects scoped credentials rather than a reusable card number. [37: Agent Checkouts quickstart](https://docs.crossmint.com/agents/agent-checkouts-quickstart).

**Stripe Link is another existing-wallet route where eligible.** Its agent CLI can request user-authorized payment credentials, including a one-use virtual card for checkout or a shared payment token for participating sellers. The cited product is restricted to US consumers, so it is not a general answer for an unspecified region. MetaMask Card acceptance as the underlying funding card also remains unverified. [38: Link CLI](https://docs.stripe.com/agentic-commerce/link-cli), [39: Pay online](https://docs.stripe.com/agentic-commerce/link-cli/use-link-wallet-pay-online).

**Privy with Bridge is a future card-issuing option.** The documented product issues new virtual or physical Visa cards backed by Privy wallets, using Bridge and Stripe Issuing. It requires guided program onboarding, Bridge KYB, Stripe setup, connected Issuing, credentials, and gas sponsorship. Its appeal is an integrated funding and card lifecycle. It does not import an existing MetaMask Card. [40: Privy cards overview](https://docs.privy.io/financial-flows/cards/overview), [41: Privy card setup](https://docs.privy.io/financial-flows/cards/pre-built-components/setup).

| Route | Existing MetaMask Card | Shared Froggy browser | Best role |
| --- | --- | --- | --- |
| Human completes card payment | Usable where the card and merchant already work | Requires verified private handoff or external checkout | Initial completion path |
| Crossmint saved card and agent credential | Eligibility unverified | Possible integration; secret entry must be isolated | First provider feasibility test |
| Crossmint hosted agent checkout | Eligibility unverified | Separate hosted session | Optional outsourced checkout |
| Stripe Link | Eligibility unverified; US consumer restriction | Temporary credential integration or supported merchant token | Region-specific alternative |
| Privy/Bridge issuing | Issues a new card | Separate checkout integration still required | Later Froggy card program |

Credential vaulting does not solve every exposure in an agent browser. When a person types a reusable card or the executor inserts a temporary one, agent screenshots, DOM reads, logs, network captures, and replay must respect the private step. A visual blur alone is insufficient. Until that isolation is demonstrated, external hosted checkout is the simpler completion path. Human verification such as 3DS should pause the task visibly and resume from observed state rather than guess that payment succeeded.

## Proposed delivery order

**First, prove the shopping interaction.** Build on the existing browser and task history: bounded research, canonical comparison cards, exact variant selection, a prepared cart, and an explicit checkout handoff. Add an observed order-confirmation record separate from payment and funding records. This establishes a useful experience even before automatic card entry or a new card program.

**Second, run two focused feasibility checks.** Compare browser drivers on the agreed shopping and handoff cases. Independently test whether the existing card can register with the candidate provider in the relevant region, using its supported enrollment flow. Avoid tying a browser migration to an unverified card-provider assumption.

**Third, add a single funding route.** Start from the card's actual enabled network and asset. Prefer a direct supported-token transfer when possible; add Base-to-Linea CCTP when required. Persist transfer identity before submission, reconcile after interruption, and show the difference between funds in transit and destination funds confirmed.

**Fourth, add scoped automatic checkout.** Bind a payment intent to the prepared purchase and merchant, obtain the temporary credential, isolate entry, support verification, and reconcile the merchant result. Card-provider failures and changing merchant totals need explicit outcomes. A task-level budget alone does not replace those controls.

**Fifth, extend the existing external-agent browser service with the completed shopping capability and public recipes.** Keep its x402 entry point and durable task identity, adding the richer shopping inputs, progress, and outcomes. Publish reusable task definitions without transferring their creator's credentials or spending permissions. The same structure can support launch monitoring after controlled trade execution and persistent watchers are delivered.

A convincing demonstration is: request a product with concrete criteria, watch the shared browser compare real options, inspect a server-populated purchase proposal, fund the eligible card network if necessary, complete the required payment verification, and see the merchant confirmation beside the spending record. A second client can retrieve the same task. The product reveal is that browsing, payment, and completion are inspectable parts of one persistent job.

## Evidence limits and sources

This review reflects documentation available on 8 September 2026 and local code at that time. Anthropic source references are pinned to commit fd4d59224ab96b43c6dc6888207c67b3bd5a24cf, dated 31 August 2026. The code review does not establish vendor completion rates, live card eligibility, funded bridge success, or production access. No purchases, provider enrollments, or live funds transfers are evidence for these recommendations.

The remaining decisions depend on specific evidence: the card's region and enabled funding network; provider registration and production approval; the exact Uniswap or CCTP route; Browser Use API-version compatibility; and measured human takeover, privacy, and recovery behavior. These are bounded integration questions, not reasons to discard the overall product direction.

The numbered links above identify the exact sources supporting each claim. Publisher and date metadata are recorded below; undated documentation entries were consulted on 8 September 2026.

| References | Publisher and source set | Date/version |
| --- | --- | --- |
| 1 | Anthropic, Commerce solution page | Undated live page |
| 2, 4–16 | Anthropic, commerce-agents README, source files, integration and safety guides, tests, and plugin evaluation guidance | Pinned commit dated 31 August 2026 |
| 3 | Ali Shazal and Matthew Koen, Anthropic, The anatomy of effective commerce agents | 2 September 2026 |
| 17–21 | Browser Use, browser configuration, Cloud quickstart, live preview, human handoff, and x402 documentation | Undated live documentation; x402 guide names v2/v3 |
| 22–23 | Uniswap, Chained Actions and supported chains/tokens | Undated live documentation |
| 24–28 | Circle, CCTP supported domains, technical guide, forwarding, finality, and fees | Undated live documentation |
| 29–30 | MetaMask Support, funding and managing MetaMask Card | Undated live support pages |
| 31 | PCI Security Standards Council, card verification-code FAQ | Undated live FAQ |
| 32–37 | Crossmint, saved cards, registration, agentic cards, order intents, credential retrieval, and agent checkouts | Undated live documentation/product page; examples include unstable APIs |
| 38–39 | Stripe, Link CLI and paying online | Undated live documentation |
| 40–41 | Privy, cards overview and pre-built card setup | Undated live documentation |
| Local links | Froggy, implementation plans, service guide, browser adapter, session, and dependency declarations | Working tree observed 8 September 2026 |

Anthropic's repository is Apache-2.0 licensed. Any copied implementation should retain applicable notices and identify modifications. The patterns recommended here do not require adopting its runtime or implying Anthropic support for Froggy. [License](https://github.com/anthropics/commerce-agents/blob/fd4d59224ab96b43c6dc6888207c67b3bd5a24cf/LICENSE).
