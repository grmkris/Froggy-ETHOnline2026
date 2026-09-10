# The agent door, checked

Checked 10 September 2026, on the branch `agent-door`, against production at `https://app-production-58dd.up.railway.app` and Hedera mainnet. Every value below was read back from the thing itself; anything not proven says so in the same sentence.

## What was built

A stdio MCP server at `apps/server/src/agent-door/`, served at `GET /froggy-mcp.js`, with three tools: `froggy_catalogue`, `froggy_buy`, `froggy_receipt`. The caller pays from their own Hedera account. See `docs/decisions/0020-agent-door.md`.

## The bundle

| Check | Result |
| --- | --- |
| `Bun.build({ target: "node" })` on `agent-door/server.ts` | Succeeds, 6,021,873 bytes, one file |
| Runs under plain Node | Yes, `node v24.19.0`, no install step |
| Shebang preserved | `#!/usr/bin/env node` |
| Served by `serveAgentDoor()` | `200`, `text/javascript; charset=utf-8`, `cache-control: public, max-age=300` |
| Second request | Same bytes, from the module-level cache rather than a second build |

The bundle is almost entirely `@hiero-ledger/sdk`. This was the one open technical risk in the plan and it is closed.

## The protocol

Driven by hand over stdin, one JSON-RPC message per line:

| Request | Answer |
| --- | --- |
| `initialize` | `serverInfo {name: "froggy-door", version: "1.0.0"}`, `protocolVersion: "2025-11-25"` |
| `notifications/initialized` (no id) | Nothing written, as a notification requires |
| `tools/list` | `froggy_catalogue`, `froggy_buy`, `froggy_receipt` |

## Signing, offline

A synthetic challenge matching the live one (`amount 5000000`, `asset 0.0.0`, `feePayer 0.0.10571514`, `payTo 0.0.10847556`, `hedera:mainnet`) signed with a throwaway ECDSA key inside the bundle, under Node:

- `payment-signature` header: 1,372 bytes — comfortably inside the hosted header limit that `setMaxNodesPerTransaction(3)` exists to respect.
- Envelope: `{x402Version: 2, accepted: {...}, payload: {transaction}}`, with the transaction 808 base64 characters.

## `froggy_catalogue`, against production

Read the live card and rendered it. `5000000` tinybars is shown as **0.05 HBAR**, the facilitator as `https://api.blocky402.com`, and the topic as `0.0.10847557`. No key was configured for this call and none was needed.

## `froggy_receipt`, against a real mainnet settlement

Asked for `0.0.10571514@1788733693.213156813`, which is sequence 1 on the topic. Answered:

> Settled. 0.05 HBAR moved from 0.0.10847552 to 0.0.10847556 on hedera:mainnet at 2026-09-06T22:29:01.000Z. Public note #1 on topic 0.0.10847557, written by 0.0.10847552. It records this as a sale by the seller, reference `sal_01m1wddr0vfvqvsfaftr95s214`.

Both sources resolved and agreed. No key was configured for this call either.

## The refusals

Each was produced by running the built bundle, not by reading the source:

| Situation | What it says |
| --- | --- |
| Nothing configured | Names both variables and says "nothing was bought and nothing was simulated" |
| Account set, key missing | Names only the missing one |
| `FROGGY_HEDERA_ACCOUNT_ID=alice` | "which is not a Hedera account id. It should look like 0.0.12345" |

Five more are covered by unit tests against an injected seller, because they need a seller that misbehaves: a network this door cannot pay, an insufficient balance (named to the tinybar), a facilitator that refuses, a 409 while an earlier payment is open, and a 502 after money moved. 19 tests in `apps/server/src/agent-door/tools.test.ts`, plus 7 for the identifier and 7 for the mirror lookups.

## The rest of the tree

`bun run check` passes format, type-aware lint, typecheck, the dependency graph, the agent-file and name checks, and knip. Its test step reports three failures, all in `schedules.test.ts` and `jobs.test.ts`, all date formatting under Bun 1.4.2's ICU on this machine; they fail identically on a clean checkout. A fourth, `a paid brief … claims concurrent paid retries`, failed once in three runs on this branch and once in three runs on a clean checkout: flaky, and not new.

`bun run e2e` — **136 passed**, after `bun run e2e:install`, which this machine had not been run before. The Observatory page and the service card are visible changes, so this was the gate that mattered.

## The facilitator

Read directly, 10 September:

| Endpoint | Answer |
| --- | --- |
| `GET https://api.blocky402.com/supported` | One kind: `exact` on `hedera:mainnet`, `feePayer 0.0.10571514` |
| `GET https://api.testnet.blocky402.com/supported` | `hedera:testnet` (`feePayer 0.0.7162784`), plus Polygon Amoy and Solana devnet |
| `GET /health` | `{"status":"ok","version":"1.0.0"}` |

Neither host required an API key, though the published documentation says mainnet will.

**Does it accept an HTS token?** Asked rather than assumed. A `/verify` of a USDC-denominated payload (`asset 0.0.456858`, `amount 10000`), signed from an account holding none:

```
{"isValid":false,
 "invalidReason":"invalid_exact_hedera_payload_preflight_failed",
 "invalidMessage":"insufficient_balance: payer holds 0 of 0.0.456858, needs 10000",
 "payer":"0.0.12345"}
```

A balance answer, not an allowlist one. The same call with `asset 0.0.0` answered `{"isValid":true}`. **HTS pricing works**; `HEDERA_ASSET` now exposes it, defaulting to HBAR. `/verify` moves no funds.

## The skill

`skills/froggy-door/SKILL.md`, served at `/door-skill.md`, kept byte-equal to what `door-skill.ts` renders by the same test that keeps the person's skill honest. Four tests: the byte equality, that a real origin is filled in and all three tools named, that it tells an agent to read a refusal rather than retry and to ask before spending, and that it carries no key.

## Pending

**The stranger's purchase.** The one thing that cannot be done from here: a real `froggy_buy` on mainnet from a funded Hedera account that is not Froggy's, on a machine that is not ours. Everything either side of it is proven — the door signs correctly, the facilitator accepts the payload, the seller settles, and the receipt resolves — but no outside account has yet paid through this door. Until it has, the claim in `PRD_MCP_SELLER_FABLE51.md` §8 that "a stranger completes a paid request without an account" is a design intent and not a result. What it needs: a Hedera mainnet account with ECDSA keys and a little over 0.05 HBAR.

**The HashScan links.** The receipt view emits `hashscan.io/{network}/{transaction,account,topic}/{id}`. HashScan answers an identical 1,517-byte 404 to every request that is not a browser, including deliberately nonsensical paths, so nothing about these URLs could be confirmed from here. The pattern is the documented one. **Open one in a browser before the demo**; they appear in judge-facing output.

**The testnet deployment.** `HEDERA_NETWORK=hedera:testnet` and the door's `FROGGY_NETWORK` both support it, and the facilitator's testnet host is live, but no testnet deployment is running to point them at. Anyone can get 100 testnet HBAR from the anonymous faucet with no login, so this is the cheapest way for a judge in a hurry to try the door.

## Not checked here

Whether the identifier in `/discovery/resources` matches a reference HCS-14 implementation. The standard is a draft, no reference implementation was found, and the module says so. The derivation is deterministic and its inputs are published beside it, so a reader can recompute and disagree.
