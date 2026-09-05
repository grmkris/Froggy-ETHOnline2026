/**
 * The single architectural declaration for this repository.
 *
 * Every dependency rule is stated here once. `tools/oxlint/boundaries.ts` turns
 * these entries into lint diagnostics that fire in the editor and in
 * `bun run check:fast`, so a boundary violation is visible while it is being
 * written rather than at the end of a session.
 *
 * If a rule is not in this file, it is not a rule.
 */

/** Where a workspace sits in the dependency order. */
type Layer = "app" | "contract" | "engine" | "view" | "adapter" | "foreign";

export interface Node {
  /** Workspace directory, relative to the repository root. */
  readonly dir: string;
  /** Package name, or null for workspaces that are not TypeScript. */
  readonly name: string | null;
  readonly layer: Layer;
  /** One sentence. Describes what this workspace owns. */
  readonly role: string;
  /** Workspace packages this one may import. Empty means leaf. */
  readonly mayImport: readonly string[];
  /**
   * External packages this workspace may import, matched on the package prefix
   * so subpaths such as `viem/chains` resolve to `viem`.
   *
   * This is an allowlist, not a denylist: a package absent from the list is
   * forbidden. A denylist can only forbid what somebody already thought of,
   * which is the wrong shape for a rule meant to constrain an agent that is
   * inventing new dependencies.
   *
   * Omit the field entirely to mean unrestricted. Only composition roots, which
   * legitimately reach for anything, should omit it.
   */
  readonly mayUse?: readonly string[];
  /**
   * Required when a workspace is unreachable from any app, and forbidden when
   * it is reachable, so a seam cannot quietly outlive the reason it was kept.
   */
  readonly seam?: {
    readonly consumer: string;
    readonly reason: string;
  };
}

/** Module specifiers every workspace may use, regardless of its allowlist. */
export const alwaysAllowed: readonly string[] = ["bun", "bun:test"];

export const nodes: readonly Node[] = [
  {
    dir: "apps/web",
    name: "@froggy/web",
    layer: "app",
    role: "Composition root for React, TanStack Router, the three panes, and Privy.",
    mayImport: ["@froggy/domain", "@froggy/protocol", "@froggy/ui"],
  },
  {
    dir: "apps/server",
    name: "@froggy/server",
    layer: "app",
    role: "Bun process, agent loop, and the only place a live page and a signing key meet.",
    mayImport: [
      "@froggy/browser",
      "@froggy/domain",
      "@froggy/graph",
      "@froggy/payments",
      "@froggy/protocol",
      "@froggy/wallet",
    ],
  },
  {
    dir: "packages/domain",
    name: "@froggy/domain",
    layer: "contract",
    role: "Schema-backed identifiers, money, mandates, decisions, and receipts. No UI, transport, or persistence.",
    mayImport: [],
    mayUse: ["effect", "typeid-js"],
  },
  {
    dir: "packages/protocol",
    name: "@froggy/protocol",
    layer: "contract",
    role: "Versioned wire schemas for both sockets; every message carries an explicit `v`.",
    mayImport: ["@froggy/domain"],
    mayUse: ["effect"],
  },
  {
    dir: "packages/browser",
    name: "@froggy/browser",
    layer: "engine",
    role: "The shared Chrome: CDP seam, screencast, arbitration, input, snapshot. Knows nothing about money.",
    mayImport: ["@froggy/domain", "@froggy/protocol"],
    // Node builtins because locating Chrome is a filesystem question: the
    // binary lives at an OS-specific path or in a Playwright cache, and there
    // is no way to answer "where is Chrome" without reading a directory.
    mayUse: ["effect", "node:fs", "node:os", "node:path"],
  },
  {
    dir: "packages/wallet",
    name: "@froggy/wallet",
    layer: "adapter",
    role: "Privy, the policy engine, and the spend ledger. The leash. Never imports the browser.",
    mayImport: ["@froggy/database", "@froggy/domain"],
    mayUse: ["effect", "@privy-io/node", "drizzle-orm", "postgres"],
  },
  {
    dir: "packages/payments",
    name: "@froggy/payments",
    layer: "adapter",
    role: "x402 client and resource-server gate, and the Hedera exact scheme.",
    mayImport: [],
    mayUse: ["@x402/core", "@x402/hedera", "effect"],
  },
  {
    dir: "packages/graph",
    name: "@froggy/graph",
    layer: "adapter",
    role: "The Graph gateway. The eyes: why a spend was worth making.",
    mayImport: [],
    mayUse: ["effect"],
  },
  {
    dir: "packages/ui",
    name: "@froggy/ui",
    layer: "view",
    role: "Source-owned shadcn/Base UI components and tokens. No product behavior.",
    mayImport: [],
    mayUse: [
      "@base-ui/react",
      "class-variance-authority",
      "cn",
      "lucide-react",
      "react",
      "react-dom",
    ],
  },
  {
    dir: "packages/database",
    name: "@froggy/database",
    layer: "adapter",
    role: "The Drizzle schema and the Postgres connection. The tables; not the queries.",
    mayImport: ["@froggy/domain"],
    mayUse: ["drizzle-kit", "drizzle-orm", "effect", "postgres"],
  },
];
