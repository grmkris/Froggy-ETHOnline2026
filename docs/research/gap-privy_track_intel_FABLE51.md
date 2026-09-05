Why: Privy is 2 of the 5 reachable prize lines and the custody core, yet the digest has zero evidence about past Privy hackathon winners or Privy devrel behavior, leaves the free-plan question technically 'refuted as an artifact' without a stated answer, and leaves the Telegram-bot-user vs web-login-user identity merge (the entire onboarding flow) unverified.

# GAP privy_track_intel

## Summary

Scope note: WebSearch budget was exhausted before this task started, so everything below came from curl/WebFetch of primary pages (privy.io, docs.privy.io .md sources, ethglobal.com showcase and prize pages, GitHub API, fxtwitter). X timelines could not be fetched.

1) PRICING (VERIFIED from raw HTML of https://www.privy.io/pricing). Developer plan is "Free, 0-499 MAU ... Access all of Privy's core features and get 50K signatures and $1M transaction volume for free every month." In the feature matrix, rows rendered with a check in BOTH the Developer and Enterprise columns include "Delegated access to wallets", "Native gas sponsorship", "Policy engine", "Key quorum approvals", "Custom onramps", "Multi-wallet accounts", and "Privy Developer Slack". Rows with a check only in the Enterprise column: "Webhooks", "Integrated fraud prevention (KYT)", "Premium SLAs", "Dedicated support", "Account manager"; "Advanced SSO" is "Available as add-on"; "Custodial wallets" shows a single check (Enterprise-only, INFERRED from cell layout). Docs confirm the one real gate that matters to you: "Manual approvals is an Enterprise feature. Reach out to sales@privy.io to request access for your app" (controls/dashboard/overview). The Intents API pages, stateful-policies page, signers pages and server-wallet pages contain no plan/sales gating language. Key quorums carry only an advisory tip: "Key quorums are an advanced feature. Reach out (https://privy.io/slack) to discuss." Stateful policies: aggregations only on eth_signTransaction and eth_signUserOperation, sum only, rolling windows 3600–259200 s. Note webhooks (incl. intent.executed) are not on the free plan, so poll instead.

2) IDENTITY (VERIFIED quotes; conclusion INFERRED with high confidence). The official recipe (docs.privy.io/recipes/telegram-bot) "bot-first" flow does exactly your onboarding: `privy.users().create({linked_accounts: [{type: 'telegram', telegram_user_id: telegramUserId}]})`, then `privy.wallets().create({chain_type:'ethereum', owner:{user_id: privyUser.id}, additional_signers:[{signer_id, override_policy_ids:[]}]})`, lookups via `privy.users().getByTelegramUserID({telegram_user_id})`. It states: "Later, the user can 'claim' their wallet by logging into a web or mobile app to send transactions and export their private key" and "Then, when users login to your app via Telegram, they can send transactions or export their private keys." The user-object doc says of the telegram linked account: "It cannot be linked to another user." The pregeneration recipe says: "When users log in for the first time after wallets have been pregenerated, the wallets automatically appear in their account." No sentence literally says "server-created Telegram user + web Telegram OAuth → same DID", but the whole bot-first recipe depends on it and no link step is described; treat as same user, no link step. Caveats: the GitHub starter (privy-io/examples/.../privy-node-telegram-trading-bot/index.js) is stale — it uses @privy-io/server-auth, `privy.walletApi.createWallet` with a mock DB mapping and never creates a Privy user; follow the recipe, not the starter. Also set dashboard embedded-wallet "create on login" to off so the React login does not mint a second wallet next to the server-created one (INFERRED risk). Telegram OAuth must be enabled under Dashboard > Login methods > Socials; the Telegram widget itself requires your web domain to be set on the bot via BotFather (Telegram requirement, not Privy docs).

