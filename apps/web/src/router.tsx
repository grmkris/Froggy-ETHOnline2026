import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";

import { AppShell } from "./components/app-shell";

const rootRoute = createRootRoute({ component: AppShell });

const workspaceRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/workspace-page"),
    "WorkspacePage"
  ),
  getParentRoute: () => rootRoute,
  path: "/",
});

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
  workspaceRoute,
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
