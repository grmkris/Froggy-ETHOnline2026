/** One workspace frame and one floating navigation, clear of the composer and safe area. */

import type { ServiceModes } from "@froggy/protocol";
import type { ReactElement, ReactNode } from "react";

import { TopBar } from "../top-bar";
import { PillNav } from "./pill-nav";

export const AppFrame = ({
  children,
  connected,
  modes,
  waiting,
}: {
  readonly children: ReactNode;
  readonly connected: boolean;
  readonly modes: ServiceModes | null;
  /** Approval questions open, shown as a dot on the chat. */
  readonly waiting: number;
}): ReactElement => (
  <div className="flex h-dvh flex-col pb-[calc(5.25rem+env(safe-area-inset-bottom))]">
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <TopBar connected={connected} modes={modes} />
      <main className="flex min-h-0 flex-1 flex-col" data-slot="workspace-page">
        {children}
      </main>
    </div>
    <PillNav waiting={waiting} />
  </div>
);