3) PAST WINNERS (VERIFIED by fetching every Privy-tagged showcase page for each event and parsing "Winner of"). Privy sponsored: Agentic Ethereum (Feb 2025), Trifecta (Mar 2025), Cannes (Jul 2025), New York (Aug 2025), Buenos Aires (Nov 2025), New York 2026 (12–14 Jun 2026), ETHOnline 2026. Privy did NOT sponsor ETHOnline 2025, New Delhi 2025, Prague 2025, Taipei 2025, HackMoney 2026, Lisbon 2026 or Cannes 2026. Winners found: Agentic Ethereum — Agent 4 Your Mom (Best implementation of Privy's Policy Engine with Server Wallets; agent wallet + address-book whitelist), OSS-Rewards-Agent (Best consumer experience with Server Wallets; GitHub login + policy engine), The Game Show (same prize; Discord bot signing with server wallets). Cannes 2025 — PrivyCycle (Best Consumer App; also Cannes finalist), AstroFi (Best DeFi App Built on Privy; email+wallet login only). NY 2025 — ChainSpeed (Best Consumer App; gasless embedded wallets), Cosurf (Best App Involving AI; login only), Secret Pineapple (Best Financial App; login + smart accounts; also Graph Hypergraph 2nd). Buenos Aires — ArcBeam (Best Native Gas Sponsorship; embedded wallet + sponsorship + Circle CCTP). NY 2026 — Aragorn (Best onchain financial product, which required "Privy's Earn capability"; also World 1st, ENS 2nd). NY 2026 offered four $1,250 tracks (Earn product, universal deposit addresses, AI agent via Agent Wallet CLI, +1) and I found only ONE Privy badge across all 161 NY 2026 projects; Buenos Aires had three tracks and I found one winner among 41 Privy-tagged projects. Closest prior art to your onboarding, Deport The Dip (Cannes 2025: "Telegram bot + mini-app for one-click DeFi copy-trading with delegated wallets using Privy"), won nothing.

What Privy judges have rewarded before: shallow-but-clean integrations that use the exact feature named in the track (Earn for the "financial product" track, gas sponsorship for the sponsorship track, one policy rule for the policy track), wrapped in a polished consumer-grade demo that "hides crypto"; multi-prize, finalist-grade projects win disproportionately; agent-track winners were server-wallet agents with a whitelist/policy. Prize slots frequently go unawarded, so qualifying cleanly and writing the "how Privy was used" paragraph is most of the battle.

4) CONTACT (VERIFIED). https://privy.io/slack redirects to https://join.slack.com/t/privy-developers/shared_invite/zt-450dy7o0j-~li92mYt5cddJ6eXolgkXw (workspace privy-developers). Active Privy engineers on privy-io/examples (commits to 2026-09-03): madeleine-c (Madeleine Charity; co-author of the Agent CLI post), JoshNavi (Joshua Navi), ss-privy (Sina Sabet, X @sina_eth_), siddesh-privy, michaelessiet-privy (Michael Essiet), rodrigo-privy, toyurc-privy; tedim52 (Tedi Mitiku, X @drosmitiku, bio "@privy_io | @kurtosistech"). Blog authors: Debbie Soon (policy engine, nested key quorums, agentic apps guide), Ankush Swarnakar (intents, 21 Aug 2026), Vinny Mullin (agent access, 15 Jun 2026). ETHOnline 2026 Privy page lists no workshop/office hours; @privy_io has ~53.7k followers.

5) B2B framing. Track requires "at least one Privy control, such as policies, signers, key quorums, or intents". Usable without sales today: policies (incl. stateful), signers, key quorums (user+key quorums must be created via API), and the Intents API (`client.intents().rpc(walletId, rpcRequest)` → POST /v1/intents/{id}/authorize with an authorization signature, "with your app secret or with a wallet owner's user token"; auto-executes at threshold; 72h expiry). Enterprise-only: Dashboard manual approvals. The docs explicitly invite building "your own white-labeled approval experience" on intents. A <8h version: wallet owner = server P-256 authorization key held by your approval service; agent = additional signer with capped policy; on policy denial the agent proposes an RPC intent; the Telegram "Approve" button makes the server authorize it; Privy executes. Human-as-quorum-member with client-side user signatures is doable but riskier for the timebox.

## Claims

### [high] conf 0.9: Policy engine, key quorum approvals, delegated access (signers) and server wallets are all included on the free Developer plan (0-499 MAU, 50K signatures/month); only Webhooks, KYT, custodial wallets, SLAs and Dashboard manual approvals are Enterprise/sales-gated.

