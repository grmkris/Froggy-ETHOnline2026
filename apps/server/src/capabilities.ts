import { OAuthGrantId } from "@froggy/domain";
import type { AgentConnectionId, OAuthScope, UserId } from "@froggy/domain";
import type { Store } from "@froggy/wallet";

export type ToolSurface = "chat" | "browse" | "schedule" | "monitor";
interface Capability {
  readonly names: readonly string[];
  readonly surfaces: readonly ToolSurface[];
  readonly scope: OAuthScope | null;
  readonly writes: boolean;
}

/** The same catalogue selects model tools and checks execution authority. */
export const CAPABILITIES: readonly Capability[] = [
  {
    names: [
      "browser_navigate",
      "browser_snapshot",
      "browser_click",
      "browser_type",
    ],
    surfaces: ["browse", "monitor"],
    scope: "browse",
    writes: true,
  },
  {
    names: [
      "email_address",
      "email_search",
      "email_read",
      "email_file_read",
      "email_wait",
    ],
    surfaces: ["chat", "browse", "schedule"],
    scope: "email:read",
    writes: false,
  },
  {
    names: ["email_document", "email_draft", "email_draft_status"],
    surfaces: ["chat", "browse", "schedule"],
    scope: "email:draft",
    writes: true,
  },
  {
    names: ["watchlist_get", "watchlist_list", "wallet_monitor_status"],
    surfaces: ["chat", "browse", "schedule", "monitor"],
    scope: "watchlist:read",
    writes: false,
  },
  {
    names: ["watchlist_save", "watchlist_update", "watchlist_archive"],
    surfaces: ["chat", "browse"],
    scope: "watchlist:write",
    writes: true,
  },
  {
    names: [
      "onchain_alert_configure",
      "track_wallet",
      "wallet_monitor_update",
      "monitor_configure",
      "monitor_list",
      "monitor_pause",
      "monitor_resume",
      "monitor_check",
    ],
    surfaces: ["chat", "browse"],
    scope: "automation",
    writes: true,
  },
  {
    names: ["schedule", "schedules_list", "schedule_cancel"],
    surfaces: ["chat", "browse"],
    scope: "automation",
    writes: true,
  },
  {
    names: ["notify"],
    surfaces: ["chat", "browse", "schedule"],
    scope: "notifications",
    writes: true,
  },
  {
    names: [
      "services_list",
      "service_status",
      "market_search",
      "token_inspect",
      "token_research",
      "rpc_read",
      "graph_discover",
      "graph_query",
      "service_run",
    ],
    surfaces: ["chat", "browse", "schedule"],
    scope: "services",
    writes: false,
  },
  {
    names: ["x402_fetch", "x402_probe", "wallet_status"],
    surfaces: ["chat", "browse", "schedule"],
    scope: "pay",
    writes: true,
  },
  { names: ["credits_balance", "history_search"], surfaces: ["chat"], scope: null, writes: false },
  {
    names: [
      "browse_task",
      "positions",
      "address_lookup",
      "pons_token",
      "trade_capabilities",
      "trade_prepare",
      "trade_execute",
      "trade_status",
      "trade_simulate",
      "watch_launches",
      "watch_status",
      "watch_cancel",
      "quote_action",
      "wallet_send",
    ],
    surfaces: ["chat"],
    scope: null,
    writes: true,
  },
  {
    names: ["task_report"],
    surfaces: ["browse", "monitor"],
    scope: null,
    writes: false,
  },
];

export const capabilityFor = (name: string): Capability | undefined =>
  CAPABILITIES.find((entry) =>
    entry.names.includes(name.replace(/^froggy_/u, ""))
  );

/** Null means the owner. Legacy tokens retain only their original permissions. */
export const connectionScopes = async (
  store: Store,
  owner: UserId,
  connection: AgentConnectionId | null
): Promise<ReadonlySet<OAuthScope> | null> => {
  if (connection === null) {
    return null;
  }
  if (OAuthGrantId.is(connection)) {
    const found = await store.oauth.grants.byId(connection);
    if (!found || found.userId !== owner || found.grant.revokedAt !== null) {
      throw new Error(
        "This agent connection was revoked. Reconnect in Agents."
      );
    }
    return new Set(found.grant.scopes);
  }
  const tokens = await store.agents.list(owner);
  const token = tokens.find((entry) => entry.id === connection);
  if (!token || token.revokedAt !== null) {
    throw new Error("This agent connection was revoked.");
  }
  return new Set<OAuthScope>(["brief", "browse", "pay", "services"]);
};

export const canUseTool = (
  name: string,
  surface: ToolSurface,
  scopes: ReadonlySet<OAuthScope> | null
): boolean => {
  const capability = capabilityFor(name);
  return (
    capability !== undefined &&
    capability.surfaces.includes(surface) &&
    (scopes === null ||
      (capability.scope === null
        ? name === "task_report"
        : scopes.has(capability.scope)))
  );
};
