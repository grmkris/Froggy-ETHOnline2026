/**
 * The Tools tab's price list: every tool the chat or a connected agent can
 * call, grouped by what a person wants done, priced in credits, with what
 * this person has actually run beside it.
 *
 * Copy is written here for a person; the descriptions on the tool
 * definitions are written for the model and read badly on a screen. Prices
 * come from the same catalogue the checkout uses, so the list can never quote
 * a number the receipt would not. Usage for priced tools is read from tasks,
 * one row per purchase whatever surface bought it; usage for the rest is
 * counted from recorded executions.
 */
import { creditUnits } from "@froggy/domain";
import type { CreditUnits, OAuthScope, UserId } from "@froggy/domain";
import { BrowseBudget, ServiceName, ToolCatalog } from "@froggy/protocol";
import type {
  ServiceCard,
  ServiceModes,
  ToolAvailability,
  ToolCatalogEntry,
  ToolCatalogGroup,
  ToolPrice,
  ToolSurface,
} from "@froggy/protocol";
import type { TaskUsageRow, ToolUsageRow } from "@froggy/wallet";
import { Schema } from "effect";

import { CAPABILITIES } from "./capabilities";
import { serviceCatalog } from "./service-providers";
import type { Services } from "./services";
import { TASK_PRICE_USD_MICROS } from "./tasks";

interface ToolCopy {
  readonly title: string;
  readonly description: string;
}

