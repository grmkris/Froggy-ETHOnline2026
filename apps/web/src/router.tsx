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

const routeTree = rootRoute.addChildren([workspaceRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
