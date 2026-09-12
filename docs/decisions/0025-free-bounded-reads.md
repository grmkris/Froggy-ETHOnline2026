# 0025 — Free bounded reads before paid arbitrary ones

Status: accepted, 12 September 2026.

(Numbered 0025 because [0024](0024-browser-wallet-provider.md) records the browser wallet provider.)

A person pasted their own MetaMask address into the chat with no question. The agent read it through `pons_token`, which only knows Pons launches and so reported nothing, then bought a web search for the address, which was answered 422 by the provider on its paid retry while the chat kept reporting `running`. Nothing in that chain was a bug in a tool; each tool did what its description said. The failure was that the cheapest honest question, "what is this address", had no free answer, and the paid tools were shaped for a different question.

## Decision

Froggy distinguishes two kinds of chain read and prices them differently.

- **Free bounded reads** answer one fixed question with a fixed set of RPC calls on the server's own configured endpoints, at one pinned block per network, with capped output. `address_lookup` is one: code or no code, native and USDC balances, ERC-20 metadata when there is code, and whether the address is one of the person's own wallets. `pons_token` and `positions` are the same kind. They are free because their cost is bounded by construction and because the alternative is an agent guessing at a paid tool.
- **Paid arbitrary reads** let the caller choose the call. `rpc_read` takes any allowlisted method and parameters within its limits; `token_research` composes several sources. They stay paid because the caller, not the shape of the tool, decides how much work they do.

The agent is told, in its instructions and in every relevant tool description, to use the free read first for a bare address and never to buy `rpc_read`, `token_research`, `token_inspect` or web search to find out what an address is. The instructions also carry the person's own wallet addresses, so "your own wallet" is a fact the agent has before any read.

## Task status is a fact, not a guess

A service ticket's status now names the phase it is in: `quoted` and `running` are the customer payment settling, `paid` is the provider working. Status reads accept a `waitMs` and hold on the server until the task settles, so a model reads one answer instead of three identical `running`s. A provider failure records which leg failed and a capped excerpt of what the provider said. A restart marks the tasks it orphaned `uncertain` in the store, so every surface agrees. None of this retries or refunds anything; a stale payment is for a human to check.

## What was declined

- Making `rpc_read` free for "simple" methods. The line between simple and expensive is the caller's choice of parameters, which is exactly what a free tool must not depend on.
- Reading the owner's Privy wallet on every turn for the prompt. It is a network call per turn; the session's own signer addresses are free, and `address_lookup` names the owner wallet in `mine` when it is asked.
- Resuming orphaned service workers at boot. A worker that died between reserving a spend and writing its receipt cannot be safely replayed; the honest state is `uncertain`.
