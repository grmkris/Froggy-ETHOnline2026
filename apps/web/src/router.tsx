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

const routeTree = rootRoute.addChildren([workspaceRoute, browserRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