Evidence: Raw HTML of the pricing feature matrix shows data-framer-name="check" cells in both Developer and Enterprise columns for 'Policy engine', 'Key quorum approvals', 'Delegated access to wallets'; 'Webhooks' and 'Integrated fraud prevention (KYT)' have only one check. Docs: 'Manual approvals is an Enterprise feature. Reach out to sales@privy.io'. VERIFIED.

Sources:
- https://www.privy.io/pricing
- https://docs.privy.io/controls/dashboard/overview.md
- https://docs.privy.io/controls/key-quorum/overview.md

### [high] conf 0.8: A user created server-side with a telegram linked account and the same person logging in via Telegram OAuth on the web resolve to the same Privy user and wallet with no explicit link step.

Evidence: Recipe: users().create({linked_accounts:[{type:'telegram', telegram_user_id}]}) then 'Later, the user can claim their wallet by logging into a web or mobile app... when users login to your app via Telegram, they can send transactions or export their private keys.' User-object doc: telegram account 'cannot be linked to another user.' Pregeneration doc: wallets 'automatically appear in their account' on first login. Conclusion INFERRED from these VERIFIED quotes; no sentence states it literally.

Sources:
- https://docs.privy.io/recipes/telegram-bot.md
- https://docs.privy.io/user-management/users/the-user-object.md
- https://docs.privy.io/recipes/pregenerate-wallets.md

### [medium] conf 0.95: The official GitHub Telegram bot starter does not implement the user-linked flow (it creates ownerless server wallets and maps Telegram IDs in a mock DB with the legacy @privy-io/server-auth SDK); follow the docs recipe, not the starter.

Evidence: index.js line 4 requires '@privy-io/server-auth', line 78 calls privy.walletApi.createWallet({chainType:'solana'}), line 42 'wallet mappings are stored in a JSON file that maps Telegram user IDs to Privy wallet IDs'. VERIFIED.

Sources:
- https://raw.githubusercontent.com/privy-io/examples/main/examples/privy-node-telegram-trading-bot/index.js
- https://docs.privy.io/recipes/telegram-bot.md

### [high] conf 0.95: Stateful (rolling-cap) policies only evaluate eth_signTransaction and eth_signUserOperation, use sum only, and windows of 1h-72h; there is no plan gating on them.

Evidence: Stateful policies doc 'Supported RPC methods' table lists only eth_signTransaction and eth_signUserOperation; 'Currently, only sum is supported'; window 'Minimum value is 3600 ... maximum is 259200'. No contact/enterprise language anywhere on the page. VERIFIED.

Sources:
- https://docs.privy.io/controls/policies/stateful-policies.md
- https://docs.privy.io/recipes/using-stateful-policies.md

### [high] conf 0.75: Privy prize slots are frequently unawarded: at ETHGlobal New York 2026 (Jun 2026) only 1 of 4 Privy tracks shows a winner across all 161 showcase projects; at Buenos Aires 2025 only 1 winner found among 41 Privy-tagged projects.

Evidence: Scraped every NY 2026 showcase project page (161) and all Privy-tagged Buenos Aires pages (41); parsed the 'Winner of' block; only Aragorn (NY 2026) and ArcBeam (BA) carry a Privy badge. VERIFIED for the pages scraped; badge omissions by ETHGlobal possible.

Sources:
- https://ethglobal.com/showcase/aragorn-5if7q
- https://ethglobal.com/showcase/arcbeam-e0bey
- https://ethglobal.com/events/newyork2026/prizes/privy
- https://ethglobal.com/events/buenosaires/prizes/privy

### [high] conf 0.85: Past Privy winners were mostly polished consumer apps with shallow integrations (login + embedded wallet + one named feature such as gas sponsorship or Earn); AI/policy-track winners used server wallets with one policy or whitelist; multi-prize finalist projects win disproportionately.

Evidence: Winners: Agent 4 Your Mom, OSS-Rewards-Agent, The Game Show (Agentic Ethereum 2025, server wallets + policy); PrivyCycle, AstroFi (Cannes 2025); ChainSpeed, Cosurf, Secret Pineapple (NY 2025); ArcBeam (BA 2025); Aragorn (NY 2026, 'Private Vault investment through Privy Earn'). Several also won 1inch/World/ENS/Graph/Zircuit prizes. VERIFIED from showcase pages.