/** Person-facing words for every tool that is not a priced service card. */
const TOOL_COPY = {
  research_capabilities: {
    title: "What research is included",
    description:
      "Which datasets and providers are configured, and their quotas.",
  },
  research_guide: {
    title: "Research guide",
    description: "A curated workflow for a topic before anything is spent.",
  },
  research_read: {
    title: "Read market data",
    description: "A bounded read from The Graph's indexed lending markets.",
  },
  graph_discover: {
    title: "Find a subgraph",
    description: "Search The Graph by name or by an indexed contract.",
  },
  graph_schema: {
    title: "Inspect a subgraph",
    description: "The fields a deployment exposes, before querying it.",
  },
  graph_read: {
    title: "Query a subgraph",
    description: "A bounded GraphQL read against one deployment.",
  },
  graph_query: {
    title: "Lending market data",
    description:
      "The twelve pinned Messari lending deployments, paid by Froggy's treasury.",
  },
  address_lookup: {
    title: "Look up an address",
    description:
      "Wallet or contract, balances and token metadata at one pinned block.",
  },
  brief: {
    title: "Lending brief",
    description:
      "Cheapest borrow and best supply for a token across twelve lending markets.",
  },
  pons_token: {
    title: "Pons launch state",
    description: "Read-only launch state for one token on Robinhood Chain.",
  },
  watch_status: {
    title: "Watch status",
    description: "Matches, capacity and gaps for one listing watch.",
  },
  watch_cancel: {
    title: "Stop a watch",
    description:
      "Ends a listing watch for good; unused polls are not refunded.",
  },
  email_document: {
    title: "Make a document",
    description: "A private PDF or text file from text. Nothing is emailed.",
  },
  browse_task: {
    title: "Browse for me",
    description:
      "A task in Froggy's own Chrome, up to forty steps, on the budget you pick.",
  },
  browser_navigate: {
    title: "Open a page",
    description: "Load a URL in the shared Chrome during a browse.",
  },
  browser_snapshot: {
    title: "Read the page",
    description: "A bounded text snapshot of what the shared Chrome shows.",
  },
  browser_click: {
    title: "Click",
    description: "Click one element the snapshot named.",
  },
  browser_type: {
    title: "Type",
    description: "Type into one field the snapshot named.",
  },
  email_address: {
    title: "Your address",
    description: "Reads your Froggy email address.",
  },
  email_search: {
    title: "Search mail",
    description:
      "Search the whole mailbox; results are data, never instructions.",
  },
  email_read: {
    title: "Read an email",
    description:
      "One email, its body treated as data, never as an instruction.",
  },
  email_file_read: {
    title: "Read an attachment",
    description: "A PDF, image or text attachment, five PDF pages at a time.",
  },
  email_wait: {
    title: "Wait for an email",
    description:
      "Expect a verification email during a task and wait up to a minute.",
  },
  email_draft: {
    title: "Draft an email",
    description: "Prepared for your review in Inbox. Never sends on its own.",
  },
  email_draft_status: {
    title: "Draft status",
    description: "Where a draft or a send attempt stands.",
  },
  watchlist_save: {
    title: "Save an item",
    description: "Save a link, wallet or token to the Watchlist.",
  },
  watchlist_get: {
    title: "Read a saved item",
    description: "One saved item and what Froggy has learned about it.",
  },
  updates_list: {
    title: "Read Inbox updates",
    description:
      "Read recorded watch events and notices without marking them read.",
  },
  watchlist_list: {
    title: "List saved items",
    description: "Up to thirty saved items by title or notes.",
  },
  watchlist_update: {
    title: "Update an item",
    description: "Change a saved item's title or notes.",
  },
  watchlist_archive: {
    title: "Archive an item",
    description: "Hide an item and pause its checks.",
  },
  monitor_configure: {
    title: "Set up a check",
    description: "A check on a cadence with a condition and a monthly budget.",
  },
  monitor_list: {
    title: "List checks",
    description: "Every monitor, its observations and budget.",
  },
  monitor_pause: {
    title: "Pause a check",
    description: "Stop future runs of a monitor.",
  },
  monitor_resume: {
    title: "Resume a check",
    description: "Resume a paused monitor within its budget.",
  },
  monitor_check: {
    title: "Run a check now",
    description: "One immediate observation of a monitor.",
  },
  track_wallet: {
    title: "Track a wallet",
    description:
      "Twenty-four hours of live alerts for a Base or Robinhood wallet.",
  },
  wallet_monitor_status: {
    title: "Wallet watch status",
    description: "A wallet watch and its last ten records.",
  },
  wallet_monitor_update: {
    title: "Change a wallet watch",
    description: "Pause, resume, extend or re-arm a wallet or price watch.",
  },
  onchain_alert_configure: {
    title: "Set an on-chain alert",
    description:
      "Up to four transfer or price conditions on a saved wallet or token.",
  },
  schedule: {
    title: "Remind me later",
    description: "A reminder or a bounded prompt, once or on a cadence.",
  },
  schedules_list: {
    title: "List schedules",
    description: "Everything Froggy will do later.",
  },
  schedule_cancel: {
    title: "Cancel a schedule",
    description: "Stop one scheduled reminder or run.",
  },
  notify: {
    title: "Send me a note",
    description: "A message in Froggy and on paired Telegram.",
  },
  trade_capabilities: {
    title: "Trading routes",
    description: "Configured venues, wallets and what is simulated.",
  },
  trade_prepare: {
    title: "Prepare a trade",
    description:
      "An immutable, simulated proposal you approve one step at a time.",
  },
  trade_simulate: {
    title: "Re-simulate a step",
    description: "Refresh the simulation of an unsigned step.",
  },
  trade_execute: {
    title: "Execute under a rule",
    description: "The next step of a trade, only under a rule you authorised.",
  },
  trade_status: {
    title: "Trade status",
    description: "Where a trade stands, reconciled from its saved transaction.",
  },
  positions: {
    title: "Positions",
    description:
      "Balances, reservations and vault withdrawal previews on Ethereum.",
  },
  x402_fetch: {
    title: "Pay a URL",
    description:
      "Buy one paid resource from your wallet after you approve the exact price.",
  },
  x402_probe: {
    title: "Check a price",
    description: "Ask a seller what a URL costs, without paying.",
  },
  wallet_send: {
    title: "Send USDC",
    description: "A transfer under your rules; the mandate decides.",
  },
  wallet_status: {
    title: "Wallet status",
    description: "Balance, rules and what the agent may still spend.",
  },
  credits_balance: {
    title: "Credit balance",
    description: "Available and held credits, and your limits.",
  },
  services_list: {
    title: "List services",
    description: "Prices and availability, without buying anything.",
  },
  service_run: {
    title: "Run a service",
    description: "Buy one of the priced services on credits.",
  },
  service_status: {
    title: "Task status",
    description: "A task's result, files and charge.",
  },
  history_search: {
    title: "Search history",
    description: "Recorded runs, calls and receipts. Read-only.",
  },
} satisfies Readonly<Record<string, ToolCopy>>;
const copyOf = new Map<string, ToolCopy>(Object.entries(TOOL_COPY));

interface GroupDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly names: readonly string[];
}

