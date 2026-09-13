# Listing Froggy: plan for approval (13 Sep 2026)

Written for Jonas's ask in the group ("prepare everything so we can get listed,
give us a short plan and wait for approval by Kris"). Nothing below has been
submitted anywhere. Every outward step waits for Kristjan's go.

## What production advertises right now

Read from the live URL at 11:40 CEST, HEAD `56d9e6a` (the credits merge):

- `/.well-known/x402.json` describes **credit funding**, not paid endpoints:
  `authentication.required: true`, `billing.kind: platform_credits`, two funding
  methods (USDC on Base to `0x8Cc2…08C2`, HBAR on Hedera mainnet to
  `0.0.10847556`), and `resources: []`.
- `/api/credits`, `/api/credits/purchases` and `/mcp` answer 401 without a
  sign-in. `/skill.md` is public. The old `/oracle/snapshot` 402 is gone (ADR
  0033 "Public migration": anonymous per-resource selling retired, 410).
- HCS topic `0.0.10847557` holds the settlement notes from before the change.

So there is **no public priced resource** today. That decides which venues can
take us as we are.

## The decision Kristjan has to make

**A. List as we are (recommended).** The story is "an MCP server whose credits
are bought through x402 on Base or Hedera". Venues that fit: the MCP registries,
the curated awesome-x402 list, and our own HCS topic. Venues that probe for a
402 (agent-tools.cloud, x402-list.com's liveness check) will not accept us.
No code change, no risk to the 20:00 submission.

**B. Re-expose one public priced resource** (for instance the oracle snapshot
at 0.05 HBAR) so the x402 directories have something to index. This reverses
part of ADR 0033 on submission day, on the money path, while three lanes are
still merging. Not recommended today; possible after submission.

## The plan under A, in order

1. **HCS listing note** on topic `0.0.10847557`: one message carrying the card
   URL, the MCP URL, the two funding methods and the repo. This is the venue
   Hedera judges will read. Needs the service account key, which lives in the
   Railway variables; run as a one-off script from a pane with the variable
   exported, cost under one cent of HBAR. Sequence number goes into
   `docs/evidence/HEDERA.md`.
2. **awesome-x402** (github.com/xpaysh/awesome-x402): a pull request adding
   Froggy under services, with the card URL, "credits funded by x402, Base USDC
   or Hedera HBAR" and the repo link. Opened from Kristjan's GitHub through
   `gh`, so it is his name on it; he can also open it himself from the text in
   this file.
3. **MCP Registry** (registry.modelcontextprotocol.io): publish a `server.json`
   named `io.github.grmkris/froggy` pointing at the remote `/mcp` with OAuth
   noted. Needs `mcp-publisher login github` in a browser once (Kristjan). The
   `server.json` gets committed to the repo.
4. **Glama and Smithery**: web forms taking the repo URL and the remote MCP URL.
   Whoever is logged in submits; the text is in the block below.
5. **x402-list.com**: submit the card URL through the form. Their check may
   reject a card with no resources; if it does, that is reported, not worked
   around.
6. **Skip**: CDP Bazaar and agentic.market (index only CDP-facilitator sellers),
   agent-tools.cloud (needs a live 402), UCP (a manifest on our own domain, no
   registry to list in).

## Copy for every form

- Name: Froggy
- One line: An agent that pays for its own tools with a leash. Credits are
  bought through x402 with USDC on Base or HBAR on Hedera; every spend has a
  cap, a receipt and a stop button.
- Card: https://app-production-58dd.up.railway.app/.well-known/x402.json
- MCP: https://app-production-58dd.up.railway.app/mcp (OAuth sign-in)
- Skill: https://app-production-58dd.up.railway.app/skill.md
- Repo: https://github.com/grmkris/Froggy-ETHOnline2026
- Chains: eip155:8453 (USDC), hedera:mainnet (HBAR, facilitator Blocky402)
- Category: agent tools, payments, DeFi data

## What I will do once approved

Steps 1, 2 and the `server.json` for 3, each as its own commit or PR, one
line to the group per step. Steps 3 (the login), 4 and 5 need a human in a
browser; I will hand over the copy above and say which one is next.
