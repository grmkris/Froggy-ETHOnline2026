/**
 * The frame around every page: the rail on a desktop, the tab bar on a
 * phone, and the small print about the connection above the page.
 *
 * Exactly one navigation is in the document at a time, so a screen reader
 * finds one "Primary" landmark, not two with one of them hidden.
 */

import type { ServiceModes } from "@froggy/protocol";
import { useLocation } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import type { ReactElement, ReactNode } from "react";

import { keyboardInteraction, UI_EASE } from "../../lib/motion";
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
}): ReactElement => {
  const pathname = useLocation({ select: (location) => location.pathname });
  const reduced = useReducedMotion() === true;
  const instant = keyboardInteraction();
  return (
    <div className="flex h-dvh">
      {phone ? null : <SideNav waiting={waiting} />}
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col ${phone ? "pb-[calc(3.5rem+env(safe-area-inset-bottom))]" : ""}`}
      >
        <TopBar connected={connected} modes={modes} phone={phone} />
        <motion.main
          animate={{ opacity: 1 }}
          className="flex min-h-0 flex-1 flex-col"
          initial={instant ? false : { opacity: reduced ? 0.8 : 0.4 }}
          key={pathname}
          transition={{ duration: instant ? 0 : 0.125, ease: UI_EASE }}
        >
          {children}
        </motion.main>
      </div>
      {phone ? <TabBar waiting={waiting} /> : null}
    </div>
  );
};