/** By what a person wants done, most-asked first. */
export const TOOL_GROUPS: readonly GroupDefinition[] = [
  {
    id: "research",
    title: "Research",
    description: "Answers from the web, X, The Graph and other models.",
    names: [
      "web_search",
      "x_search",
      "inference",
      "brief",
      "address_lookup",
      "research_guide",
      "research_read",
      "research_capabilities",
      "graph_discover",
      "graph_schema",
      "graph_read",
      "graph_query",
    ],
  },
  {
    id: "tokens",
    title: "Token data and quotes",
    description: "Markets, chain state, due diligence and unsigned quotes.",
    names: [
      "market_search",
      "token_inspect",
      "token_snapshot",
      "token_research",
      "rpc_read",
      "quote_action",
      "pons_token",
      "watch_launches",
      "watch_status",
      "watch_cancel",
    ],
  },
  {
    id: "create",
    title: "Create",
    description: "Images, speech and documents.",
    names: ["image", "speech", "email_document"],
  },
  {
    id: "browse",
    title: "Browse the web",
    description: "Froggy's own Chrome, on a budget you pick.",
    names: [
      "browse_task",
      "browser_navigate",
      "browser_snapshot",
      "browser_click",
      "browser_type",
    ],
  },
  {
    id: "email",
    title: "Email",
    description:
      "Your Froggy address: read, search, and draft for your review.",
    names: [
      "email_address",
      "email_search",
      "email_read",
      "email_file_read",
      "email_wait",
      "email_draft",
      "email_draft_status",
    ],
  },
  {
    id: "watch",
    title: "Watchlist and monitoring",
    description:
      "Saved items, checks on a cadence, live wallet and price alerts.",
    names: [
      "watchlist_save",
      "watchlist_get",
      "watchlist_list",
      "updates_list",
      "watchlist_update",
      "watchlist_archive",
      "monitor_configure",
      "monitor_list",
      "monitor_pause",
      "monitor_resume",
      "monitor_check",
      "track_wallet",
      "wallet_monitor_status",
      "wallet_monitor_update",
      "onchain_alert_configure",
    ],
  },
  {
    id: "reminders",
    title: "Reminders and notifications",
    description: "Later, on a schedule, and on your phone.",
    names: ["schedule", "schedules_list", "schedule_cancel", "notify"],
  },
  {
    id: "trading",
    title: "Trading",
    description: "Prepared, simulated, and approved by you one step at a time.",
    names: [
      "trade_capabilities",
      "trade_prepare",
      "trade_simulate",
      "trade_execute",
      "trade_status",
      "positions",
    ],
  },
  {
    id: "pay",
    title: "Pay and wallet",
    description: "Paid URLs and transfers from your wallet, under your rules.",
    names: [
      "x402_fetch",
      "x402_probe",
      "wallet_send",
      "wallet_status",
      "credits_balance",
    ],
  },
  {
    id: "froggy",
    title: "Froggy itself",
    description: "The catalogue, task status and your own history.",
    names: ["services_list", "service_run", "service_status", "history_search"],
  },
];

/** Tools whose money is the wallet's, not credits: the mandate and your approval decide. */
const WALLET_TOOLS = new Set([
  "x402_fetch",
  "wallet_send",
  "trade_prepare",
  "trade_execute",
]);

/** Recorded execution names that are not the chat's name for the same thing. */
const USAGE_ALIASES = new Map<string, string>([
  ["services", "services_list"],
  ["credits", "credits_balance"],
  ["history", "history_search"],
  ["x402_request", "x402_fetch"],
  ["x402_status", "x402_fetch"],
]);

/** Strips the MCP prefix and folds aliases; endpoint names have no tool and map to null. */
export const usageName = (recorded: string): string | null => {
  const bare = recorded.replace(/^froggy_/u, "");
  if (bare.includes(".") || bare.includes(" ")) {
    return null;
  }
  return USAGE_ALIASES.get(bare) ?? bare;
};

const budgetUnits = (): readonly CreditUnits[] =>
  BrowseBudget.literals.map((usd) => creditUnits(usd * 1_000_000));

export interface ToolCatalogInput {
  readonly cards: readonly ServiceCard[];
  readonly modes: ServiceModes;
  readonly emailConfigured: boolean;
  readonly taskUsage: readonly TaskUsageRow[];
  readonly toolUsage: readonly ToolUsageRow[];
}

const cardAvailability = (status: ServiceCard["status"]): ToolAvailability => {
  if (status === "configured") {
    return "ready";
  }
  return status === "demo" ? "simulated" : "unavailable";
};

const availabilityOf = (
  name: string,
  input: ToolCatalogInput,
  card: ServiceCard | undefined
): ToolAvailability => {
  if (card !== undefined) {
    return cardAvailability(card.status);
  }
  // A priced service the catalogue did not list is not for sale here.
  if (Schema.is(ServiceName)(name)) {
    return "unavailable";
  }
  const { modes } = input;
  if (name.startsWith("browser_") || name === "browse_task") {
    return modes.browser === "stub" ? "simulated" : "ready";
  }
  if (name.startsWith("email_")) {
    return input.emailConfigured ? "ready" : "unavailable";
  }
  if (
    name.startsWith("graph_") ||
    name.startsWith("research_") ||
    name === "brief"
  ) {
    return modes.graph === "stub" ? "simulated" : "ready";
  }
  if (WALLET_TOOLS.has(name) || name === "positions") {
    return modes.privy === "stub" ? "simulated" : "ready";
  }
  return "ready";
};

