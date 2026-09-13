import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack, antiSlop],
  // `.agents/skills` is vendored through skills-lock.json; see .prettierignore.
  ignorePatterns: [
    ...core.ignorePatterns,
    "tools/spikes/**",
    "design/landing/videos/*/assets/gsap.min.js",
    ".agents/skills/**",
  ],
  // Package boundaries are declared once in tools/graph.ts. Running them as a
  // lint rule puts them in the editor and in `check:fast`, not only in `check`.
  jsPlugins: ["./tools/oxlint/boundaries.ts"],
  rules: {
    "boundaries/no-cross-boundary-import": "error",
    "eslint/sort-keys": "off",
    "eslint/default-case": "off",
    // Effect Schema's contract idiom declares a value and its type under one
    // name (`const X = Schema...; export type X = typeof X.Type`). That is a
    // deliberate repository-wide pattern, not a local inconvenience, and `tsc`
    // still reports a genuine value/value redeclaration as TS2451.
    "eslint/no-redeclare": "off",
    // With `Schema.TaggedError` and `Context.Service`, `class` is a declaration
    // keyword rather than an OOP design choice, so a per-file limit of 1 is the
    // wrong shape here. 3 keeps a real ceiling.
    "eslint/max-classes-per-file": ["error", 3],
    // False positive against Effect's tagged-error idiom: the rule reads
    // `class E extends Schema.TaggedError<E>()(...)` as a bare `Error` call and
    // demands `new`, where `new` would be a syntax error. It fires on every
    // tagged error in the repository, so this is a systematic mismatch rather
    // than a local exception.
    "unicorn/throw-new-error": "off",
  },
  overrides: [
    {
      /**
       * Onchain block and outbox transactions consume ordered cursor pages.
       * Later records observe earlier writes (including price undo and per-user
       * notification slots). Parallel loops would violate those invariants;
       * RPC enrichment also consumes a shared bounded request allowance.
       */
      files: [
        "apps/server/src/wallet-monitor.ts",
        "apps/server/src/wallet-monitor-worker.ts",
        "apps/server/src/wallet-alert-delivery.ts",
        "apps/server/src/wallet-price-events.ts",
        "apps/server/src/wallet-activity.ts",
      ],
      rules: { "eslint/no-await-in-loop": "off" },
    },

    {
      /**
       * Onchain block and outbox transactions consume ordered cursor pages.
       * Later records observe earlier writes (including price undo and per-user
       * notification slots). Parallel loops would violate those invariants;
       * RPC enrichment also consumes a shared bounded request allowance.
       */
      files: [
        "apps/server/src/wallet-monitor.ts",
        "apps/server/src/wallet-monitor-worker.ts",
        "apps/server/src/wallet-alert-delivery.ts",
        "apps/server/src/wallet-price-events.ts",
        "apps/server/src/wallet-activity.ts",
      ],
      rules: { "eslint/no-await-in-loop": "off" },
    },
    {
      /**
       * Claude Design preview cards.
       *
       * design-sync resolves a component's preview by exact name —
       * `.design-sync/previews/<ComponentName>.tsx` — so these filenames are a
       * lookup key, not a style choice. Renaming them to kebab-case would
       * silently drop every card back to the unauthored placeholder. The rule
       * is right everywhere else in the repository; here it disagrees with the
       * tool's contract.
       */
      files: [".design-sync/previews/*.tsx"],
      rules: {
        "unicorn/filename-case": "off",
        // The previews import the bare package, `@froggy/ui`, which only the
        // design-sync converter resolves (it builds a barrel and links the
        // package under packages/ui/node_modules). No tsconfig in the repo
        // includes this folder and the package has no root export, so the
        // type-aware run sees every import as the error type and flags every
        // JSX return. The non-type rules still apply; these five only ever
        // fire on that unresolved import.
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/strict-boolean-expressions": "off",
      },
    },
    {
      /**
       * The Privy loader.
       *
       * Privy is imported dynamically so a build with no app id neither loads
       * it nor fails on it, and the bridge component therefore calls hooks off
       * a module object rather than off a static import. React Compiler cannot
       * prove those are the same functions across renders — it is right that it
       * cannot, and the guarantee comes from elsewhere: the module is loaded
       * once, stored in state, and never replaced, so every render after the
       * first sees the identical object.
       *
       * The alternative is a hard dependency on Privy in the bundle, which
       * would make an unconfigured build a blank page instead of a signed-out
       * one. This is one file and two rules.
       */
      files: ["apps/web/src/lib/privy.tsx"],
      rules: {
        "react/hooks": "off",
        "react/todo": "off",
        // A dynamically imported module has no static type. Asserting the three
        // exports this file calls is the narrowing, and there is nothing more
        // precise available to assert from.
        "typescript/no-unsafe-type-assertion": "off",
      },
    },
    {
      /**
       * Bridges to third-party SDK types.
       *
       * Both files hand a value to an SDK whose type is large, versioned by
       * that SDK, and validated by it on the very next call — the AI SDK's
       * `UIMessage` union in one, its Standard Schema interface in the other.
       * Restating either as an Effect Schema would be a second copy of someone
       * else's type, free to drift, and drifting silently: the SDK would keep
       * accepting what it accepts while our copy said otherwise.
       *
       * The envelope around each is still decoded. What is asserted is only the
       * part the SDK itself immediately checks.
       */
      files: ["apps/server/src/router.ts", "apps/server/src/std.ts"],
      rules: {
        "anti-slop/no-chained-type-assertions": "off",
        "typescript/no-unsafe-type-assertion": "off",
      },
    },
    {
      /**
       * Test assertions.
       *
       * A spec narrows a response body precisely so the expectations below it
       * can fail. Parsing it first would move the failure from the assertion —
       * where it is readable — into a decoder, where it is not.
       */
      files: ["e2e/**/*.ts", "**/*.test.ts"],
      rules: {
        "typescript/no-unsafe-type-assertion": "off",
      },
    },
    {
      /**
       * The Chrome DevTools Protocol boundary.
       *
       * The anti-slop rules ask for a parsed domain type at every I/O edge, and
       * they are right almost everywhere — every other wire format in this
       * repository is an Effect Schema. CDP is the exception: it is a foreign
       * protocol with several hundred methods whose payloads are defined by
       * Chrome's own JSON specification, and schematising the handful we use
       * would create a second, partial definition that a Chrome update could
       * silently invalidate. So this package narrows each payload at the call
       * site that knows the command, against the protocol documentation, and
       * `CdpPayload` names the boundary rather than pretending it is parsed.
       *
       * The scope is one directory and the rules are listed individually, so
       * this is a stated exception rather than a hole.
       */
      files: ["packages/browser/src/**/*.ts", "packages/browser/types/*.d.ts"],
      rules: {
        "anti-slop/no-runtime-typeof": "off",
        "anti-slop/no-unknown-parameters": "off",
        "anti-slop/no-unsafe-dictionary-type": "off",
        "typescript/no-unsafe-type-assertion": "off",
      },
    },
    {
      /**
       * Preproduction review scripts.
       *
       * These drive one browser page through an ordered sequence — click a
       * state, wait for the animation to be mid-flight, screenshot, read the
       * running-animation count, then the next state. The order is the point:
       * the page is a single piece of shared state, so the captures cannot run
       * in parallel. With `no-await-in-loop` on and `no-array-reduce` also on,
       * sequential async iteration has no readable spelling left, and the
       * clearest available form is the loop.
       *
       * One directory, one rule, stated rather than suppressed inline.
       */
      files: ["design/preproduction/tools/**/*.mjs"],
      rules: {
        "eslint/no-await-in-loop": "off",
        /*
         * These are standalone Node scripts, deliberately outside every
         * tsconfig — they drive a browser and read files, and giving them a
         * project just to satisfy a linter would be a tsconfig nobody builds.
         * With no type information, type-aware lint sees `process` and every
         * `page.evaluate` result as `error`/`any` and objects to all of it.
         * Ordinary lint still applies in full; only the rules that need types
         * they cannot have are off.
         */
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/strict-boolean-expressions": "off",
      },
    },
    {
      // Vendored shadcn CLI output. The generator owns this file's style and
      // will reimpose it on the next `shadcn add`, so matching repository style
      // here would be undone rather than preserved.
      files: ["packages/ui/src/components/**/*.{ts,tsx}"],
      rules: {
        "eslint/func-style": "off",
        "import/consistent-type-specifier-style": "off",
        "react/function-component-definition": "off",
      },
    },
    {
      /**
       * Token-research log paging.
       *
       * Holder reconstruction and launch-block search walk ordered block
       * ranges; each page's cursor depends on the previous page completing.
       * Parallelising would double-count Transfers or miss the first mint.
       * One rule, stated rather than suppressed inline.
       */
      files: [
        "apps/server/src/trading/holders.ts",
        "apps/server/src/trading/venues/**/*.ts",
        "apps/server/src/trading/research.ts",
      ],
      rules: {
        "eslint/no-await-in-loop": "off",
      },
    },
    {
      /**
       * Injected-wallet method table.
       *
       * `classifyWalletCall` is a closed dispatch over the `WalletRpcMethod`
       * union. Type-aware exhaustiveness requires every method in one switch;
       * that table is the contract (reads, identity, connect, and the three
       * signing shapes), not accidental complexity. Splitting it would hide
       * the exhaustiveness the rule is there to protect.
       */
      files: ["apps/server/src/wallet-call.ts"],
      rules: {
        "eslint/complexity": "off",
      },
    },
  ],
});
