# Owner acceptance after the recovered release

7 September 2026. The recovered implementation is pushed and deployed at [Froggy](https://app-production-58dd.up.railway.app). Production health, OAuth discovery and invalid-token refusal pass. Local verification includes 480 unit tests, 56 browser tests, real Postgres operations, both CLI login modes under Node 20.20.2 and 22.23.2, and the official MCP SDK 1.30.0 completing OAuth and calling the service catalog. These local checks do not establish a real person's consent, a paid supplier delivery or a Telegram message.

The remaining steps need the owner's account or configuration. Record their outcomes in [HERMES.md](../evidence/HERMES.md), [MARKETPLACE.md](../evidence/MARKETPLACE.md) and [ITERATION_3.md](ITERATION_3.md).

## 1. Finish configuration

- Add `X_API_BEARER_TOKEN` to Railway's **app → production → Variables** using its secret input. Do not paste the credential into chat. The other four service entries already have their reviewed supplier rules and payees configured.
- Apply the planned Privy top-up limits: **10 USDC per transfer, 25 USDC per rolling 24 hours** on both Base networks. The live policy was read back during recovery and still held **2/5**. The committed policy is `docs/privy-agent-policy.json`.

From a checkout configured with the production Privy credentials, first read the policy and match its id to the policy shown under **Settings → Connection** in production. Review the committed rules before `apply`, which replaces that policy's rule list:

```sh
bun run privy:policy show
bun run privy:policy apply
bun run privy:policy show
```

No policy update was performed during recovery. Read back the resulting limits before treating this step as complete.

## 2. Prove a real external-agent connection

Connect an OAuth-capable MCP client to:

```text
https://app-production-58dd.up.railway.app/mcp
```

Sign in as the owner, consent, list tools, and call the read-only `froggy_services`. The result should contain five service entries; X remains unavailable until its credential is configured. In **Agents**, disconnect that client. Its next request with the old access token must be refused; a client that automatically reauthenticates should require fresh consent.

For Hermes or another terminal without a browser, use the deployed CLI:

```sh
curl -fsSL https://app-production-58dd.up.railway.app/froggy-cli.js -o ~/froggy.mjs
node ~/froggy.mjs login --url=https://app-production-58dd.up.railway.app --manual
node ~/froggy.mjs services
node ~/froggy.mjs logout
```

Open the printed authorization link in the owner's browser and paste its code only into the waiting CLI. Login links expire, so start this when the owner is available. The client stores its own credentials; do not paste tokens into chat. OAuth consent permits the connection's operations; it does not grant the wallet signer.

## 3. Prove funding and supplier delivery

Under **Settings → Connection**, choose **Let the agent sign under policy** if it is not already granted. Use a wallet with Base USDC and insufficient HBAR for the selected task to demonstrate automatic conversion. A purchase from an already funded Hedera balance does not prove that conversion ran.

Buy one small task per service through **Services** or the signed-in CLI. Start with web search; inspect its result before proceeding. The five listed customer prices total $0.53 before network fees; check the live catalog before buying. The original activation plan limits total supplier spend to less than $1 in treasury USDC.

For each task, retain its id, customer Hedera settlement, supplier Base settlement and delivered result in the marketplace evidence table. X uses API credits and has no supplier onchain transfer. For the conversion proof, also retain the Base USDC transfer and Hedera funding receipt.

The CLI accepts `--idempotency-key=<stable-request-id>`. Reuse the same key for the same request. A pending, failed or uncertain task is not a reason to buy it again; inspect the existing task and receipts first.

## 4. Prove Telegram delivery and restart recovery

Pair Telegram on **Agents** if needed; saved reminders are listed in **Settings**. Ask Froggy for a reminder in two minutes, confirm it appears in Settings, receive it on the phone, and reply. Then check a recurring reminder in the intended timezone and cancel it through Settings. Keep the observed due time and delivery time.

For restart recovery, schedule another reminder, confirm the schedule is saved, restart the app before it is due, and verify delivery once. This final check needs a coordinated restart; it was not claimed by the local schedule tests.

## 5. Inputs for the later card lane

Card checkout remains conditional on the preceding lanes completing before the Thursday feature freeze. It needs the **Linea card spender address** from the owner's verified approval and the **merchant/item** for the real checkout. The [mixed-flow scenarios](USER_FLOWS_MIXED.md) are written; card storage, masked autofill and the bank-verification handoff are not implemented yet.
