/** One workspace frame and one floating navigation, clear of the composer and safe area. */

import type { ServiceModes } from "@froggy/protocol";
import type { ReactElement, ReactNode } from "react";

import { useMediaQuery } from "../../hooks/use-media-query";
import { TopBar } from "../top-bar";
import { AppRail } from "./app-rail";
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
}): ReactElement => {
  // One primary navigation at a time: the rail replaces the pill rather than
  // hiding it, so assistive technology never sees two.
  const wide = useMediaQuery("(min-width: 768px)");
  return (
    <div
      className={
        wide
          ? "flex h-dvh"
          : "flex h-dvh flex-col pb-[calc(5.25rem+env(safe-area-inset-bottom))]"
      }
    >
      {wide ? <AppRail waiting={waiting} /> : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar connected={connected} modes={modes} />
        <main
          className="flex min-h-0 flex-1 flex-col"
          data-slot="workspace-page"
        >
          {children}
        </main>
      </div>
      {wide ? null : <PillNav waiting={waiting} />}
    </div>
  );
};
