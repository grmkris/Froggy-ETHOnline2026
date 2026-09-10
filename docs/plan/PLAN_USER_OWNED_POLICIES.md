# User-owned Privy policies

## Context

Today one shared policy governs everybody. `docs/privy-agent-policy.json` (`froggy-agent-v1`, `rk6qw974uapbesb04u5tq5kb`, `owner_id: null`) holds three rules written by us, and every person's wallet carries our server key as an additional signer with `override_policy_ids: [that one policy]` (`packages/wallet/src/agent-signer.ts:189`). The numbers in it are ours, the payees in it are ours, and the person never sees, chooses, extends or revokes any of it. On production the mandate's own caps are off (`SPENDING_LIMITS`, `packages/domain/src/mandate.ts:227`), so on the EVM leg that shared policy is the _only_ ceiling, and it is a ceiling nobody consented to.

Kristjan's objection, from the group at 09:04 today, is right in both halves: our server should not hold standing authority for anything large, and policies are attached per wallet already, so each person could carry their own — set at onboarding, extended or revoked later. That is what session keys are for.

What this plan builds: **one policy per person, owned by that person, minted when they grant the signer, carrying their own caps and a real expiry, revocable by them in the browser.** Alongside it, our own mandate carries the identical ceilings so a Privy outage can never widen what the agent may spend, and the identical expiry so a policy we cannot edit still goes quiet on time.

Four facts established from the SDK types and the evidence, so nobody re-derives them:

- **Minting a person-owned policy is free; editing one is not.** `PolicyCreateParams` (`@privy-io/node@0.34.0`, `resources/policies.d.ts:837`) takes `owner?: OwnerInput` — `{user_id}` or `{public_key}` — and carries **no** authorization-signature header. `PolicyUpdateParams`, `createRule`, `updateRule`, `deleteRule` and `delete` all carry `privy-authorization-signature`. So the server can mint a policy the person owns, and from that moment cannot change it.
- **Privy has no policy-level or signer-level expiry.** `Policy` is `{id, chain_type, created_at, name, owner_id, rules, version}`. `addSigners` takes only `{signerId, policyIds}` (`@privy-io/react-auth@3.40.0`, `SessionSignerInput`). The only expiry Privy enforces is the per-rule `system.current_unix_timestamp` condition the committed policy already uses. Everything else — the reminder, the extension, going quiet — is ours.
- **`earn_deposit`, `earn_withdraw` and `transfer` are real `PolicyMethod` values** (`resources/policies.d.ts:530`) and neither live policy contains any of them, so Earn is refused today by default-deny (`docs/evidence/PRIVY.md`, 9 Sep).
- **The Privy signer has no revocation path wired at all.** `revokeAgent` exists in `packages/wallet/src/privy.ts:215` and nothing calls it; freeze was deleted in `ee4b8dd`. Disconnect revokes _agent tokens_, not the signer. And `revokeAgentSigner` goes through the same `user_jwts` exchange that answers `400 Invalid JWT token provided` on this app, so wiring it would not have worked either. Person-owned policies make this a feature rather than a hole: the browser's `removeSigners` becomes the real kill switch, and it is the person's, not ours.

Owner decisions taken (10 Sep): person-owned policies, gated on a two-hour spike with a named fallback; the grant sheet states four numbers and grants in one tap with an **Adjust** link beside them opening the same form Settings uses; 30-day expiry with a nudge at three days; our mandate mirrors every ceiling and the expiry synchronously.

Deadline: **Sun 13 Sep 18:00 CEST.** Build window is Thu afternoon through Sat.

---

## The split of authority, as one list

The boundary Kristjan asked for — small capped spends run under the standing policy, large or rare actions ask the person — is expressed in exactly one place and read by three consumers.

New leaf module `packages/domain/src/authority.ts` (leaf: no transport, no persistence, per `AGENTS.md`):

```ts
export type ActionKind =
  | "service_payment" // x402 to a seller
  | "conversion" // USDC -> HBAR, nested inside a payment
  | "earn_deposit"
  | "earn_withdraw"
  | "transfer" // person-to-person
  | "trade"; // its own engine; declared out of scope here

export interface ActionAuthority {
  readonly kind: ActionKind;
  readonly side: "standing" | "ask";
  /** null means "the person's per-spend cap decides". */
  readonly perRequestUsdMicros: number | null;
  readonly privyMethods: readonly PolicyMethod[];
}

export const STANDING_AUTHORITY: readonly ActionAuthority[];
export const Allowance: Schema.Struct<{
  perSpendUsdMicros;
  dailyUsdMicros;
  askOverUsdMicros;
  expiresAt;
}>;
export const DEFAULT_ALLOWANCE: Allowance; // $2 per spend, $10 a day, ask over $1, +30 days
```

