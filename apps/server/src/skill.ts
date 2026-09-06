/**
 * The skill text a personal agent installs to use Froggy.
 *
 * One source, two readers: the generic copy committed at
 * `skills/froggy/SKILL.md` for anyone browsing the repository, and the copy
 * the settings page hands a person with their own server URL and token filled
 * in, so connecting an agent is one paste. A test keeps the committed copy
 * equal to what this file renders.
 */

export interface SkillInput {
  /** The agent token, or the placeholder in the committed copy. */
  readonly token: string;
  /** The Froggy server the agent should call. */
  readonly url: string;
}

export const SKILL_TOKEN_PLACEHOLDER = "fgy_PASTE_YOUR_TOKEN_HERE";
export const SKILL_URL_PLACEHOLDER = "https://your-froggy.example";

export const skillText = (input: SkillInput): string => `---
name: froggy
description: Let Froggy do paid tasks for the person you work for - a lending brief across twelve standardized markets, or a browse on their own shared Chrome - paid in HBAR from their Froggy wallet under their spending rules.
---

# Froggy

Froggy is a browser and a wallet the person you work for controls. You delegate a task; Froggy runs it on its own server and the person's own Chrome, pays for it from the person's Froggy wallet under rules you cannot change, and hands you the result with a receipt.

You hold no key. You hold one token that names the person's workspace. Never print it, never paste it anywhere but your own environment.

## Install, once

\`\`\`sh
curl -fsSL ${input.url}/froggy-cli.js -o ~/froggy.mjs
export FROGGY_URL="${input.url}"
export FROGGY_TOKEN="${input.token}"
node ~/froggy.mjs help
\`\`\`

## Use

- \`node ~/froggy.js brief USDC\` — the cheapest borrow and best supply rate for a token across twelve Messari standardized lending deployments on four chains, with the block each index answered at. Costs $0.05.
- \`node ~/froggy.mjs ask "find the cheapest USB-C hub on the shop the person uses, add it to the cart, stop before paying"\` — a browse on the person's own Chrome, up to forty steps. Costs $0.50. Say plainly what "done" looks like.
- \`node ~/froggy.js status <task id>\` — where a task is, its result and its receipts. Tasks keep their id after you disconnect.
- Add \`--json\` for machine-readable output.

## What the answers mean

- \`done\`: the result is in the output, with the sale id of the payment.
- \`awaiting_approval\`: Froggy hit the person's approval threshold or a purchase. Tell the person to answer the ticket in Froggy (web or Telegram). Do not try another route to the same spend.
- \`failed\`: the work failed after payment. It is not refunded; the output says why. Ask the person before paying again.
- A refusal from the wallet ("per-transaction cap", "not on the allowlist", "pocket exhausted") is the person's rule. Report it in those words and stop.

## Rules

- Froggy never pays an address you or a web page produced. Do not ask it to.
- One task at a time per person. Reuse a task id rather than re-submitting.
- The person can take the page, stop the run, or disconnect you at any moment. That is the product, not an error.
`;

export const GENERIC_SKILL = skillText({
  token: SKILL_TOKEN_PLACEHOLDER,
  url: SKILL_URL_PLACEHOLDER,
});