Sources:
- https://ethglobal.com/showcase/agent-4-your-mom-enmb5
- https://ethglobal.com/showcase/oss-rewards-agent-a4ge7
- https://ethglobal.com/showcase/the-game-show-8sypr
- https://ethglobal.com/showcase/privycycle-anndr
- https://ethglobal.com/showcase/astrofi-383f8
- https://ethglobal.com/showcase/chainspeed-mmv50
- https://ethglobal.com/showcase/cosurf-6g4wo
- https://ethglobal.com/showcase/secret-pineapple-tp8pe
- https://ethglobal.com/showcase/aragorn-5if7q

### [medium] conf 0.85: The closest prior art to this team's onboarding (Telegram bot + mini-app + Privy delegated wallets, 'Deport The Dip', Cannes 2025) won no Privy prize, so Telegram onboarding alone is not a differentiator for Privy judges.

Evidence: Showcase page has no 'Winner of' section; tagline 'Telegram bot + mini-app for one-click DeFi copy-trading with delegated wallets using Privy'; repo github.com/reymom/deport-the-dip. VERIFIED.

Sources:
- https://ethglobal.com/showcase/deport-the-dip-ckv5t

### [medium] conf 0.9: Privy's developer community is a Slack workspace (privy-developers) with a public invite reachable via privy.io/slack; it is listed as included on the Developer plan.

Evidence: curl -I chain: privy.io/slack -> www.privy.io/slack -> https://join.slack.com/t/privy-developers/shared_invite/zt-450dy7o0j-~li92mYt5cddJ6eXolgkXw -> privy-developers.slack.com/join/... (final 403 is Slack blocking curl). Pricing matrix row 'Privy Developer Slack' has a Developer-column check; FAQ: 'join our developer Slack community'. VERIFIED.

Sources:
- https://privy.io/slack
- https://www.privy.io/pricing

### [medium] conf 0.8: Named Privy people active in Aug-Sep 2026: Madeleine Charity (GitHub madeleine-c, 31 commits to privy-io/examples, last 2026-08-27), Joshua Navi (JoshNavi, 2026-09-03), Sina Sabet (ss-privy, X @sina_eth_), Tedi Mitiku (X @drosmitiku, bio '@privy_io'), plus blog authors Debbie Soon, Ankush Swarnakar, Vinny Mullin.

Evidence: GitHub API commits list for privy-io/examples and /users profiles; fxtwitter profile lookups for sina_eth_ and drosmitiku; blog post bylines. VERIFIED. Roles (devrel vs eng) not stated anywhere I could fetch.

Sources:
- https://api.github.com/repos/privy-io/examples/commits?per_page=100
- https://api.fxtwitter.com/drosmitiku
- https://api.fxtwitter.com/sina_eth_
- https://www.privy.io/blog/experimenting-with-agentic-clis
- https://www.privy.io/blog/building-multi-user-financial-workflows-with-intents
- https://www.privy.io/blog/empower-agents-to-transact-from-wallets-built-on-privy

### [high] conf 0.7: The Intents API (propose RPC intent, authorize with an owner/signer authorization signature, auto-execute at threshold, 72h expiry) is documented with Node SDK code and has no sales gate; only the Dashboard 'manual approvals' UI is Enterprise. Human-approves-above-cap-agent-spend is buildable in under 8h if the approver is a server-held authorization key triggered from Telegram.

Evidence: execute-rpc.md: `const intent = await client.intents().rpc('insert-wallet-id', rpcRequest)`; sign-intents.md: POST /v1/intents/{intent_id}/authorize 'can be called with your app secret or with a wallet owner's user token'; overview: 'use the Intents API to build your own asynchronous signing flow'; lifecycle: 'Intents expire 72 hours after creation'. Endpoint existence VERIFIED; 8h estimate INFERRED.

Sources:
- https://docs.privy.io/transaction-management/intents/overview.md
- https://docs.privy.io/transaction-management/intents/create/execute-rpc.md
- https://docs.privy.io/transaction-management/intents/sign-intents.md
- https://docs.privy.io/transaction-management/intents/lifecycle.md
- https://docs.privy.io/recipes/wallets/two-of-two-server-in-the-loop.md

### [medium] conf 0.95: Key quorums that mix a user ID and an authorization key must be created via SDK/REST, not the Dashboard; a documented 2-of-2 (user + server) recipe exists.

