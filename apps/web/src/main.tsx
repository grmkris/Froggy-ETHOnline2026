import "@froggy/ui/globals.css";
import { TooltipProvider } from "@froggy/ui/components/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { IdentityProvider } from "./lib/privy";
import { initializeTheme } from "./lib/theme";
import { router } from "./router";

initializeTheme();

const root = document.querySelector("#root");
if (!root) {
  throw new Error("Missing #root mount point");
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <IdentityProvider>
        <TooltipProvider>
          <MotionConfig reducedMotion="user">
            <RouterProvider router={router} />
          </MotionConfig>
        </TooltipProvider>
      </IdentityProvider>
    </QueryClientProvider>
  </StrictMode>
);