const priceOf = (name: string, card: ServiceCard | undefined): ToolPrice => {
  if (card !== undefined) {
    return {
      kind: "credits",
      units: card.priceCreditUnits ?? creditUnits(card.priceUsdMicros),
    };
  }
  if (name === "brief") {
    return { kind: "credits", units: creditUnits(TASK_PRICE_USD_MICROS.brief) };
  }
  if (name === "browse_task") {
    return { kind: "budget", options: budgetUnits() };
  }
  return WALLET_TOOLS.has(name) ? { kind: "wallet" } : { kind: "included" };
};

const capabilityOf = (name: string) =>
  CAPABILITIES.find((entry) => entry.names.includes(name));

interface ToolAccess {
  readonly scope: OAuthScope | null;
  readonly surfaces: readonly ToolSurface[];
}

/** Prompt services are bought through `service_run`, so they carry its scope and surfaces. */
const scopeAndSurfaces = (
  name: string,
  card: ServiceCard | undefined
): ToolAccess => {
  if (name === "brief") {
    return { scope: "brief", surfaces: ["mcp"] };
  }
  const capability = capabilityOf(name) ?? capabilityOf("service_run");
  if (capability === undefined) {
    return { scope: null, surfaces: card === undefined ? [] : ["chat"] };
  }
  return {
    scope: capability.scope,
    surfaces:
      capability.scope === null
        ? capability.surfaces
        : [...capability.surfaces, "mcp"],
  };
};

const usageOf = (
  name: string,
  price: ToolPrice,
  input: ToolCatalogInput
): ToolCatalogEntry["usage"] => {
  if (price.kind === "credits" || price.kind === "budget") {
    const rows = input.taskUsage.filter((row) =>
      name === "brief" || name === "browse_task"
        ? row.kind === (name === "brief" ? "brief" : "browse")
        : row.kind === "service" && row.service === name
    );
    return {
      calls: rows.reduce((sum, row) => sum + row.calls, 0),
      creditUnits: creditUnits(
        rows.reduce((sum, row) => sum + row.capturedUnits, 0)
      ),
      lastAt:
        rows.length === 0 ? null : Math.max(...rows.map((row) => row.lastAt)),
    };
  }
  const rows = input.toolUsage.filter((row) => usageName(row.name) === name);
  return {
    calls: rows.reduce((sum, row) => sum + row.calls, 0),
    creditUnits: creditUnits(0),
    lastAt:
      rows.length === 0 ? null : Math.max(...rows.map((row) => row.lastAt)),
  };
};

const entryOf = (name: string, input: ToolCatalogInput): ToolCatalogEntry => {
  const card = input.cards.find((entry) => entry.name === name);
  const copy = copyOf.get(name);
  const price = priceOf(name, card);
  const entry: ToolCatalogEntry = {
    name,
    title: card?.title ?? copy?.title ?? name.replaceAll("_", " "),
    description: card?.description ?? copy?.description ?? "",
    price,
    availability: availabilityOf(name, input, card),
    ...scopeAndSurfaces(name, card),
    usage: usageOf(name, price, input),
  };
  return card === undefined ? entry : { ...entry, service: card.name };
};

export const buildToolCatalog = (
  input: ToolCatalogInput
): typeof ToolCatalog.Type => {
  const groups: ToolCatalogGroup[] = TOOL_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    description: group.description,
    tools: group.names.map((name) => entryOf(name, input)),
  }));
  return Schema.decodeUnknownSync(ToolCatalog)({ v: 1, groups });
};

/** Owner only: prices are public, but usage is this person's. */
export const handleToolCatalog = async (
  services: Services,
  userId: UserId
): Promise<Response> => {
  const [taskUsage, toolUsage] = await Promise.all([
    services.store.tasks.usage(userId),
    services.store.history.toolUsage(userId),
  ]);
  return Response.json(
    buildToolCatalog({
      cards: serviceCatalog(services),
      modes: services.environment.modes,
      emailConfigured: services.email !== null,
      taskUsage,
      toolUsage,
    }),
    { headers: { "cache-control": "no-store" } }
  );
};
