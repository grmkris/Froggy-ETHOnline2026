# How AI was used

## In the product

- The agent runs on `qwen3.8-max` through an OpenAI-compatible endpoint (Alibaba's Token Plan), with Anthropic as a configured fallback. With no key set, a scripted model runs the same three steps and says so in its own words; the wallet strip marks the stub and every receipt it touches carries `stubbed: true`.
- The model never decides whether money moves. Every spend goes through the mandate in `packages/wallet/src/policy.ts`, evaluated outside the model, and the approval channel is a card for a person, not a tool.

## In building it

- Written with Claude (Claude Code, two concurrent sessions on the same tree: Opus 5 and Fable 5.1) from 4 to 5 Sep 2026, with the owner giving product direction, keys and dashboard steps, and reviewing what landed. `docs/plan/` holds the research and planning documents produced the same way; `docs/plan/STATUS.md` says what landed and when.
- Every change passed the same gate a person would run: format, type-aware lint, TypeScript, package-boundary check, tests, dead-code detection, and the Playwright suite for anything visible.
- Patterns for the shared browser (screencast, arbitration, fenced page text) and the stub discipline follow general practice; no project-specific code from elsewhere is included.