Evidence: 'Key quorums containing both user IDs and authorization keys must be created via the SDK or REST API. The Dashboard only supports pure authorization-key quorums.' Code: privy.keyQuorums().create({public_keys, user_ids, authorization_threshold: 2}). VERIFIED.

Sources:
- https://docs.privy.io/recipes/wallets/two-of-two-server-in-the-loop.md
- https://docs.privy.io/controls/key-quorum/create.md

### [medium] conf 0.85: Privy's own 2026 messaging is agent-centric (Agent CLI Apr 2026, agent wallet authorization Jun 2026, x402/MPP guide, intents Aug 2026) and the NY 2026 tracks named Earn, universal deposit addresses and the Agent Wallet CLI; ETHOnline's 'financial flow' track lists transfers, bridging, stablecoin conversions, swaps, Earn vaults, onramps as eligible flows.

Evidence: Blog bylines/dates fetched; NY 2026 prize page text: 'Meaningful use of Privy's Earn capability', 'must integrate universal deposit addresses', 'using Privy's Agent Wallet CLI'; prizes.md ETHOnline text lines 896-909. VERIFIED.

Sources:
- https://www.privy.io/blog/a-guide-to-building-agentic-apps-on-privy
- https://www.privy.io/blog/building-multi-user-financial-workflows-with-intents
- https://ethglobal.com/events/newyork2026/prizes/privy
- https://ethglobal.com/events/ethonline2026/prizes

## Recommendations

- Build identity exactly as the docs recipe: on /start create the Privy user with {type:'telegram', telegram_user_id}, create the wallet with owner:{user_id} plus the agent as additional_signer with an override policy; on the web use Telegram OAuth login and look the wallet up from user.linked_accounts. Turn OFF automatic embedded-wallet creation on login in the Dashboard so the web login does not mint a second wallet. Test the round-trip on day 1 (bot creates user -> web login -> same DID and wallet id) and screenshot it for the README.
- Do not depend on webhooks (Enterprise-only): poll intents/getByTelegramUserID from the server; do not rely on Dashboard manual approvals either.
- For the B2B track ship the cheapest 'Privy control' stack: (a) agent signer with a policy (per-tx cap allowlist + a stateful rolling cap on eth_signTransaction), (b) wallet owner = server P-256 authorization key held by the approval service, (c) when the policy denies, propose an RPC intent and post a Telegram approve/reject card; Approve = server authorizes the intent, Privy executes; Reject = reject-intent endpoint. Show the intent_id and status transitions in the video. Budget 6-8h and time-box it; fall back to plain policy-deny + human-takeover if intents misbehave.
- For the 'Best financial flow' track make sure one eligible GA flow is live and unmistakable (a Privy transfer or funding/onramp step or an Earn deposit), since x402 is not explicitly in the eligible list; do not let a mocked feature be the only Privy flow.
- Write the 'how Privy enables the product' paragraph in the submission and README as a checklist mapping to the qualification bullets (wallet created, control used, workflow, demo, source). Past slots went unawarded, so clean qualification plus polish beats novelty.
- Study the three agent-track winners (Agent 4 Your Mom, OSS-Rewards-Agent, The Game Show) and Aragorn: judges rewarded a visible allowlist/policy, a consumer-grade UI, and use of the track's named feature.
- Join the privy-developers Slack via https://privy.io/slack today; post a short build-in-public thread there and on X tagging @privy_io, @drosmitiku and @sina_eth_ with the policy JSON and a 20s clip of the kill switch. Ask in Slack whether intents authorized by a wallet owner's user token are supported from the React SDK (unclear in docs).
- Position the Privy angle as 'the wallet is the leash on a browser agent' with the policy JSON on screen: no prior Privy winner combined a shared browser with a policy-bound wallet, and the prior Telegram+Privy project without a control layer won nothing.

## Open questions

