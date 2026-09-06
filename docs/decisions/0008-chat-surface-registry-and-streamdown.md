# 8. The chat surface: shadcn chat components in the UI package, Streamdown in the app

Date: 2026-09-06

## Status

Accepted.

## Context

The conversation is the product's ledger, but it rendered like a dev console: assistant text was a `<p>` with no markdown, scroll-follow was hand-rolled and did not track a message growing in place, tool calls were `<details>` with raw JSON, and the `shimmer` and `scroll-fade` utilities already ejected into `globals.css` were unused. Three options were researched on 6 Sep 2026: Vercel's AI Elements, the shadcn chat components released in June 2026, and a hand-rolled scroller with Streamdown.

AI Elements is Radix-only; its Base UI variant is an open pull request. This repository is on the shadcn Base UI style `base-nova`, and the five chat items (`message-scroller`, `message`, `bubble`, `marker`, `collapsible`) exist in the registry for exactly that style. The scroller's headless half, `@shadcn/react`, has no runtime dependencies and a React 19 peer, and anchors each new turn to the person's message rather than pinning to the bottom.

## Decision

- The chat components are ejected into `packages/ui` through the registry, the way every other component there was, and `@shadcn/react` joins that package's dependency allowlist in `tools/graph.ts`. The CLI is run from `packages/ui`: Bun installs are isolated per workspace, so a dependency declared by the app is not resolvable from the package.
- Streamdown renders the agent's text, in `apps/web` only. Rendering model output is product behaviour, which the UI package's role forbids, and the app is the composition root with no allowlist. No Streamdown plugins: the agent writes prose, tables and addresses, and the code plugin's syntax highlighter would add a large chunk and two hundred lazily loaded grammars for fenced code that rarely appears.
- Streamdown's Tailwind classes are reached by an explicit `@source` in the UI stylesheet pointing into the app's `node_modules`, checked against the built CSS, because node_modules is never scanned by default and a wrong path fails silently.

## Consequences

- Three classes in the ejected viewport (`scrollbar-thin`, `scrollbar-gutter-stable`, the `data-autoscrolling` variants) have no definition in this stylesheet and are removed rather than importing `shadcn/tailwind.css`, whose other utilities are already here.
- `content-visibility: auto` on scroller items is left off: Playwright's visibility checks and the live browser card's scroll-into-view misbehave inside skipped subtrees, and the stream is short.
- Links in agent output open in a new tab with `noopener noreferrer nofollow` and only for `http(s)` and `mailto`; images and raw HTML are dropped. Streamdown's own link-safety modal is disabled in favour of that policy. The default sanitising pipeline is not replaced.
- A one-time unlock link in a tool result is never rendered as an anchor; the agent opens it in the shared Chrome, and a click here would consume it.
- Streamdown is Apache-2.0; `@shadcn/react` is MIT. Zod stays forbidden (decision 0005).
