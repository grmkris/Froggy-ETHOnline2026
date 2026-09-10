# The agent door, checked

Checked 10 September 2026, on the branch `agent-door`, against production at `https://app-production-58dd.up.railway.app` and Hedera mainnet. Every value below was read back from the thing itself; anything not proven says so in the same sentence.

## What was built

A stdio MCP server at `apps/server/src/agent-door/`, served at `GET /froggy-mcp.mjs` (and `/froggy-mcp.js`, for an old link), with three tools: `froggy_catalogue`, `froggy_buy`, `froggy_receipt`. The caller pays from their own Hedera account. See `docs/decisions/0020-agent-door.md`.

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
| `FROGGY_HEDERA_ACCOUNT_ID=alice` | "which is not a Hedera account id. It should look like 0.0.12345" — and, since the review, describing the value rather than quoting it |

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

**Superseded below.** The reference implementation was found on review, the derivation did not match it in two places, and both are fixed. See _HCS-14, checked against the reference implementation_.

---

# The review, and what it changed

Reviewed 10 September 2026 on the same branch. Nine independent readers over the diff, each finding then given to a separate reader told to refute it: 52 raised, 45 survived. What follows is what was re-checked afterwards by running things, not by reading them.

## What the built bundle does now

Rebuilt from `agent-door/server.ts` after the changes, 6.0 MB, and driven by hand under `node v24.19.0`:

| Check | Before | Now |
| --- | --- | --- |
| `node froggy-mcp.*` in a directory whose `package.json` says `"type": "commonjs"` | `SyntaxError: Cannot use import statement outside a module` | Starts, and answers `initialize` |
| A client asking for protocol `2024-11-05` | Answered `2025-11-25`, which the specification tells such a client to disconnect over | Answered `2024-11-05` |
| `froggy_buy` when the seller drops the connection mid-response | Nothing written at all; the caller waits forever | `froggy_buy stopped on an unexpected failure: fetch failed … whether money moved is unknown` |
| A `ping` sent while that purchase is in flight | Queued behind it | Answered first, out of order, as JSON-RPC allows |
| `froggy_receipt 0.0.10571514@1788733693.213156813` against mainnet | Correct | Correct, and now found by starting from the settlement's own consensus timestamp rather than walking back from the newest message |

The `.mjs` name is the whole of the first row: the bundle is an ES module, and Node reads a bare `.js` as CommonJS wherever the nearest `package.json` says so. The repository's own CLI has always saved as `.mjs`; the door had not.

## What a wrong receipt used to say

A settlement priced in an HTS token, rendered by the committed code:

```
Settled. 0.0009 HBAR moved from 0.0.10571514 to 0.0.98 …
```

That is the facilitator paying Hedera's fee-collection account — wrong asset, wrong amount, wrong payer, wrong payee — because the legs were compared by raw amount across assets and a network fee outweighs a cent-scale payment. The same input now renders `Settled. 0.05 USDC moved from 0.0.12345 to 0.0.10847556`, and `apps/server/src/agent-door/receipt.test.ts` holds both that case and the one where the price is _below_ the fee.

## HCS-14, checked against the reference implementation

The module previously said it had not been checked against one. It has been now, against `hashgraph-online/standards-sdk`:

|  | Reference | Was | Now |
| --- | --- | --- | --- |
| Canonical JSON key order | `skills, name, nativeId, protocol, registry, version` | alphabetical | matches |
| `uid` where no registry assigned one | `0` | the agent's own name | `0` |
| Hash, encoding, parameter order | SHA-384, base58 of all 48 bytes, `uid;registry;proto;nativeId` | matched | matches |

The two that differed changed the bytes being hashed, so the identifier we published could not have been recomputed by a reader using the SDK — which was the only thing publishing it was for.

## What the discovery listing publishes

`accepts` entries are now the whole requirement the 402 carries. The check is the repository's own `assess`, which is what its buyer uses to decide whether an offer is payable: `apps/server/src/discovery.test.ts` asserts that every entry the listing publishes passes it. Before, none did — `extra.feePayer` was dropped, and `oracle.ts` calls that "the one field without which the whole payment cannot be built".

## The gate

`bun run check` passes format, type-aware lint, typecheck, the dependency graph, the agent-file and name checks, and knip. Its test step reports the same three pre-existing failures as before, all date formatting under Bun 1.4.2's ICU on this machine (`schedules.test.ts`, `jobs.test.ts`), which fail identically on a clean checkout. 46 tests were added — 30 in four new files, 16 to existing ones: the JSON-RPC layer, the receipt's success path, the discovery documents, the origin stamping, the price guards, the payment header the buy actually sends, and the mirror-node changes — none of which had any coverage before.

## Still pending, unchanged

**The stranger's purchase.** Nothing in this review changes it: no outside account has paid through this door. Everything either side is now tested rather than only argued, but the claim in `PRD_MCP_SELLER_FABLE51.md` §8 remains a design intent. What it needs is unchanged — a Hedera mainnet account with ECDSA keys and a little over 0.05 HBAR, on a machine that is not ours.

To be precise about what "everything either side" now means, because the earlier wording read as more than it was: the signing was checked offline against a synthetic challenge with a throwaway key, the facilitator's acceptance was checked with `/verify`, which moves nothing, and the seller's settlement and the receipt were checked against a purchase made through the _app_, not through this door. No `froggy_buy` has yet completed against the live seller.

**The HashScan links** and **the testnet deployment**, both unchanged.