- No doc sentence literally states that a server-created telegram user and a later Telegram OAuth web login resolve to the same DID; verify empirically on day 1 (also whether the React SDK auto-creates an extra embedded wallet).
- Whether the ETHOnline 2026 Privy judges are the same people as the GitHub/blog names found; Privy roles (devrel vs eng) for madeleine-c, JoshNavi, ss-privy, siddesh-privy are not published anywhere fetched.
- Whether the missing NY 2026 and Buenos Aires Privy prizes were genuinely unawarded or ETHGlobal simply did not post badges (only showcase badges were checked; @privy_io X timeline could not be fetched).
- Whether intents authorized 'with a wallet owner's user token' can be signed from the React SDK in a browser session, and whether an intent authorized by the owner bypasses the agent signer's override policy as expected.
- Is 'Custodial wallets' really Enterprise-only (single check cell, column not certain) and does anything in the ETHOnline 'B2B' track require Organizations (org wallets docs showed no gating language, but were not deeply read).
- Whether Privy runs an ETHGlobal Discord partner channel or office hours for ETHOnline 2026 (prize page lists none; Discord not fetchable).

## All sources

- https://www.privy.io/pricing
- https://privy.io/slack
- https://docs.privy.io/llms.txt
- https://docs.privy.io/recipes/telegram-bot.md
- https://docs.privy.io/user-management/migrating-users-to-privy/create-or-import-a-user.md
- https://docs.privy.io/user-management/users/the-user-object.md
- https://docs.privy.io/recipes/pregenerate-wallets.md
- https://docs.privy.io/authentication/user-authentication/login-methods/oauth.md
- https://docs.privy.io/controls/policies/stateful-policies.md
- https://docs.privy.io/controls/key-quorum/overview.md
- https://docs.privy.io/controls/key-quorum/create.md
- https://docs.privy.io/controls/dashboard/overview.md
- https://docs.privy.io/controls/dashboard/approvals.md
- https://docs.privy.io/transaction-management/intents/overview.md
- https://docs.privy.io/transaction-management/intents/create/execute-rpc.md
- https://docs.privy.io/transaction-management/intents/sign-intents.md
- https://docs.privy.io/transaction-management/intents/lifecycle.md
- https://docs.privy.io/organizations/actions/intents.md
- https://docs.privy.io/recipes/wallets/two-of-two-server-in-the-loop.md
- https://raw.githubusercontent.com/privy-io/examples/main/examples/privy-node-telegram-trading-bot/index.js
- https://api.github.com/repos/privy-io/examples/commits?per_page=100
- https://www.privy.io/blog
- https://www.privy.io/blog/building-multi-user-financial-workflows-with-intents
- https://www.privy.io/blog/a-guide-to-building-agentic-apps-on-privy
- https://www.privy.io/blog/turning-wallets-programmable-with-privy-policy-engine
- https://www.privy.io/blog/encoding-your-org-chart-in-policy-with-nested-key-quorums
- https://www.privy.io/blog/empower-agents-to-transact-from-wallets-built-on-privy
- https://www.privy.io/blog/experimenting-with-agentic-clis
- https://ethglobal.com/events/ethonline2026/prizes
- https://ethglobal.com/events/newyork2026/prizes/privy
- https://ethglobal.com/events/newyork2025/prizes/privy
- https://ethglobal.com/events/buenosaires/prizes/privy
- https://ethglobal.com/events/agents/prizes/privy
- https://ethglobal.com/events/cannes/prizes
- https://ethglobal.com/events/lisbon2026/prizes
- https://ethglobal.com/events/hackmoney2026/prizes
- https://ethglobal.com/events/ethonline2025/prizes
- https://ethglobal.com/events/newdelhi/prizes
- https://ethglobal.com/events/prague/prizes
- https://ethglobal.com/showcase?events=cannes&partners=privy
- https://ethglobal.com/showcase/agent-4-your-mom-enmb5
- https://ethglobal.com/showcase/oss-rewards-agent-a4ge7
- https://ethglobal.com/showcase/the-game-show-8sypr
- https://ethglobal.com/showcase/privycycle-anndr
- https://ethglobal.com/showcase/astrofi-383f8
- https://ethglobal.com/showcase/chainspeed-mmv50
- https://ethglobal.com/showcase/cosurf-6g4wo
- https://ethglobal.com/showcase/secret-pineapple-tp8pe
- https://ethglobal.com/showcase/arcbeam-e0bey
- https://ethglobal.com/showcase/aragorn-5if7q
- https://ethglobal.com/showcase/deport-the-dip-ckv5t
- https://api.fxtwitter.com/privy_io
- https://api.fxtwitter.com/drosmitiku
- https://api.fxtwitter.com/sina_eth_
