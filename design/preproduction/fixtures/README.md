# Fixtures

**Everything in this directory is simulated.** It exists to evaluate design before a scheduler, a merchant integration or a settlement path exists.

Two rules, both inherited from the repository's stub discipline in `AGENTS.md`:

1. **A simulated state must never be able to pass for a real one.** Anything derived from a fixture carries `"stubbed": true`, and any receipt it produces renders with the `stubbed` marker. This is the same failure mode the brief warns about for concept images.
2. **Invented, and obviously so.** Merchant and site domains use `.example`. Tokens, wallets, prices, APYs and timings are made up. None of it is a recommendation, a provider relationship, or evidence that a route works.

Currency defaults to EUR with explicit crypto asset and network units where relevant. Timestamps are ISO 8601 with an offset, and the UI shows the zone.

| File | Scenario | Demonstrates |
| --- | --- | --- |
| `shoes.json` | Compare, pick, merchant change, checkout handoff, receipt | Structured comparison; reauthorization on a changed detail; human handoff |
| `travel.json` | Itinerary, one watched price, a finding, pause | Scheduled — not continuous — background work with an expiry |
| `token.json` | Watched-wallet activity, evidence and risk, a reviewed trade, uncertain settlement | Evidence with sources; no safety claim; **uncertain without re-debit** |
| `paid-service.json` | Inbound MCP request, limited purchase, result and receipt | Delegated allowance narrower than the owner's |
| `telegram.json` | Notify, reopen, expire a stale approval, prevent a duplicate decision | One decision across two surfaces |

Each file carries `scenario`, `simulated: true`, a `demonstrates` list, and `steps` with an `at` timestamp. Steps are ordered and each names the `state` from `flows/STATE_MATRIX.md` it exercises, so a screen built from a fixture can be checked against the matrix rather than against a vibe.
