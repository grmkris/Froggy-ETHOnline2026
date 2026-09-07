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

const chatRoute = page(
  "/",
  async () => await import("./routes/chat-page"),
  "ChatPage"
);
const walletRoute = page(
  "/wallet",
  async () => await import("./routes/wallet-page"),
  "WalletPage"
);
/** The chosen service, when the URL names one; anything else is no choice. */
const ServicesSearch = Schema.Struct({
  service: Schema.optional(ServiceName),
});
const decodeServicesSearch = Schema.decodeUnknownResult(ServicesSearch);
type ServicesSearch = typeof ServicesSearch.Type;

/** What the router hands over: whatever the URL held under that key. */
interface ServicesSearchInput {
  readonly service?: unknown;
}

/** Only a known service survives; anything else is no choice. */
const servicesSearch = (raw: ServicesSearchInput): ServicesSearch => {
  const decoded = decodeServicesSearch(raw);
  return decoded._tag === "Success" ? decoded.success : {};
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
    chatRoute,
    walletRoute,
    servicesRoute,
    agentsRoute,
    settingsRoute,
  ]),
  browserRoute,
  oauthAuthorizeRoute,
  oauthManualRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