| Kind | Side | Why |
| --- | --- | --- |
| `service_payment` at or under the per-spend cap | **standing** | the product; this is what the agent is for |
| `conversion` | **standing**, nested only | already inside a payment the mandate allowed (`froggy-leash`, ADR 0013) |
| `earn_deposit` / `earn_withdraw` | **standing**, own cap | idle money, no counterparty; gated on Spike B |
| `transfer` | **ask**, always | naming a payee is a person's act, never the agent's |
| anything over the person's `askOverUsdMicros` | **ask** | the threshold, whatever the kind |
| a payee the person did not name | **refused**, not asked | provenance, unchanged (`packages/wallet/src/policy.ts:294`) |
| `trade` | **ask** (unchanged) | `tradeRuleRefusal` is a second engine; explicitly out of scope, said so in the ADR |

Three consumers of that one list:

1. **The Privy policy** — `personPolicyRules(allowance, pins)` turns it into `PolicyCreateParams.Rule[]`: `standing` kinds become ALLOW rules with the person's cap as the `lte` and their expiry as a `system.current_unix_timestamp` condition; `ask` kinds get no rule at all, so Privy refuses them by default-deny and only a human-approved path can ever reach a signature.
2. **The mandate** — `defaultRules` (`packages/domain/src/mandate.ts:205`) gains the allowance and derives `per_tx_cap`, `window_cap`, `expiry` and `approval_threshold` from the same four numbers. This is the synchronous mirror Kristjan asked for: a Privy outage cannot widen anything, because `authorize` refuses first and never makes a network call.
3. **`threshold()`** (`packages/wallet/src/policy.ts:129`) — today one scalar comparison; it becomes a lookup of `intent.kind` in `STANDING_AUTHORITY`, so "which side is this on" is a table row rather than a conditional.

`SpendIntent` gains `kind: ActionKind`, replacing today's implicit detection (`intent.host !== undefined` ⇒ x402, `idempotencyKey.startsWith("convert:")` ⇒ conversion) that is currently duplicated across `session.ts`, `paid-request.ts` and `policy.ts`.

---

## Ordered steps

### 0. Spikes, before any build

**0a — Person-owned policy, browser-edited. 2h, hard stop.** _Owner-gated._ `tools/spikes/person-owned-policy.ts` mints a throwaway policy with `owner: {user_id: <a test DID>}` via `POST /v1/policies` and the app secret, then proves the app secret alone can no longer `PATCH` it. The browser half is a dev-only button that calls `useAuthorizationSignature().generateAuthorizationSignature` over the canonical `PATCH /v1/policies/{id}` payload (same shape `generateAuthorizationSignatures` builds in `agent-signer.ts:119` — method, url, body, `privy-app-id`, `privy-request-expiry`, version 1) and posts it to a relay route. **Green** = the person's key can change their own policy, and the whole plan proceeds as written. **Red** = fall back to `owner: null`, keeping per-person policies, per-person numbers, expiry and the browser kill switch; what we lose in one sentence is _the policy record naming the person as its owner, so "the person owns the rules" becomes "the person grants, adjusts and revokes the rules" — true, but a claim about our UI rather than about Privy's data._ Needs Kristjan: one signed-in tap, ~10 minutes. Nobody else can.

**0b — Earn under an additional signer. 1h.** _Owner-gated._ One rule, one attempt, one written verdict, since the answer changes the Privy bounty story either way. Add `earn_deposit` (vault pinned, `lte` $1) to a throwaway policy, attach it to a test wallet, and have the **additional signer** — not the owner — attempt a $1 deposit. ADR 0015 proved a wallet _edit_ needs the owner; whether a wallet _action_ of the Earn kind accepts a signer is unsettled and only this settles it. Verdict into `docs/evidence/PRIVY.md` whichever way it goes. Needs Kristjan: $1–2 USDC on Base in the test wallet.

**0c — Per-wallet rolling caps. 20 min.** _No owner needed._ `AggregationInput` exposes `group_by` (max 2 fields, `resources/aggregations.d.ts:63`), which the existing tool never sends. `POST /aggregations` with `group_by: [{field: "from", field_source: "ethereum_transaction"}]` and see whether Privy accepts it. If it does, the rolling 24-hour cap moves _inside_ Privy for the `eth_signTransaction` leg, correcting the "aggregations are app-wide" limitation recorded in `PRIVY.md:54`. If it does not — likely, since `EthereumTransactionConditionField` is only `to | value | chain_id` — rolling caps stay host-side and we keep saying so. `AggregationMethod` is only `eth_signTransaction | eth_signUserOperation` either way, so the typed-data x402 leg can never carry one.

### 1. The one list — 3h

