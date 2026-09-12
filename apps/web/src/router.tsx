import { HistoryId, TaskId } from "@froggy/domain";
import { ServiceName } from "@froggy/protocol";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";
import { Schema } from "effect";

import { AppShell } from "./components/app-shell";
import { WorkspaceLayout } from "./routes/workspace-layout";

const rootRoute = createRootRoute({ component: AppShell });

/**
 * The workspace holds the sockets and the conversation; its pages are the
 * routes beneath it. Not lazy: it is the first thing every page needs.
 */
const workspaceRoute = createRoute({
  component: WorkspaceLayout,
  getParentRoute: () => rootRoute,
  id: "workspace",
});

const page = <const Path extends string, Name extends string>(
  path: Path,
  load: () => Promise<Record<Name, React.ComponentType>>,
  name: Name
) =>
  createRoute({
    component: lazyRouteComponent(load, name),
    getParentRoute: () => workspaceRoute,
    path,
  });

const homeRoute = page(
  "/",
  async () => await import("./routes/home-page"),
  "HomePage"
);
/** Three steps after sign-up. Under the workspace for its sockets; drawn without its frame. */
const welcomeRoute = page(
  "/welcome",
  async () => await import("./routes/welcome-page"),
  "WelcomePage"
);
/** The current conversation. Home starts one and sends the person here. */
const chatRoute = page(
  "/chat",
  async () => await import("./routes/chat-page"),
  "ChatPage"
);
const conversationRoute = page(
  "/chat/$conversationId",
  async () => await import("./routes/chat-page"),
  "ChatPage"
);
const activityRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/activity-page"),
    "ActivityPage"
  ),
  getParentRoute: () => workspaceRoute,
  path: "/activity",
  validateSearch: (raw: { readonly record?: unknown }) => {
    const decoded = Schema.decodeUnknownResult(
      Schema.Struct({
        dropped: Schema.optional(Schema.Literal("1")),
        record: Schema.optional(HistoryId),
      })
    )(raw);
    if (decoded._tag === "Success") {
      return decoded.success;
    }
    return { dropped: "1" as const };
  },
});
interface WatchlistSearch {
  readonly discover?: boolean;
}
const watchlistRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/watchlist-page"),
    "WatchlistPage"
  ),
  getParentRoute: () => workspaceRoute,
  path: "/watchlist",
  validateSearch: (raw: { readonly discover?: unknown }): WatchlistSearch =>
    raw.discover === true || raw.discover === "true" ? { discover: true } : {},
});
const watchlistDetailRoute = page(
  "/watchlist/$itemId",
  async () => await import("./routes/watchlist-page"),
  "WatchlistPage"
);
const exploreRoute = page(
  "/explore",
  async () => await import("./routes/explore-page"),
  "ExplorePage"
);
const walletRoute = page(
  "/wallet",
  async () => await import("./routes/wallet-page"),
  "WalletPage"
);
/** The chosen service, when the URL names one; anything else is no choice. */
const ServicesSearch = Schema.Struct({
  dropped: Schema.optional(Schema.Literal("1")),
  service: Schema.optional(ServiceName),
  task: Schema.optional(TaskId),
});
const decodeServicesSearch = Schema.decodeUnknownResult(ServicesSearch);
type ServicesSearch = typeof ServicesSearch.Type;

/** What the router hands over: whatever the URL held under that key. */
interface ServicesSearchInput {
  readonly dropped?: unknown;
  readonly service?: unknown;
  readonly task?: unknown;
}

/** Only a known service or task survives; a bad name is flagged, not silent. */
const servicesSearch = (raw: ServicesSearchInput): ServicesSearch => {
  const decoded = decodeServicesSearch(raw);
  if (decoded._tag === "Success") {
    return decoded.success;
  }
  return { dropped: "1" };
};

const servicesRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/services-page"),
    "ServicesPage"
  ),
  getParentRoute: () => workspaceRoute,
  path: "/services",
  validateSearch: servicesSearch,
});
const agentsRoute = page(
  "/agents",
  async () => await import("./routes/agents-page"),
  "AgentsPage"
);
const agentDetailRoute = page(
  "/agents/$id",
  async () => await import("./routes/agent-detail-page"),
  "AgentDetailPage"
);
const settingsRoute = page(
  "/settings",
  async () => await import("./routes/settings-page"),
  "SettingsPage"
);

/** The page alone, for the pop-out window. */
const browserRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/browser-window-page"),
    "BrowserWindowPage"
  ),
  getParentRoute: () => rootRoute,
  path: "/browser",
});

/** An MCP client asking for the person's consent; the server vets the request. */
const oauthAuthorizeRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/oauth-authorize-page"),
    "OAuthAuthorizePage"
  ),
  getParentRoute: () => rootRoute,
  path: "/oauth/authorize",
});

/** The code, for a client with no browser of its own to receive it on. */
const oauthManualRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/oauth-manual-page"),
    "OAuthManualPage"
  ),
  getParentRoute: () => rootRoute,
  path: "/oauth/manual",
});

const routeTree = rootRoute.addChildren([
  workspaceRoute.addChildren([
    homeRoute,
    welcomeRoute,
    chatRoute,
    conversationRoute,
    watchlistRoute,
    watchlistDetailRoute,
    exploreRoute,
    activityRoute,
    walletRoute,
    servicesRoute,
    agentsRoute,
    agentDetailRoute,
    settingsRoute,
  ]),
  browserRoute,
  oauthAuthorizeRoute,
  oauthManualRoute,
]);

export const router = createRouter({
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
