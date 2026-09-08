/** One workspace frame and one floating navigation, clear of the composer and safe area. */

import type { ServiceModes } from "@froggy/protocol";
import { useLocation } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import type { ReactElement, ReactNode } from "react";

import { keyboardInteraction, UI_EASE } from "../../lib/motion";
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
}): ReactElement => {
  const pathname = useLocation({ select: (location) => location.pathname });
  const reduced = useReducedMotion() === true;
  const instant = keyboardInteraction();
  return (
    <div className="flex h-dvh flex-col pb-[calc(5.25rem+env(safe-area-inset-bottom))]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar connected={connected} modes={modes} />
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
      <PillNav waiting={waiting} />
    </div>
  );
};