`packages/domain/src/authority.ts` new (above). `SpendIntent.kind` added in `packages/domain/src/mandate.ts`; `defaultRules` takes an `Allowance`. `threshold()` in `packages/wallet/src/policy.ts` reads the table. Every existing call site that builds a `SpendIntent` names its kind: `apps/server/src/tools.ts` (`wallet_send` → `transfer`), `paid-request.ts` (→ `service_payment`), `session.ts` (the nested convert → `conversion`). Unit tests in `packages/wallet/src/policy.test.ts`; defaults reproduce today's numbers exactly, so this step changes no behaviour.

### 2. The policy minter — 3h

`packages/wallet/src/person-policy.ts` new: `personPolicyRules(allowance, expiresAt, pins)` is **pure** and unit-tested against the rule shape in `docs/privy-agent-policy.json` — the existing typed-data and calldata conditions with the person's `lte` values substituted, plus the expiry condition on every rule. `PrivyServer` gains `ensurePersonPolicy({did, allowance})` and `updatePersonPolicy(...)`, calling `client.policies().create({chain_type: "ethereum", version: "1.0", name: \`froggy-person-...\`, rules, owner: {user_id: did}})`with`privy-idempotency-key`derived from the DID. The stub returns`stub-policy-<hash>`and marks it stubbed, per the loud-stub rule. Reuse rather than rewrite:`tools/privy-policy.ts`keeps`apply`/`merge`/`show` for the two app-owned policies; it is not the per-person path.

### 3. Storage and wiring — 3h

Migration `0018` on `users`: `privy_policy_id text`, `privy_policy_expires_at timestamptz`, `privy_policy_allowance jsonb`, following `0007_ancient_ben_urich.sql` exactly. `Store.privyPolicy.{load,save}` in `packages/wallet/src/store.ts` and `store-postgres.ts` (with `ensureUser` first), modelled on the existing `hedera` pair; `persistence.test.ts` exercises both for free. `session.hydrate()` joins it into its existing `Promise.all`. `WalletSummary` gains `policyId` and `policyExpiresAt`; the `session.welcome` `policyId` stays as the app-default fallback so nothing breaks before a person has their own. `AgentGrants.apply` (`apps/server/src/grants.ts:147`) mints before it publishes — it is already the one place per-user Privy facts land.

**Collision.** This step needs three lines in `apps/server/src/services.ts` (register the minter beside `privy` and `store`) and two in `apps/server/src/index.ts` (pass `store` into `AgentGrants`). Both files are uncommitted right now by the trading lane. Everything else in this plan lives in `packages/domain`, `packages/wallet`, `packages/database`, `apps/web` and a new `apps/server/src/person-policies.ts`, none of which that lane touches. The wiring is the **last** commit of this step; I will not make it while those files are dirty. If the lane has not landed by Saturday morning I will hand Kristjan the five-line diff rather than edit around someone's live work. Commits are `git commit -- <paths>`, never `git add -A`.

### 4. Grant, re-grant, migrate — 3h

`alreadyAttached` (`agent-signer.ts:152`) today checks only `signer_id`; it returns `override_policy_ids` too (`WalletAdditionalSignerItem` carries them). That gives three states, and `AgentSignerState` gains `"shared"`:

| State | What happens |
| --- | --- |
| No signer | mint their policy, show the grant sheet with their policy id |
| Signer under _their_ policy | nothing; this is the resting state |
| Signer under the _shared_ policy (everyone who granted before today) | their policy is minted, and Settings reads "the agent is on Froggy's old shared rules — set your own", one button |

The move-to-your-own path is two browser calls: `removeSigners({address})` then `addSigners({address, signers: [{signerId, policyIds: [theirs]}]})`. Privy accepts only one policy per signer, so re-adding is the only way to swap it; the gap between them is milliseconds and the agent is refused during it, which is the safe direction.

**No duplicates.** Three guards, deliberately belt and braces: the stored `privy_policy_id` is checked first; the mint carries `privy-idempotency-key` derived from the DID (24-hour window at Privy); and the in-flight `Map` pattern from `hedera-accounts.ts` dedupes two tabs racing on the same first request. A second device finds the id in the store and grants under it; a re-grant is a no-op at Privy.

### 5. Expiry and revocation — 2h

Every minted rule carries `system.current_unix_timestamp lt (now + 30 days)`. The mandate gets the matching `expiry` rule at the same instant, so a policy we may not be able to edit still goes quiet on time on our side — `authorize` already denies `expired` (`policy.ts:321`) and does it without a network call. **Disconnect** in Settings: browser `removeSigners`, then the server clears the stored policy id and drops the allowance from the mandate. Either half alone is sufficient to stop the agent; the browser half is the one that is the person's. **The nudge at three days** rides the existing minute tick and `TelegramPager.notify` (`apps/server/src/notices.ts`) — one card, an Extend button, no new schedule machinery.

