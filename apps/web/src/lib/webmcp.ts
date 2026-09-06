/**
 * WebMCP: the wallet as tools a browser-side agent can call.
 *
 * A page can expose tools to the browser's own agent through
 * `navigator.modelContext` (Chrome's Web Model Context proposal). Froggy
 * exposes four: three that read (balance, policy, receipts) and one that
 * spends — and the one that spends does not spend. It starts an ordinary
 * agent turn, which goes through the same mandate, the same ledger and the
 * same approval card as a turn typed into the composer. There is no path from
 * a page tool to money that skips the leash.
 *
 * The API is young and behind flags; where it is absent the descriptors are
 * still built (and tested), only never registered.
 */

import { formatUsd } from "@froggy/domain";
import type { Mandate, Receipt } from "@froggy/domain";
import type { WalletSummary } from "@froggy/protocol";

/** What we hand the browser. A subset of the proposal, typed locally. */
export interface WebMcpTool {
  readonly annotations: {
    readonly consequentialHint?: boolean;
    readonly readOnlyHint?: boolean;
  };
  readonly description: string;
  readonly execute: (input: { readonly url?: string }) => Promise<string>;
  readonly inputSchema: {
    readonly properties: Readonly<
      Record<string, { readonly type: string; readonly description: string }>
    >;
    readonly required?: readonly string[];
    readonly type: "object";
  };
  readonly name: string;
}

export interface ModelContext {
  readonly registerTool: (tool: WebMcpTool) => void;
  readonly unregisterTool?: (name: string) => void;
}

declare global {
  interface Navigator {
    /** Chrome's Web Model Context, behind a flag; absent everywhere else. */
    readonly modelContext?: ModelContext;
  }
}

export interface WebMcpSources {
  readonly mandate: Mandate | null;
  readonly receipts: readonly Receipt[];
  /** Starts an agent turn with this text; the leash does the rest. */
  readonly send: (text: string) => void;
  readonly wallet: WalletSummary | null;
}

const NO_INPUT = { properties: {}, type: "object" } as const;

/**
 * Sources are read at call time, not at registration, so a tool registered
 * once answers with the wallet as it is now.
 */
export const webMcpTools = (
  read: () => WebMcpSources
): readonly WebMcpTool[] => [
  {
    annotations: { readOnlyHint: true },
    description:
      "What this wallet has spent against its rolling cap, and its address.",
    execute: async () => {
      await Promise.resolve();
      const { wallet } = read();
      return wallet === null
        ? "The wallet is not connected yet."
        : `Address ${wallet.address ?? "unknown"}; ${formatUsd(wallet.windowSpentUsdMicros)} spent in the current window; balance ${wallet.balanceLabel}; Hedera pocket ${wallet.pocketUsdMicros === null ? "none" : formatUsd(wallet.pocketUsdMicros)}.`;
    },
    inputSchema: NO_INPUT,
    name: "get_balance",
  },
  {
    annotations: { readOnlyHint: true },
    description:
      "The mandate the agent is held to: caps, allowlists, approval threshold.",
    execute: async () => {
      await Promise.resolve();
      const { mandate } = read();
      if (mandate === null) {
        return "No mandate loaded yet.";
      }
      return JSON.stringify({ rules: mandate.rules }, null, 2);
    },
    inputSchema: NO_INPUT,
    name: "get_policy",
  },
  {
    annotations: { readOnlyHint: true },
    description: "The most recent receipts: what was paid or refused, and why.",
    execute: async () => {
      await Promise.resolve();
      return JSON.stringify(
        read()
          .receipts.slice(0, 20)
          .map((receipt) => ({
            at: receipt.at,
            decision: receipt.decision._tag,
            payee: receipt.intent.payee.label,
            purpose: receipt.intent.purpose,
            settlement: receipt.settlement?.transactionId ?? null,
            usdMicros: receipt.intent.usdMicros,
          })),
        null,
        2
      );
    },
    inputSchema: NO_INPUT,
    name: "list_receipts",
  },
  {
    annotations: { consequentialHint: true },
    description:
      "Ask Froggy to fetch a URL and pay its 402 if the mandate allows it. Starts an agent turn; the person's policy, ledger and approval card decide, not this tool.",
    execute: async ({ url }) => {
      await Promise.resolve();
      if (url === undefined || url.trim() === "") {
        return "A url is required.";
      }
      read().send(
        `Fetch ${url.trim()} and pay for it if it asks and the mandate allows.`
      );
      return "Asked. Watch the workspace: the receipt, or the refusal, appears there.";
    },
    inputSchema: {
      properties: {
        url: { description: "The URL that answers 402.", type: "string" },
      },
      required: ["url"],
      type: "object",
    },
    name: "pay_402",
  },
];

/** The browser's model context, when this browser has one. */
export const modelContextOf = (): ModelContext | null =>
  navigator.modelContext ?? null;

export type WebMcpStatus =
  | { readonly kind: "registered"; readonly tools: number }
  | { readonly kind: "unavailable" };

/** Register every tool; returns how to take them back. */
export const registerWebMcp = (
  context: ModelContext,
  tools: readonly WebMcpTool[]
): (() => void) => {
  for (const tool of tools) {
    context.registerTool(tool);
  }
  return () => {
    for (const tool of tools) {
      context.unregisterTool?.(tool.name);
    }
  };
};
