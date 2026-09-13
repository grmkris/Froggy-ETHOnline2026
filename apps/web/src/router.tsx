import { HistoryId, TaskId, EmailId, EmailDraftId } from "@froggy/domain";
import { ServiceName } from "@froggy/protocol";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
} from "@tanstack/react-router";
import { Schema } from "effect";

import { AppShell } from "./components/app-shell";
import { WorkspaceLayout } from "./routes/workspace-layout";

const rootRoute = createRootRoute({ component: AppShell });

/** Public previews never mount workspace sockets or account queries. */
const landingIndexRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/landing-page"),
    "LandingIndexPage"
  ),
  getParentRoute: () => rootRoute,
  path: "/landing",
});

const landingPlaygroundRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/landing-page"),
    "LandingIndexPage"
  ),
  getParentRoute: () => rootRoute,
  path: "/landing/playground",
});

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
/**
 * Three tabs on one route. `record` opens the evidence panel, `task` a service
 * result, `service` a tool's own form; a value the page cannot keep is said,
 * not swallowed.
 */
const ActivitySearch = Schema.Struct({
  tab: Schema.optional(Schema.Literals(["activity", "agents", "tools"])),
  record: Schema.optional(HistoryId),
  task: Schema.optional(TaskId),
  service: Schema.optional(
    Schema.Union([ServiceName, Schema.Literal("pay_url")])
  ),
  dropped: Schema.optional(Schema.Literal("1")),
});
const activityRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/activity-page"),
    "ActivityPage"
  ),
  getParentRoute: () => workspaceRoute,
  path: "/activity",
  validateSearch: (raw: {
    readonly tab?: unknown;
    readonly record?: unknown;
    readonly task?: unknown;
    readonly service?: unknown;
  }): typeof ActivitySearch.Type => {
    const decoded = Schema.decodeUnknownResult(ActivitySearch)(raw);
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
const InboxSearch = Schema.Struct({
  message: Schema.optional(EmailId),
  draft: Schema.optional(EmailDraftId),
  compose: Schema.optional(Schema.Literals(["new", "reply"])),
  view: Schema.optional(Schema.Literal("outgoing")),
});
const inboxRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/inbox-page"),
    "InboxPage"
  ),
  getParentRoute: () => workspaceRoute,
  path: "/inbox",
  validateSearch: (raw: {
    readonly message?: unknown;
    readonly draft?: unknown;
    readonly compose?: unknown;
    readonly view?: unknown;
  }): typeof InboxSearch.Type => {
    const result = Schema.decodeUnknownResult(InboxSearch)(raw);
    if (result._tag !== "Success") {
      return {};
    }
    const { message, draft, compose, view } = result.success;
    if (draft) {
      return compose
        ? { draft, view: "outgoing", compose: "new" }
        : { draft, view: "outgoing" };
    }
    if (compose === "new") {
      return { compose };
    }
    if (message) {
      return compose === "reply" ? { message, compose } : { message };
    }
    return view ? { view } : {};
  },
});
const walletRoute = page(
  "/wallet",
  async () => await import("./routes/wallet-page"),
  "WalletPage"
);
/** Connections moved into Activity; the old address still arrives there. */
const AgentsRedirect = () => (
  <Navigate replace search={{ tab: "agents" }} to="/activity" />
);
const agentsRoute = createRoute({
  component: AgentsRedirect,
  getParentRoute: () => workspaceRoute,
  path: "/agents",
});
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
  landingIndexRoute,
  landingPlaygroundRoute,
  workspaceRoute.addChildren([
    homeRoute,
    welcomeRoute,
    chatRoute,
    conversationRoute,
    inboxRoute,
    watchlistRoute,
    watchlistDetailRoute,
    activityRoute,
    walletRoute,
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