### 6. The allowance form, written once, mounted twice — 3h

`apps/web/src/components/settings/allowance-form.tsx`: four fields, the person's numbers, stated in dollars and days. Mounted in the grant sheet behind the **Adjust** link and in Settings as **Change**. One tap still grants with the defaults showing, so the demo beat is unchanged and a judge who asks "do they set their own rules?" is shown the form in two seconds. The form has two submit modes and this is why it is one component: when the policy is person-owned it produces the authorization signature in the browser (Spike 0a's path) and posts it to a relay route; when app-owned it posts the four numbers and the server PATCHes. **Extend** is the same form with only the date moved. `e2e/allowance.spec.ts`: grant with defaults, adjust, change in Settings, extend, disconnect.

### 7. Evidence and the decision record — 1.5h

`docs/evidence/PRIVY.md` gains the three spike verdicts, each with its Privy response quoted. `docs/decisions/0019-user-owned-policies.md` records: why per person, why owned by the person, what we gave up to get it, that trading and the Hedera `raw_sign` leg are out of scope and why, and that rolling caps are host-side unless 0c said otherwise.

### 8. Gate and deploy — 1.5h

`heavy bun run check` and `heavy bun run e2e` — one at a time, exit **75** means run it again when the other finishes, never a failure, and never piped (`set -o pipefail` or no pipe at all). Pathspec commits as each piece lands and is green, not one commit at the end. Push with `LEFTHOOK=0`; watch that CI is not cancelled by a following push, since a cancelled run makes Railway skip.

**Total: ~3.5h of spikes + ~19h of build.** Thursday afternoon, Friday, Saturday.

---

## What I cut if Saturday arrives early

In this order, and I would stop as soon as the day is safe:

1. **The three-day nudge.** The expiry condition itself stays, so the leash is identical; only the reminder goes. −45 min.
2. **The Adjust link in the grant sheet.** The form lives in Settings only. −45 min.
3. **Spike 0c and per-wallet aggregations.** Rolling caps stay host-side and the honesty box says so, as it does today. −20 min.
4. **Per-person numbers.** Everyone gets a policy of their own carrying the same defaults. Ownership, expiry, revocation, the mint and the migration all survive; only "you choose your own numbers" goes. −3h, and it is the deepest cut that keeps the claim intact.

**Never cut:** one policy per person, the expiry condition on every rule, the mandate mirroring both the ceilings and the expiry, and the Earn verdict.

If Spike 0a fails, the fallback is `owner: null` and steps 1–8 are otherwise unchanged; the only edit is one sentence in the ADR and the removal of the form's browser-signing mode, which is a simplification rather than extra work.

---

## Needs Kristjan (nobody else can do these)

1. **Spike 0a, the browser half** — one tap in a signed-in session against a dev-only button, ~10 minutes. This is the gate on the whole approach; earliest possible is best.
2. **Spike 0b** — $1–2 USDC on Base in the wallet the agent signs for, so an Earn deposit has something to deposit.
3. **The production re-grant** — his own wallet carries the signer under the shared policy today, so he is the first person through the migrate path in step 4.
4. **One dashboard check** — whether User management → Authentication → Advanced now lists **Server-side access**. It did not exist on 7 Sep. If it has appeared, the `user_jwts` exchange starts working server-side, Spike 0a's browser relay becomes unnecessary, and Extend and Change get much simpler.
5. **Nothing else in the Privy dashboard.** Minting per-person policies needs only the app secret we already hold, which is one of the reasons this shape was chosen.

---

## Verification

- `packages/wallet/src/policy.test.ts` and a new `packages/domain/src/authority.test.ts` prove the table decides the side, that a `transfer` always asks whatever its size, and that an over-threshold `service_payment` asks while an under-threshold one does not.
- `personPolicyRules` is pure, so its output is asserted against the committed `docs/privy-agent-policy.json` shape in a unit test — no network needed to know the rules are well formed.
- `persistence.test.ts` runs the new `Store.privyPolicy` against both memory and a disposable Postgres 17.
- `e2e/allowance.spec.ts` walks grant → adjust → change → extend → disconnect against local stubs at 1440 and 390.
- Live, on production, and this is what actually proves it: a person grants under their own policy; the agent signs a payment the policy allows; the agent is refused a payee it does not name, with `400 policy_violation` quoting **their** policy id, not the shared one; the person disconnects in the browser and the next attempt is refused because there is no signer. Each of those five lines goes into `docs/evidence/PRIVY.md` with Privy's own words.
- `heavy bun run check` and `heavy bun run e2e` green before the push, run one at a time.
