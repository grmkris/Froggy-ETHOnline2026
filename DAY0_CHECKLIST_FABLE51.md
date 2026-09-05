# Day-one checklist (FABLE51)

Written Sat 5 Sep 2026, early morning. The original "day 0" (Fri 4 Sep evening) has passed with none of its items done, so this is the Saturday list. Each item has a command or a concrete action and a pass criterion. Decisions come first because they change what everyone builds. Times are CEST.

The repo-hygiene block at the end is the engineering owner's lane; it is here because the items are event-rule risks (Start Fresh, commit history, disclosure), not because these docs audit the code.

---

## A. Decisions before 10:00 (Jonas runs the thread, all three answer)

| Decision | Recommendation | Pass |
| --- | --- | --- |
| Is the third builder in? | Plan for no | A name is written next to every Day 1-5 row of the plan in `PRODUCT_FABLE51.md`; if no, every stretch item is marked cancelled |
| Hosted browser isolation: worker-per-user or puppeteer-core browser contexts | puppeteer-core contexts for hosting, Bun.WebView for local dev (engineering refuter's hour estimates: 14-16 versus 20-24) | The Chrome owner writes the choice and the Sunday 12:00 cut line into the plan after the measurement below |
| Rule (b) chain | Base Sepolia USDC to the treasury plus a labelled credit as the default; the Hedera-EVM 296 spike is a 30-minute box at most, decision at 18:00, never revisited | One line in PRIVY.md: chain, rule, spike result |
| Real USDC | $5 now, $5 reserve, demo wallet only, team money | The demo wallet address and the funding tx in PRIVY.md |
| Name | Keep the repo's name; the tagline carries the browser | The tagline (under 100 characters) pasted into the README header |
| Privy B2B | Tick only if the Intents box ships | Noted in PRIZE_AUDIT section 5 |

---

## B. Measurements (30 minutes, before any isolation work)

| Item | How | Pass |
| --- | --- | --- |
| Frames per second and click round-trip on the hosted URL from Jonas's connection | Open the live workspace, count screencast frames per ten seconds in the browser console, time a click to the next changed frame | Numbers committed to `docs/measurements.md`; at least 5 fps at 1280 wide and under 300 ms, else the Hetzner compose file becomes the Day 2 deploy rather than a fallback |
| Live URL health | `curl -s -o /dev/null -w '%{http_code}' <live-url>/health` and the same for the 402 route | 200 and 402 |

---

## C. Accounts and keys (the third builder; else Kristjan takes the Privy items and Jonas takes the Hedera accounts, settlement and Graph curls with Kristjan reviewing; 2-3 hours)

| Item | How | Pass |
| --- | --- | --- |
| Fresh Privy app | New app in the dashboard: email OTP on, Telegram login on, automatic embedded-wallet creation on login **off**; create the agent's P-256 authorization key; do not reuse any app inherited from an earlier project | App id and key id recorded (never the secret) in PRIVY.md |
| First raw denial | A 40-line script with the Privy Node SDK: create a wallet with the user as owner and the agent key as additional signer under policy P_agent v0 (default deny plus rule b), then call `eth_signTransaction` to `0x000000000000000000000000000000000000dEaD` | Privy returns a policy-denial error whose text names the policy id; pasted verbatim into PRIVY.md |
| `secp256k1_sign` under policy (15 minutes) | Call raw sign on the same policied wallet with and without a wildcard rule | The result, whichever it is, written into PRIVY.md under "why Privy does not gate Hedera" |
| Hedera accounts | Create at portal.hedera.com: the service payTo (ECDSA) and the treasury; fund both | `curl -s https://testnet.mirrornode.hedera.com/api/v1/accounts/<id> \| jq .balance.balance` shows at least 100 HBAR (10000000000 tinybar) on each |
| Blocky402 fee payer | `curl -s https://api.testnet.blocky402.com/supported \| jq -r '.kinds[] \| select(.network=="hedera:testnet") \| .extra.feePayer'` | Prints a 0.0.x id (0.0.7162784 on 4 Sep) and the service reads it at boot rather than hardcoding it |
| First real settlement from our own service | Run the service with the real payTo and a separate payer account; hit the 402 route with the payer; the 402 must carry `extra.feePayer` and payer and payTo must be different accounts | The response is 200 and the payment-response transaction id opens on hashscan.io/testnet with SUCCESS; both the local and the hosted transaction ids go into HEDERA.md |
| Studio key | Create a Subgraph Studio Free Plan key | Key stored as a secret; never in the repo |
| Graph freshness, all four deployments | For each of `JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk`, `D7mapexM5ZsQckLJai2FawTKXJ7CqYGKM8PErnS3cJi9`, `AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9`, `GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si`: `curl -s -X POST https://gateway.thegraph.com/api/subgraphs/id/<id> -H "authorization: Bearer $GRAPH_API_KEY" -d '{"query":"{ _meta { block { number } } markets(first:1, where:{inputToken_:{symbol:\"USDC\"}, canBorrowFrom:true}) { name rates { rate side type } } }"}'` | Each returns a block within two hours of chain head and at least one USDC market with a BORROWER rate; any stale one is recorded in GRAPH.md and swapped (deeptrace's Base set: Aave v3 Base, Seamless, Moonwell) |
| Graph mainnet x402 gateway | `curl -si -X POST https://gateway.thegraph.com/api/x402/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk -d '{"query":"{ _meta { block { number } } }"}' \| grep -i payment-required \| cut -d' ' -f2 \| base64 -d` | Decodes to network eip155:8453, amount 10000, payTo `0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB` |
| Circle faucet drip | One pull of 20 test USDC at faucet.circle.com into the Base Sepolia treasury; repeat every two hours across team addresses through Monday | sepolia.basescan.org shows the treasury USDC balance at 20 or more |
| The 296 spike (30 minutes, optional) | A Privy `eth_signTransaction` on chain 296 from a portal-funded sender to a pocket alias, broadcast through `https://testnet.hashio.io/api` | Either a HashScan transaction and the account completed, or "failed, Base Sepolia locked" in PRIVY.md by 18:00 |

---

## D. Jonas's Day 1 (evidence skeletons, copy, channels)

| Item | Pass |
| --- | --- |
| Skeleton files with `TODO(tx)` markers: README (winner shape: problem, what it does, demo beats, where each integration lives, on-chain evidence, run locally, honesty box, not in scope, AI use, team), HEDERA.md, PRIVY.md, GRAPH.md, VALIDATION.md, FEEDBACK.md, ACQUISITION.md, AI-USE.md | All eight committed |
| Consent copy, phone-door copy, privacy notice, Impressum text (from `BUILD_IN_PUBLIC_FABLE51.md` sections 4-5) | Committed as text; live on the landing by Day 2 |
| BotFather: create the bot, set the web domain | Bot token stored as a secret; `/setdomain` done so the Telegram login test on Sunday can run |
| Channel joins: privy.io/slack, Hedera Discord, t.me/graphhackers, ETHGlobal Discord; DM @JulioMCruz with a real question | Rows 1-5 of ACQUISITION.md |
| X post 1: the 15-second screencast clip, one sentence, repo link in the first reply, no live link | Post URL in ACQUISITION.md |
| Ask in Hedera Discord: is a duplicate `/settle` idempotent, is the blocky402 repo going public, is there a testnet USDC faucet | Answers into HEDERA.md when they arrive |

---

## E. Repo hygiene (engineering owner; event-rule risks)

These are checks, not an audit. Anything that fails is fixed with a normal commit and a one-line disclosure in the README; never a history rewrite (the rules penalise missing histories).

| Check | Command | Pass |
| --- | --- | --- |
| No browser profile or other local state is tracked | `git ls-files \| grep -iE 'chrome-profile\|Cookies\|Login Data'` | Prints nothing; if it printed something, it is untracked, ignored, and a README line states what it was and that it held no cookies or logins |
| No undisclosed prior-project references in code or docs | `grep -rn -iE 'ported from\|lifted from\|humanhook\|invok\|boter' --include='*.ts' --include='*.tsx' --include='*.md' --include='*.example' . \| grep -v research_FABLE51 \| grep -v _FABLE51.md` | Every hit is either inside the README or AI-USE.md disclosure section with a public link, or the file is rewritten from the protocol docs and the header removed |
| No handover or plan text names a prior project's credentials or app | `grep -rn -i 'app already\|steal' docs/` | Nothing, or the lines are rewritten |
| Commit granularity from now on | `git log --oneline \| wc -l` grows by small commits daily; no squash, no force-push | A dated README note explains any earlier bulk commit |
| Runtime and model pinned to the researched versions | Bun 1.4.1 everywhere it is pinned (the 1.3.x local runtime has the WebView close() bug); the model id is `claude-opus-5` | `bun --version` prints 1.4.1 locally; one typed ask on the live URL produces a live tool call |
| AI-USE.md exists and names tools, prompts, spec files and every pattern source | File present | Committed Day 1, completed Day 6 |

---

## F. End of Day 1 (the milestone)

Ownership locked; the fps and latency numbers committed; a first Blocky402-settled transaction from our own service on HashScan; a raw Privy denial with a policy id in PRIVY.md; all four Graph deployments' block ages in GRAPH.md; rule (b) chain locked at 18:00; eight evidence-file skeletons committed; X post 1 out with the repo link; the hygiene checks green or fixed. If any of the first four is red on Sunday morning, it is the first task on Sunday and the isolation work waits.
