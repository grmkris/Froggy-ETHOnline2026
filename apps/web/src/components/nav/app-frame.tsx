/**
 * The frame around every page: the rail on a desktop, the tab bar on a
 * phone, and the small print about the connection above the page.
 *
 * Exactly one navigation is in the document at a time, so a screen reader
 * finds one "Primary" landmark, not two with one of them hidden.
 */

import type { ServiceModes } from "@froggy/protocol";
import type { ReactElement, ReactNode } from "react";

import { TopBar } from "../top-bar";
import { SideNav } from "./side-nav";
import { TabBar } from "./tab-bar";

export const AppFrame = ({
  children,
  connected,
  modes,
  phone,
  waiting,
}: {
  readonly children: ReactNode;
  readonly connected: boolean;
  readonly modes: ServiceModes | null;
  readonly phone: boolean;
  /** Approval questions open, shown as a dot on the chat. */
  readonly waiting: number;
}): ReactElement => (
  <div className="flex h-dvh">
    {phone ? null : <SideNav waiting={waiting} />}
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col ${phone ? "pb-[calc(3.5rem+env(safe-area-inset-bottom))]" : ""}`}
    >
      <TopBar connected={connected} modes={modes} phone={phone} />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
    {phone ? <TabBar waiting={waiting} /> : null}
  </div>
);
