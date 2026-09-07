import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";

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
const servicesRoute = page(
  "/services",
  async () => await import("./routes/services-page"),
  "ServicesPage"
);
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

const routeTree = rootRoute.addChildren([
  workspaceRoute.addChildren([
    chatRoute,
    walletRoute,
    servicesRoute,
    agentsRoute,
    settingsRoute,
  ]),
  browserRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
