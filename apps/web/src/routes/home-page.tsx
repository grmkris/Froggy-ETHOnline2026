import { Skeleton } from "@froggy/ui/components/skeleton";
import { Navigate } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { useSetup } from "../hooks/use-setup";
import { useIdentity } from "../lib/privy";
import { ChatPage } from "./chat-page";

const useWelcomeGate = (): "welcome" | "waiting" | "home" => {
  const identity = useIdentity();
  const setup = useSetup();
  if (identity.stubbed || setup.failed) {
    return "home";
  }
  if (setup.seenAt === undefined) {
    return "waiting";
  }
  return setup.seenAt === null ? "welcome" : "home";
};

const HomeSkeleton = (): ReactElement => (
  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    <output
      aria-label="Loading home"
      className="mx-auto flex w-full max-w-2xl flex-col gap-3.5 px-4 py-6 sm:py-10"
    >
      <Skeleton className="size-12 rounded-full" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </output>
  </div>
);

export const HomePage = (): ReactElement => {
  const gate = useWelcomeGate();
  if (gate === "welcome") {
    return <Navigate replace to="/welcome" />;
  }
  return gate === "home" ? <ChatPage /> : <HomeSkeleton />;
};
