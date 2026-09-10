import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import type { ReactElement } from "react";

import { UI_SPRING } from "../../lib/motion";
import { NAV_ITEMS } from "../../lib/nav";
import { NavLink } from "./nav-link";

/**
 * The phone navigation: three destinations, and nothing behind a "More".
 *
 * It had four slots and a popover holding three further places. With three
 * primary destinations there is nothing left to hide, so the popover is gone
 * and every destination is one tap away.
 */
export const PillNav = ({
  waiting,
}: {
  readonly waiting: number;
}): ReactElement => {
  const reduced = useReducedMotion() === true;
  const nav = useRef<HTMLElement>(null);
  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-[max(0.75rem,env(safe-area-inset-left),env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      ref={nav}
    >
      <LayoutGroup id="workspace-navigation">
        <motion.div
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          initial={{
            opacity: 0,
            transform: reduced ? "none" : "translateY(20px)",
          }}
          transition={reduced ? { duration: 0.125 } : UI_SPRING}
          data-slot="navigation-pill"
          className="bg-paper-deep/95 shadow-float pointer-events-auto grid w-full max-w-xs grid-cols-3 gap-1 rounded-full p-1.5 backdrop-blur-md"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              item={item}
              key={item.to}
              waiting={item.to === "/" ? waiting : 0}
            />
          ))}
        </motion.div>
      </LayoutGroup>
    </nav>
  );
};
